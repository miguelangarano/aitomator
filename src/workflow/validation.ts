import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { loadWorkflows, type LoadedWorkflow } from "./loader"
import type { WorkflowDefinition } from "./types"

export interface ValidationError { workflow?: string; node?: string; path: string; message: string }
export interface ValidationResult { valid: boolean; errors: ValidationError[]; workflows: number }

export function parseDuration(value: string): number | null { const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(value); if (!match) return null; return Number(match[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]!] ?? 0) }
export function validCron(expression: string): boolean { const parts = expression.trim().split(/\s+/); return parts.length === 5 && parts.every(part => /^(\*|\*\/\d+|\d+(?:-\d+)?(?:,\d+)*)$/.test(part)) }

export async function validateWorkflow(item: LoadedWorkflow): Promise<ValidationError[]> {
  const w = item.definition; const errors: ValidationError[] = []; const add = (path: string, message: string, node?: string) => errors.push({ workflow: w?.id, node, path, message })
  if (!w || typeof w !== "object") return [{ path: "default", message: "Default export must be a workflow object" }]
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(w.id ?? "")) add("id", "ID must contain lowercase letters, digits, dashes, or underscores")
  if (!["manual", "http", "cron", "poll"].includes(w.trigger?.type)) add("trigger.type", "Trigger must be manual, http, cron, or poll")
  if (!Array.isArray(w.steps)) add("steps", "Steps must be an array")
  if ((w.concurrency?.maxRuns ?? 1) < 1) add("concurrency.maxRuns", "Concurrency must be at least 1")
  if (w.concurrency?.overflow && !["queue", "drop"].includes(w.concurrency.overflow)) add("concurrency.overflow", "Overflow must be queue or drop")
  if (w.trigger?.type === "http") { if (!w.trigger.path?.startsWith("/")) add("trigger.path", "HTTP path must start with /"); if (w.trigger.auth?.type === "bearer" && !w.trigger.auth.env) add("trigger.auth.env", "Bearer auth requires an environment variable") }
  if (w.trigger?.type === "cron" && !validCron(w.trigger.expression)) add("trigger.expression", "Invalid five-field cron expression")
  if (w.trigger?.type === "poll") { if (!parseDuration(w.trigger.every)) add("trigger.every", "Invalid poll interval (examples: 30s, 5m)"); await validateNode(w.trigger.node, "trigger.node", "poll", item.path, add, true) }
  const ids = new Set<string>()
  for (const [index, step] of (w.steps ?? []).entries()) { if (!step?.id) add(`steps[${index}].id`, "Step ID is required"); else if (ids.has(step.id)) add(`steps[${index}].id`, `Duplicate step ID: ${step.id}`); else ids.add(step.id); await validateNode(step?.node, `steps[${index}].node`, step?.id, item.path, add) }
  return errors
}

async function validateNode(nodePath: string, field: string, id: string, workflowPath: string, add: (path: string, message: string, node?: string) => void, poll = false): Promise<void> {
  if (!nodePath) return add(field, "Node path is required", id)
  const absolute = resolve(dirname(workflowPath), nodePath)
  if (!existsSync(absolute)) return add(field, `File does not exist: ${nodePath}`, id)
  try { const mod = await import(`${Bun.pathToFileURL(absolute).href}?validate=${Date.now()}`); const definition = mod.default ?? mod; const fn = poll ? (definition.poll ?? mod.poll ?? definition.run ?? mod.run) : (definition.run ?? mod.run ?? (typeof definition === "function" ? definition : undefined)); if (typeof fn !== "function") add(field, `Module must export ${poll ? "poll() or run()" : "run()"}`, id) } catch (error) { add(field, `Cannot import node: ${error instanceof Error ? error.message : error}`, id) }
}

export async function validateWorkspace(workspace: string, only?: string): Promise<ValidationResult> {
  let workflows: LoadedWorkflow[] = []; const errors: ValidationError[] = []
  try { workflows = await loadWorkflows(workspace, true) } catch (error) { errors.push({ path: "workflows", message: error instanceof Error ? error.message : String(error) }) }
  if (only) workflows = workflows.filter(w => w.definition?.id === only)
  if (only && workflows.length === 0) errors.push({ workflow: only, path: "id", message: `Workflow not found: ${only}` })
  const ids = new Map<string, string>(); const routes = new Map<string, string>()
  for (const item of workflows) { const id = item.definition?.id; if (id && ids.has(id)) errors.push({ workflow: id, path: "id", message: `Duplicate workflow ID in ${ids.get(id)} and ${item.path}` }); else if (id) ids.set(id, item.path); const trigger = item.definition?.trigger; if (trigger?.type === "http") { const key = `${(trigger.method ?? "POST").toUpperCase()} ${trigger.path}`; if (routes.has(key)) errors.push({ workflow: id, path: "trigger.path", message: `HTTP route conflicts with ${routes.get(key)}` }); else routes.set(key, id) } errors.push(...await validateWorkflow(item)) }
  return { valid: errors.length === 0, errors, workflows: workflows.length }
}
