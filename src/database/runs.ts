import type { Database } from "bun:sqlite"
import type { RunRecord, TriggerEvent, WorkflowDefinition } from "../workflow/types"
import { stringify } from "../lib/json"

export function newId(prefix = "run"): string { return `${prefix}_${Date.now().toString(36)}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}` }

export function createRun(db: Database, workflow: WorkflowDefinition, workflowPath: string, event: TriggerEvent, status: "queued" | "dropped" = "queued"): RunRecord {
  const run: RunRecord = { id: newId(), workflow_id: workflow.id, workflow_path: workflowPath, trigger_type: event.type, trigger_payload: stringify(event), status, queued_at: new Date().toISOString(), started_at: null, finished_at: status === "dropped" ? new Date().toISOString() : null, runner_pid: null, error: status === "dropped" ? "Concurrency limit reached; overflow policy is drop" : null, output_json: null }
  db.prepare(`INSERT INTO workflow_runs (id,workflow_id,workflow_path,trigger_type,trigger_payload,status,queued_at,started_at,finished_at,runner_pid,error,output_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(run.id, run.workflow_id, run.workflow_path, run.trigger_type, run.trigger_payload, run.status, run.queued_at, run.started_at, run.finished_at, run.runner_pid, run.error, run.output_json)
  return run
}

export function getRun(db: Database, id: string): RunRecord | null { return db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id) as RunRecord | null }
export function listRuns(db: Database, limit = 50, workflow?: string): RunRecord[] {
  return (workflow ? db.prepare("SELECT * FROM workflow_runs WHERE workflow_id=? ORDER BY queued_at DESC LIMIT ?").all(workflow, limit) : db.prepare("SELECT * FROM workflow_runs ORDER BY queued_at DESC LIMIT ?").all(limit)) as RunRecord[]
}
export function queuedRuns(db: Database): RunRecord[] { return db.prepare("SELECT * FROM workflow_runs WHERE status='queued' ORDER BY queued_at ASC").all() as RunRecord[] }
export function runningCount(db: Database, workflow?: string): number { const row = workflow ? db.prepare("SELECT count(*) count FROM workflow_runs WHERE status='running' AND workflow_id=?").get(workflow) : db.prepare("SELECT count(*) count FROM workflow_runs WHERE status='running'").get(); return Number((row as { count: number }).count) }
export function markRunRunning(db: Database, id: string, pid: number): void { db.prepare("UPDATE workflow_runs SET status='running',started_at=?,runner_pid=? WHERE id=?").run(new Date().toISOString(), pid, id) }
export function recoverInterruptedRuns(db: Database): void { db.prepare("UPDATE workflow_runs SET status='queued',started_at=NULL,runner_pid=NULL,error='Recovered after daemon restart' WHERE status='running'").run() }
export function retryRun(db: Database, original: RunRecord): RunRecord { const event = JSON.parse(original.trigger_payload ?? "{}") as TriggerEvent; const workflow = { id: original.workflow_id } as WorkflowDefinition; return createRun(db, workflow, original.workflow_path, { ...event, id: newId("evt"), timestamp: new Date().toISOString() }) }
export function stepsForRun(db: Database, id: string): unknown[] { return db.prepare("SELECT * FROM step_runs WHERE workflow_run_id=? ORDER BY position").all(id) }

export function setWorkflowEnabled(db: Database, id: string, enabled: boolean): void { db.prepare("INSERT INTO workflow_settings VALUES (?,?,?) ON CONFLICT(workflow_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at").run(id, enabled ? 1 : 0, new Date().toISOString()) }
export function workflowEnabled(db: Database, id: string, defaultValue = true): boolean { const row = db.prepare("SELECT enabled FROM workflow_settings WHERE workflow_id=?").get(id) as { enabled: number } | null; return row ? row.enabled === 1 : defaultValue }
