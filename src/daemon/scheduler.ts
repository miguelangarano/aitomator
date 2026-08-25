import type { Database } from "bun:sqlite"
import { newId } from "../database/runs"
import { parseJson, stringify } from "../lib/json"
import { executePoll } from "../runner/execute-workflow"
import { cronMatches } from "../triggers/cron"
import { parseDuration } from "../workflow/validation"
import type { TriggerEvent } from "../workflow/types"
import type { RunCoordinator } from "./coordinator"
import type { WorkflowRegistry } from "./registry"

export class Scheduler {
  private timer?: Timer; private pollDue = new Map<string, number>(); private lastCronMinute = ""
  constructor(private workspace: string, private db: Database, private registry: WorkflowRegistry, private coordinator: RunCoordinator) {}
  start(): void { this.timer = setInterval(() => void this.tick(), 1000); void this.tick() }
  stop(): void { if (this.timer) clearInterval(this.timer) }
  private async tick(): Promise<void> {
    const now = new Date(); const minute = now.toISOString().slice(0, 16)
    for (const item of this.registry.list(false)) {
      const trigger = item.definition.trigger
      if (trigger.type === "cron" && minute !== this.lastCronMinute && cronMatches(trigger.expression, now, trigger.timezone)) this.coordinator.submit(item.definition.id, event("cron", { scheduledAt: now.toISOString() }))
      if (trigger.type === "poll" && (this.pollDue.get(item.definition.id) ?? 0) <= Date.now()) { this.pollDue.set(item.definition.id, Date.now() + (parseDuration(trigger.every) ?? 60000)); void this.poll(item) }
    }
    this.lastCronMinute = minute; await this.coordinator.pump()
  }
  private async poll(item: ReturnType<WorkflowRegistry["list"]>[number]): Promise<void> {
    const row = this.db.prepare("SELECT state_json,state_hash FROM poll_state WHERE workflow_id=?").get(item.definition.id) as { state_json: string | null; state_hash: string | null } | null
    try { const result = await executePoll(item.definition, item.path, newId("poll"), parseJson(row?.state_json), this.workspace); const stateJson = stringify(result.state) ?? "null"; const hash = Bun.hash(stateJson).toString(); this.db.prepare("INSERT INTO poll_state VALUES (?,?,?,?) ON CONFLICT(workflow_id) DO UPDATE SET state_json=excluded.state_json,state_hash=excluded.state_hash,updated_at=excluded.updated_at").run(item.definition.id, stateJson, hash, new Date().toISOString()); if (result.events) for (const data of result.events) this.coordinator.submit(item.definition.id, event("poll", data)); else if (row && row.state_hash !== hash) this.coordinator.submit(item.definition.id, event("poll", result.state)) } catch (error) { console.error(`Poll failed for ${item.definition.id}:`, error) }
  }
}
export function event(type: TriggerEvent["type"], data: unknown): TriggerEvent { return { id: newId("evt"), type, timestamp: new Date().toISOString(), data } }
