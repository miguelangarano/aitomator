import type { Database } from "bun:sqlite"
import { join } from "node:path"
import { configuredEnvironment } from "../config/environment"
import type { AItomatorConfig, TriggerEvent } from "../workflow/types"
import { createRun, getRun, markRunRunning, queuedRuns, runningCount } from "../database/runs"
import { appendExecutionLog, initializeExecutionLog } from "../logging/execution"
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
    const run = createRun(this.db, item.definition, item.path, event, status)
    initializeExecutionLog(this.config.workspace, run.workflow_id, run.id)
    appendExecutionLog(this.config.workspace, run.workflow_id, run.id, status === "dropped" ? "WARN" : "INFO", "daemon", `Execution ${status} from ${event.type} trigger`)
    if (status === "queued") void this.pump(); return run
  }
  async pump(): Promise<void> {
    if (this.pumping) return; this.pumping = true
    try { for (const run of queuedRuns(this.db)) { if (runningCount(this.db) >= this.config.concurrency.maxRuns) break; const item = this.registry.get(run.workflow_id); if (!item || !this.registry.enabled(item)) continue; const max = item.definition.concurrency?.maxRuns ?? this.config.concurrency.defaultWorkflowMaxRuns; if (runningCount(this.db, run.workflow_id) >= max) continue; this.spawn(run.id) } } finally { this.pumping = false }
  }
  private spawn(runId: string): void {
    const run = getRun(this.db, runId); if (!run) return
    const runner = join(import.meta.dir, "..", "runner", "main.ts")
    const child = Bun.spawn([process.execPath, runner, "--run-id", runId, "--database", this.config.database, "--workspace", this.config.workspace], { cwd: this.config.workspace, env: configuredEnvironment(this.config), stdin: "ignore", stdout: "inherit", stderr: "inherit" })
    markRunRunning(this.db, runId, child.pid)
    appendExecutionLog(this.config.workspace, run.workflow_id, run.id, "INFO", "daemon", `Runner started pid=${child.pid}`)
    void child.exited.then(code => { const finished = getRun(this.db, run.id); appendExecutionLog(this.config.workspace, run.workflow_id, run.id, code === 0 ? "INFO" : "ERROR", "daemon", `Runner exited code=${code} status=${finished?.status ?? "unknown"}`); return this.pump() })
  }
}
