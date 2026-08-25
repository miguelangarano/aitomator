import { appendFileSync, closeSync, existsSync, mkdirSync, openSync } from "node:fs"
import { join } from "node:path"

export type ExecutionLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export function executionDirectory(workspace: string, workflowId: string, executionId: string): string {
  return join(workspace, "executions", workflowId, executionId)
}

export function executionLogPath(workspace: string, workflowId: string, executionId: string): string {
  return join(executionDirectory(workspace, workflowId, executionId), "execution.log")
}

export function initializeExecutionLog(workspace: string, workflowId: string, executionId: string): string {
  const directory = executionDirectory(workspace, workflowId, executionId)
  const path = executionLogPath(workspace, workflowId, executionId)
  mkdirSync(directory, { recursive: true })
  if (!existsSync(path)) closeSync(openSync(path, "a"))
  return path
}

export function appendExecutionLog(workspace: string, workflowId: string, executionId: string, level: ExecutionLogLevel, source: string, ...values: unknown[]): void {
  const path = initializeExecutionLog(workspace, workflowId, executionId)
  appendFileSync(path, `${new Date().toISOString()} ${level.padEnd(5)} [${source}] ${values.map(formatLogValue).join(" ")}\n`)
}

export function formatLogValue(value: unknown): string {
  if (typeof value === "string") return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

export function legacyExecutionLogPath(workspace: string, executionId: string): string {
  return join(workspace, "data", "logs", `${executionId}.log`)
}
