import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { NodeContext, NodeDefinition, TriggerEvent, WorkflowDefinition, WorkflowStep } from "../workflow/types"

async function validateSchema(schema: NodeDefinition["input"], value: unknown): Promise<unknown> {
  if (!schema) return value
  if (typeof schema.parse === "function") return schema.parse(value)
  if (schema["~standard"]?.validate) {
    const result = await schema["~standard"].validate(value) as { value?: unknown; issues?: unknown[] }
    if (result.issues?.length) throw new Error(`Schema validation failed: ${JSON.stringify(result.issues)}`)
    return result.value
  }
  throw new Error("Schema must implement parse() or Standard Schema")
}

export async function executeNode(args: { workflow: WorkflowDefinition; workflowPath: string; step: WorkflowStep; runId: string; event: TriggerEvent; input: unknown; logPath: string }): Promise<unknown> {
  const absolute = resolve(dirname(args.workflowPath), args.step.node)
  const module = await import(`${Bun.pathToFileURL(absolute).href}?run=${args.runId}-${Date.now()}`)
  const definition = (module.default ?? module) as NodeDefinition
  const run = definition.run ?? module.run ?? (typeof module.default === "function" ? module.default : undefined)
  if (typeof run !== "function") throw new Error(`Node ${args.step.id} does not export run()`)
  mkdirSync(dirname(args.logPath), { recursive: true })
  const write = (level: string, values: unknown[]) => { const line = `${new Date().toISOString()} ${level.padEnd(5)} [${args.workflow.id}/${args.runId}/${args.step.id}] ${values.map(format).join(" ")}\n`; appendFileSync(args.logPath, line); if (level === "ERROR") console.error(line.trimEnd()) }
  const input = await validateSchema(definition.input, args.input)
  const context: NodeContext = { input, params: args.step.params ?? {}, workflow: { id: args.workflow.id, runId: args.runId }, node: { id: args.step.id }, trigger: { type: args.event.type, data: args.event.data }, env: process.env as Record<string, string | undefined>, log: { debug: (...v) => write("DEBUG", v), info: (...v) => write("INFO", v), warn: (...v) => write("WARN", v), error: (...v) => write("ERROR", v) } }
  return validateSchema(definition.output, await run.call(definition, context))
}

function format(value: unknown): string { if (typeof value === "string") return value; try { return JSON.stringify(value) } catch { return String(value) } }
