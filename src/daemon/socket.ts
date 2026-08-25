import { existsSync, unlinkSync } from "node:fs"
import type { WorkflowRegistry } from "./registry"
import type { RunCoordinator } from "./coordinator"
import { event } from "./scheduler"

export interface ControlRequest { action: string; [key: string]: unknown }
export function startControlSocket(path: string, registry: WorkflowRegistry, coordinator: RunCoordinator, shutdown: () => void): any {
  if (existsSync(path)) unlinkSync(path)
  return Bun.listen<string>({ unix: path, socket: {
    open(socket) { socket.data = "" },
    data(socket, chunk) { socket.data += Buffer.from(chunk).toString("utf8"); if (!socket.data.includes("\n")) return; const raw = socket.data.slice(0, socket.data.indexOf("\n")); socket.data = ""; void handle(raw).then(result => { socket.write(`${JSON.stringify(result)}\n`); socket.end() }) },
    error(_socket, error) { console.error("Control socket error:", error) },
  } })
  async function handle(raw: string): Promise<unknown> { try { const request = JSON.parse(raw) as ControlRequest; if (request.action === "status") return { ok: true, pid: process.pid, workflows: registry.list().length }; if (request.action === "reload") return { ok: true, ...await registry.reload() }; if (request.action === "workflow-list") return { ok: true, workflows: registry.list().map(w => ({ ...w.definition, path: w.path, enabled: registry.enabled(w) })) }; if (request.action === "run") { const run = coordinator.submit(String(request.workflow), event("manual", request.input)); return { ok: true, runId: run.id, workflow: run.workflow_id, status: run.status } } if (request.action === "shutdown") { setTimeout(shutdown, 20); return { ok: true } } return { ok: false, code: "UNKNOWN_ACTION", message: `Unknown action: ${request.action}` } } catch (error) { return { ok: false, code: "REQUEST_FAILED", message: error instanceof Error ? error.message : String(error) } } }
}

export async function controlRequest(path: string, request: ControlRequest): Promise<any> {
  return new Promise(async (resolve, reject) => { let response = ""; const timeout = setTimeout(() => reject(new Error("Daemon request timed out")), 5000); try { await Bun.connect<string>({ unix: path, socket: { open(socket) { socket.data = ""; socket.write(`${JSON.stringify(request)}\n`) }, data(socket, chunk) { response += Buffer.from(chunk).toString("utf8"); if (response.includes("\n")) { clearTimeout(timeout); socket.end(); try { resolve(JSON.parse(response.trim())) } catch (error) { reject(error) } } }, error(_socket, error) { clearTimeout(timeout); reject(error) } } }) } catch (error) { clearTimeout(timeout); reject(error) } })
}
