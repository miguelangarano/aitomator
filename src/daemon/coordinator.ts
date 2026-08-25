import type { Database } from "bun:sqlite"
import { join } from "node:path"
import type { AItomatorConfig, TriggerEvent } from "../workflow/types"
import { createRun, markRunRunning, queuedRuns, runningCount } from "../database/runs"
import type { WorkflowRegistry } from "./registry"

export class RunCoordinator {
  private pumping = false
  constructor(private config: AItomatorConfig, private db: Database, private registry: WorkflowRegistry) {}
  submit(workflowId: string, event: TriggerEvent) {
    const item = this.registry.get(workflowId); if (!item) throw new Error(`Workflow not found: ${workflowId}`)
    if (!this.registry.enabled(item)) throw new Error(`Workflow is disabled: ${workflowId}`)
    const max = item.definition.concurrency?.maxRuns ?? this.config.concurrency.defaultWorkflowMaxRuns
    const busy = runningCount(this.db, workflowId) >= max
    const status = busy && item.definition.concurrency?.overflow === "drop" ? "dropped" : "queued"
    const run = createRun(this.db, item.definition, item.path, event, status); if (status === "queued") void this.pump(); return run
  }
  async pump(): Promise<void> {
    if (this.pumping) return; this.pumping = true
    try { for (const run of queuedRuns(this.db)) { if (runningCount(this.db) >= this.config.concurrency.maxRuns) break; const item = this.registry.get(run.workflow_id); if (!item || !this.registry.enabled(item)) continue; const max = item.definition.concurrency?.maxRuns ?? this.config.concurrency.defaultWorkflowMaxRuns; if (runningCount(this.db, run.workflow_id) >= max) continue; this.spawn(run.id) } } finally { this.pumping = false }
  }
  private spawn(runId: string): void {
    const runner = join(import.meta.dir, "..", "runner", "main.ts")
    const child = Bun.spawn([process.execPath, runner, "--run-id", runId, "--database", this.config.database, "--workspace", this.config.workspace], { cwd: this.config.workspace, env: process.env, stdin: "ignore", stdout: "inherit", stderr: "inherit" })
    markRunRunning(this.db, runId, child.pid)
    void child.exited.then(() => this.pump())
  }
}
