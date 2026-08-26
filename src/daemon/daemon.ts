import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { applyConfiguredEnvironment } from "../config/environment"
import { loadAItomatorConfig } from "../config/load-config"
import { openDatabase } from "../database/db"
import { recoverInterruptedRuns } from "../database/runs"
import { runtimeDir } from "../lib/paths"
import { workflowFiles } from "../workflow/loader"
import { RunCoordinator } from "./coordinator"
import { WorkflowRegistry } from "./registry"
import { Scheduler } from "./scheduler"
import { startControlSocket } from "./socket"
import { controlRequest } from "./socket"
import { startHttpServer } from "../triggers/http"

export async function startDaemon(from = process.cwd()): Promise<void> {
  const config = await loadAItomatorConfig(from); applyConfiguredEnvironment(config)
  const dir = runtimeDir(config.workspace); mkdirSync(dir, { recursive: true })
  const socketPath = join(dir, "aitomator.sock"), pidPath = join(dir, "aitomator.pid")
  if (existsSync(socketPath)) { try { const status = await controlRequest(socketPath, { action: "status" }); if (status.ok) throw new Error(`AItomator is already running (pid ${status.pid})`) } catch (error) { if (error instanceof Error && error.message.startsWith("AItomator is already")) throw error } }
  const db = openDatabase(config.database); recoverInterruptedRuns(db)
  const registry = new WorkflowRegistry(config.workspace, db); const loaded = await registry.reload()
  if (loaded.errors.length) console.error("Some workflows were not loaded:", JSON.stringify(loaded.errors, null, 2))
  const coordinator = new RunCoordinator(config, db, registry); const scheduler = new Scheduler(config.workspace, db, registry, coordinator)
  let stopping = false, http: any, socket: any
  const shutdown = () => { if (stopping) return; stopping = true; scheduler.stop(); clearInterval(watcher); try { http.stop(true) } catch {}; try { socket.stop(true) } catch {}; db.close(); try { Bun.file(pidPath).delete() } catch {}; try { Bun.file(socketPath).delete() } catch {}; process.exit(0) }
  socket = startControlSocket(socketPath, registry, coordinator, shutdown); http = startHttpServer(config, registry, coordinator); scheduler.start(); await coordinator.pump(); writeFileSync(pidPath, String(process.pid))
  let signature = fileSignature(config.workspace); const watcher = setInterval(async () => { const next = fileSignature(config.workspace); if (next !== signature) { signature = next; const result = await registry.reload(); if (result.errors.length) console.error("Reload rejected:", JSON.stringify(result.errors)); else console.log(`Reloaded ${result.loaded} workflows`) } }, 1000)
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown)
  console.log(`AItomator daemon ${process.pid} running (${loaded.loaded} workflows, http://${config.http.host}:${config.http.port})`)
  await new Promise(() => {})
}
function fileSignature(workspace: string): string { const files = [join(workspace, "aitomator.config.ts"), ...workflowFiles(workspace)]; return files.filter(existsSync).map(path => `${path}:${statSync(path).mtimeMs}:${statSync(path).size}`).join("|") }
