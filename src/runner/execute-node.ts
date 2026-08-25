import { dirname, resolve } from "node:path"
import { appendExecutionLog } from "../logging/execution"
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

export async function executeNode(args: { workflow: WorkflowDefinition; workflowPath: string; step: WorkflowStep; runId: string; event: TriggerEvent; input: unknown; workspace: string }): Promise<unknown> {
  const write = (level: "DEBUG" | "INFO" | "WARN" | "ERROR", values: unknown[]) => appendExecutionLog(args.workspace, args.workflow.id, args.runId, level, `node:${args.step.id}`, ...values)
  const originalConsole = { debug: console.debug, log: console.log, info: console.info, warn: console.warn, error: console.error }
  console.debug = (...values) => write("DEBUG", values)
  console.log = (...values) => write("INFO", values)
  console.info = (...values) => write("INFO", values)
  console.warn = (...values) => write("WARN", values)
  console.error = (...values) => write("ERROR", values)

  try {
  const absolute = resolve(dirname(args.workflowPath), args.step.node)
  const module = await import(`${Bun.pathToFileURL(absolute).href}?run=${args.runId}-${Date.now()}`)
  const definition = (module.default ?? module) as NodeDefinition
  const run = definition.run ?? module.run ?? (typeof module.default === "function" ? module.default : undefined)
  if (typeof run !== "function") throw new Error(`Node ${args.step.id} does not export run()`)
  const input = await validateSchema(definition.input, args.input)
  const context: NodeContext = { input, params: args.step.params ?? {}, workflow: { id: args.workflow.id, runId: args.runId }, node: { id: args.step.id }, trigger: { type: args.event.type, data: args.event.data }, env: process.env as Record<string, string | undefined>, log: { debug: (...v) => write("DEBUG", v), info: (...v) => write("INFO", v), warn: (...v) => write("WARN", v), error: (...v) => write("ERROR", v) } }
  return validateSchema(definition.output, await run.call(definition, context))
  } finally {
    console.debug = originalConsole.debug
    console.log = originalConsole.log
    console.info = originalConsole.info
    console.warn = originalConsole.warn
    console.error = originalConsole.error
  }
}
