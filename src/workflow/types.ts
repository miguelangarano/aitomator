export type TriggerType = "http" | "cron" | "poll" | "manual"
export type OverflowPolicy = "queue" | "drop"
export interface SchemaLike<T = unknown> { parse?: (value: unknown) => T; "~standard"?: { validate: (value: unknown) => unknown } }
export interface NodeContext<TInput = unknown, TParams = unknown> {
  input: TInput; params: TParams
  workflow: { id: string; runId: string }; node: { id: string }
  trigger: { type: TriggerType; data: unknown }; env: Record<string, string | undefined>
  log: { debug(...args: unknown[]): void; info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
}
export interface NodeDefinition<TInput = unknown, TOutput = unknown, TParams = unknown> {
  input?: SchemaLike<TInput>; output?: SchemaLike<TOutput>; run(ctx: NodeContext<TInput, TParams>): TOutput | Promise<TOutput>
}
export interface WorkflowStep { id: string; node: string; params?: unknown }
export interface ManualTrigger { type: "manual" }
export interface HttpTrigger { type: "http"; method?: string; path: string; auth?: { type: "bearer"; env: string } }
export interface CronTrigger { type: "cron"; expression: string; timezone?: string }
export interface PollTrigger { type: "poll"; every: string; node: string }
export type WorkflowTrigger = ManualTrigger | HttpTrigger | CronTrigger | PollTrigger
export interface WorkflowDefinition {
  id: string; name?: string; description?: string; enabled?: boolean; trigger: WorkflowTrigger
  concurrency?: { maxRuns?: number; overflow?: OverflowPolicy }; steps: WorkflowStep[]
}
export interface TriggerEvent<T = unknown> { id: string; type: TriggerType; timestamp: string; data: T }
export type RunStatus = "queued" | "running" | "success" | "failed" | "dropped"
export interface RunRecord {
  id: string; workflow_id: string; workflow_path: string; trigger_type: TriggerType; trigger_payload: string | null
  status: RunStatus; queued_at: string; started_at: string | null; finished_at: string | null
  runner_pid: number | null; error: string | null; output_json: string | null
}
export interface AItomatorConfig {
  workspace: string; database: string; http: { host: string; port: number }
  concurrency: { maxRuns: number; defaultWorkflowMaxRuns: number }
  logging: { level: "debug" | "info" | "warn" | "error" }
}
