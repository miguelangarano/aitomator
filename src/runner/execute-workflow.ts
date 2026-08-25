import type { Database } from "bun:sqlite"
import { dirname, resolve } from "node:path"
import { errorMessage, parseJson, stringify } from "../lib/json"
import { appendExecutionLog, initializeExecutionLog } from "../logging/execution"
import type { RunRecord, TriggerEvent, WorkflowDefinition } from "../workflow/types"
import { loadWorkflow } from "../workflow/loader"
import { executeNode } from "./execute-node"

export async function executeWorkflow(db: Database, run: RunRecord, workspace: string): Promise<unknown> {
  initializeExecutionLog(workspace, run.workflow_id, run.id)
  appendExecutionLog(workspace, run.workflow_id, run.id, "INFO", "runner", "Loading workflow")
  try {
    const workflow = await loadWorkflow(run.workflow_path, true); const event = parseJson(run.trigger_payload, {}) as TriggerEvent
    let input: unknown = event.data
    appendExecutionLog(workspace, run.workflow_id, run.id, "INFO", "runner", `Started ${workflow.steps.length} step(s)`)
    for (const [position, step] of workflow.steps.entries()) {
      const started = new Date().toISOString(); const insert = db.prepare("INSERT INTO step_runs (workflow_run_id,step_id,position,status,input_json,started_at) VALUES (?,?,?,?,?,?)").run(run.id, step.id, position, "running", stringify(input), started)
      appendExecutionLog(workspace, run.workflow_id, run.id, "INFO", "runner", `Starting step ${position + 1}: ${step.id}`)
      try { input = await executeNode({ workflow, workflowPath: run.workflow_path, step, runId: run.id, event, input, workspace }); db.prepare("UPDATE step_runs SET status='success',output_json=?,finished_at=? WHERE id=?").run(stringify(input), new Date().toISOString(), Number(insert.lastInsertRowid)); appendExecutionLog(workspace, run.workflow_id, run.id, "INFO", "runner", `Completed step ${position + 1}: ${step.id}`) }
      catch (error) { const message = errorMessage(error); db.prepare("UPDATE step_runs SET status='failed',error=?,finished_at=? WHERE id=?").run(message, new Date().toISOString(), Number(insert.lastInsertRowid)); appendExecutionLog(workspace, run.workflow_id, run.id, "ERROR", "runner", `Failed step ${position + 1}: ${step.id}`, message); throw error }
    }
    db.prepare("UPDATE workflow_runs SET status='success',output_json=?,finished_at=?,runner_pid=NULL WHERE id=?").run(stringify(input), new Date().toISOString(), run.id); appendExecutionLog(workspace, run.workflow_id, run.id, "INFO", "runner", "Execution completed successfully"); return input
  } catch (error) { const message = errorMessage(error); db.prepare("UPDATE workflow_runs SET status='failed',error=?,finished_at=?,runner_pid=NULL WHERE id=?").run(message, new Date().toISOString(), run.id); appendExecutionLog(workspace, run.workflow_id, run.id, "ERROR", "runner", "Execution failed", message); throw error }
}

export async function executePoll(workflow: WorkflowDefinition, workflowPath: string, runId: string, previousState: unknown, workspace: string): Promise<{ state: unknown; events?: unknown[] }> {
  if (workflow.trigger.type !== "poll") throw new Error("Not a poll workflow")
  const step = { id: "poll", node: workflow.trigger.node }; const event: TriggerEvent = { id: runId, type: "poll", timestamp: new Date().toISOString(), data: { previousState } }
  const absolute = resolve(dirname(workflowPath), workflow.trigger.node)
  const module = await import(`${Bun.pathToFileURL(absolute).href}?poll=${Date.now()}`); const definition = module.default ?? module; const poll = definition.poll ?? module.poll ?? definition.run ?? module.run
  if (typeof poll !== "function") throw new Error("Poll node must export poll() or run()")
  const result = await poll({ input: previousState, params: {}, workflow: { id: workflow.id, runId }, node: { id: step.id }, trigger: { type: "poll", data: { previousState } }, env: process.env, log: console })
  if (result && typeof result === "object" && "state" in result) return result
  return { state: result }
}
