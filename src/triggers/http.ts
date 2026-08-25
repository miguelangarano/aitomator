import type { AItomatorConfig } from "../workflow/types"
import { event } from "../daemon/scheduler"
import type { WorkflowRegistry } from "../daemon/registry"
import type { RunCoordinator } from "../daemon/coordinator"

export function startHttpServer(config: AItomatorConfig, registry: WorkflowRegistry, coordinator: RunCoordinator): ReturnType<typeof Bun.serve> {
  return Bun.serve({ hostname: config.http.host, port: config.http.port, async fetch(request) {
    const url = new URL(request.url)
    for (const item of registry.list(false)) { const trigger = item.definition.trigger; if (trigger.type !== "http" || (trigger.method ?? "POST").toUpperCase() !== request.method) continue; const params = matchPath(trigger.path, url.pathname); if (!params) continue
      if (trigger.auth?.type === "bearer") { const secret = process.env[trigger.auth.env]; if (!secret) return Response.json({ ok: false, code: "AUTH_NOT_CONFIGURED" }, { status: 503 }); if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 }) }
      let body: unknown = null; const text = await request.text(); if (text) { try { body = JSON.parse(text) } catch { body = text } }
      const run = coordinator.submit(item.definition.id, event("http", { method: request.method, path: url.pathname, params, query: Object.fromEntries(url.searchParams), headers: Object.fromEntries(request.headers), body }))
      return Response.json({ runId: run.id, workflow: run.workflow_id, status: run.status }, { status: run.status === "dropped" ? 429 : 202 })
    }
    return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 })
  } })
}
function matchPath(pattern: string, path: string): Record<string, string> | null { const expected = pattern.split("/").filter(Boolean), actual = path.split("/").filter(Boolean); if (expected.length !== actual.length) return null; const params: Record<string, string> = {}; for (let i = 0; i < expected.length; i++) { const part = expected[i]!; if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(actual[i]!); else if (part !== actual[i]) return null } return params }
