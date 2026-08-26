import { existsSync } from "node:fs"
import { join } from "node:path"
import type { AItomatorConfig } from "../workflow/types"
import { findWorkspace, resolveWorkspacePath } from "../lib/paths"
export async function loadAItomatorConfig(from = process.cwd()): Promise<AItomatorConfig> {
  const workspace = findWorkspace(from)
  const defaults: AItomatorConfig = { workspace, database: join(workspace, "data", "aitomator.db"), http: { host: "127.0.0.1", port: 8787 }, concurrency: { maxRuns: 2, defaultWorkflowMaxRuns: 1 }, logging: { level: "info" }, env: {} }
  const configPath = join(workspace, "aitomator.config.ts"); let configured: Partial<AItomatorConfig> = {}
  if (existsSync(configPath)) configured = (await import(`${Bun.pathToFileURL(configPath).href}?v=${Date.now()}`)).default ?? {}
  const result: AItomatorConfig = { ...defaults, ...configured, workspace: configured.workspace ? resolveWorkspacePath(workspace, configured.workspace) : workspace, http: { ...defaults.http, ...configured.http }, concurrency: { ...defaults.concurrency, ...configured.concurrency }, logging: { ...defaults.logging, ...configured.logging }, env: { ...defaults.env, ...configured.env }, database: configured.database ? resolveWorkspacePath(workspace, configured.database) : defaults.database }
  if (process.env.AITOMATOR_DATABASE_PATH) result.database = resolveWorkspacePath(workspace, process.env.AITOMATOR_DATABASE_PATH)
  if (process.env.AITOMATOR_HTTP_HOST) result.http.host = process.env.AITOMATOR_HTTP_HOST
  if (process.env.AITOMATOR_HTTP_PORT) result.http.port = Number(process.env.AITOMATOR_HTTP_PORT)
  if (process.env.AITOMATOR_MAX_RUNS) result.concurrency.maxRuns = Number(process.env.AITOMATOR_MAX_RUNS)
  if (process.env.AITOMATOR_LOG_LEVEL) result.logging.level = process.env.AITOMATOR_LOG_LEVEL as AItomatorConfig["logging"]["level"]
  result.database = resolveWorkspacePath(result.workspace, result.database); return result
}
