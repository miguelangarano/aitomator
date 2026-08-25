#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { loadAItomatorConfig } from "../config/load-config"
import { openDatabase } from "../database/db"
import { createRun, getRun, listRuns, markRunRunning, retryRun, setWorkflowEnabled, stepsForRun } from "../database/runs"
import { findWorkspace, runtimeDir } from "../lib/paths"
import { parseJson } from "../lib/json"
import { startDaemon } from "../daemon/daemon"
import { controlRequest } from "../daemon/socket"
import { event } from "../daemon/scheduler"
import { renderGraph } from "../graph/render"
import { findWorkflow, loadWorkflows } from "../workflow/loader"
import { validateWorkspace } from "../workflow/validation"
import { createNode, createWorkflow, initWorkspace } from "./scaffold"
import { followWorkflowLogs } from "./follow-logs"
import { fail, hasFlag, option, print } from "./output"
import { activateService, controlService, deactivateService, enableUserLinger, installService, isServiceActive, isServiceInstalled, servicePath, showServiceLogs, uninstallService } from "./service"

const argv = process.argv.slice(2), command = argv[0], args = argv.slice(1), json = hasFlag(argv, "--json")
const packageVersion = (JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "package.json"), "utf8")) as { version: string }).version

try {
  switch (command) {
    case "init": await init(); break
    case "start": await start(); break
    case "stop": await stop(); break
    case "restart": await restart(); break
    case "status": await status(); break
    case "logs": await logs(); break
    case "workflow": await workflow(); break
    case "node": await node(); break
    case "run": await run(); break
    case "runs": await runs(); break
    case "validate": await validate(); break
    case "graph": await graph(); break
    case "doctor": await doctor(); break
    case "deps": await deps(); break
    case "service": await service(); break
    case "capabilities": capabilities(); break
    case "skill": skill(); break
    case "version": case "--version": case "-v": console.log(`AItomator v${packageVersion}`); break
    case "help": case "--help": case "-h": case undefined: help(); break
    default: fail("UNKNOWN_COMMAND", `Unknown command: ${command}`, 1)
  }
} catch (error) { fail("COMMAND_FAILED", error instanceof Error ? error.message : String(error), 1) }

async function init(): Promise<void> {
  const root = option(args, "--path") ? resolve(option(args, "--path")!) : process.cwd(), created = initWorkspace(root)
  print(json ? { ok: true, workspace: root, created } : created.length ? `Initialized AItomator in ${root}\n${created.map(p => `  created ${relative(root, p)}`).join("\n")}` : `AItomator is already initialized in ${root}`, json)
}

async function start(): Promise<void> {
  if (!hasFlag(args, "--background")) return startDaemon()
  const workspace = findWorkspace(), path = installService(workspace), activation = activateService(path), linger = enableUserLinger()
  if (!activation.active) fail("SERVICE_START_FAILED", activation.message ?? "Unable to start background service", 1)
  print(json ? { ok: true, background: true, path, linger } : `AItomator is running in the background\nService: ${path}${linger.enabled ? "\nStarts automatically at boot" : `\nWarning: could not enable start-at-boot after logout: ${linger.message}`}`, json)
}

async function stop(): Promise<void> {
  if (isServiceInstalled() && isServiceActive()) { const result = controlService("stop"); if (!result.ok) fail("SERVICE_STOP_FAILED", result.output, 1); return print(json ? { ok: true, background: true } : "Stopped AItomator background service", json) }
  await daemonAction("shutdown", "Stopped AItomator")
}

async function status(): Promise<void> {
  const socket = join(runtimeDir(findWorkspace()), "aitomator.sock")
  try { const response = await controlRequest(socket, { action: "status" }); print(json ? response : `AItomator is running (pid ${response.pid}, ${response.workflows} workflows)`, json) }
  catch { const result = { ok: false, running: false, message: "AItomator daemon is not running" }; if (json) print(result, true); else console.log(result.message); process.exitCode = 6 }
}
async function daemonAction(action: string, message: string): Promise<void> { const result = await controlRequest(join(runtimeDir(findWorkspace()), "aitomator.sock"), { action }); if (!result.ok) throw new Error(result.message); if (message) print(json ? result : message, json) }
async function restart(): Promise<void> { if (isServiceInstalled()) { const result = controlService("restart"); if (!result.ok) fail("SERVICE_RESTART_FAILED", result.output, 1); return print(json ? { ok: true, background: true } : "Restarted AItomator background service", json) } try { await daemonAction("shutdown", "") } catch {}; await Bun.sleep(150); await startDaemon() }

async function workflow(): Promise<void> {
  const sub = args[0], rest = args.slice(1), config = await loadAItomatorConfig()
  if (sub === "list") {
    const db = openDatabase(config.database), loaded = await loadWorkflows(config.workspace, true)
    const rows = loaded.map(i => ({ id: i.definition.id, name: i.definition.name ?? i.definition.id, trigger: i.definition.trigger.type, enabled: ((db.prepare("SELECT enabled FROM workflow_settings WHERE workflow_id=?").get(i.definition.id) as any)?.enabled ?? (i.definition.enabled !== false ? 1 : 0)) === 1, path: relative(config.workspace, i.path) })); db.close()
    if (json) print({ workflows: rows }, true); else console.log(rows.length ? rows.map(r => `${r.enabled ? "●" : "○"} ${r.id.padEnd(24)} ${r.trigger.padEnd(8)} ${r.path}`).join("\n") : "No workflows found")
  } else if (sub === "describe") {
    const id = rest[0]; if (!id) fail("USAGE", "Usage: aitomator workflow describe <id>", 2); const item = await findWorkflow(config.workspace, id); if (!item) fail("WORKFLOW_NOT_FOUND", `Workflow not found: ${id}`, 3)
    print(json ? { ...item.definition, path: item.path } : `${item.definition.name ?? item.definition.id}\nID: ${item.definition.id}\nTrigger: ${JSON.stringify(item.definition.trigger)}\nSteps: ${item.definition.steps.map(s => s.id).join(" -> ")}`, json)
  } else if (sub === "create") {
    const id = rest[0], trigger = option(rest, "--trigger") ?? "manual"; if (!id) fail("USAGE", "Usage: aitomator workflow create <id> --trigger <type>", 2); const paths = createWorkflow(config.workspace, id, trigger)
    print(json ? { ok: true, workflow: id, created: paths } : `Created workflow ${id}\n${paths.map(p => `  ${relative(config.workspace, p)}`).join("\n")}`, json)
  } else if (sub === "enable" || sub === "disable") {
    const id = rest[0]; if (!id || !await findWorkflow(config.workspace, id)) fail("WORKFLOW_NOT_FOUND", `Workflow not found: ${id ?? ""}`, 3); const db = openDatabase(config.database); setWorkflowEnabled(db, id, sub === "enable"); db.close(); print(json ? { ok: true, workflow: id, enabled: sub === "enable" } : `${sub === "enable" ? "Enabled" : "Disabled"} ${id}`, json)
  } else if (sub === "reload") {
    const socket = join(runtimeDir(config.workspace), "aitomator.sock")
    try { const response = await controlRequest(socket, { action: "reload" }); print(json ? response : response.errors?.length ? `Reload rejected: ${JSON.stringify(response.errors)}` : `Reloaded ${response.loaded} workflows`, json); if (response.errors?.length) process.exitCode = 5 }
    catch { const result = await validateWorkspace(config.workspace, rest[0]); print(json ? result : result.valid ? `Validated ${result.workflows} workflows (daemon not running)` : formatErrors(result.errors), json) }
  } else if (sub === "remove") {
    const id = rest[0]; if (!id) fail("USAGE", "Usage: aitomator workflow remove <id> --force", 2); if (!hasFlag(rest, "--force")) fail("CONFIRMATION_REQUIRED", "Pass --force to remove the workflow definition", 2); const item = await findWorkflow(config.workspace, id); if (!item) fail("WORKFLOW_NOT_FOUND", `Workflow not found: ${id}`, 3); unlinkSync(item.path); print(json ? { ok: true, removed: item.path } : `Removed ${relative(config.workspace, item.path)} (node files were preserved)`, json)
  } else fail("USAGE", "Usage: aitomator workflow <create|list|describe|enable|disable|remove|reload>", 2)
}

async function node(): Promise<void> {
  const sub = args[0], id = args[1], config = await loadAItomatorConfig(); if (!id) fail("USAGE", "Usage: aitomator node <create|inspect> <id>", 2)
  if (sub === "create") { const path = createNode(config.workspace, id); print(json ? { ok: true, path } : `Created ${relative(config.workspace, path)}`, json) }
  else if (sub === "inspect") { const path = join(config.workspace, "nodes", `${id}.ts`); if (!existsSync(path)) fail("NODE_NOT_FOUND", `Node not found: ${id}`, 3); const mod = await import(`${Bun.pathToFileURL(path).href}?inspect=${Date.now()}`), definition = mod.default ?? mod; print({ path, run: typeof (definition.run ?? mod.run ?? (typeof definition === "function" ? definition : undefined)) === "function", inputSchema: Boolean(definition.input), outputSchema: Boolean(definition.output) }, json) }
  else fail("USAGE", "Usage: aitomator node <create|inspect> <id>", 2)
}

async function run(): Promise<void> {
  const id = args[0]; if (!id) fail("USAGE", "Usage: aitomator run <workflow> [--input JSON|--stdin] [--wait]", 2)
  let input: unknown = {}; if (hasFlag(args, "--stdin")) input = JSON.parse(await Bun.stdin.text()); else if (option(args, "--input")) input = JSON.parse(option(args, "--input")!)
  const config = await loadAItomatorConfig(), item = await findWorkflow(config.workspace, id); if (!item) fail("WORKFLOW_NOT_FOUND", `Workflow not found: ${id}`, 3)
  const validation = await validateWorkspace(config.workspace, id); if (!validation.valid) fail("WORKFLOW_VALIDATION_FAILED", `Workflow ${id} is invalid`, 5, validation.errors)
  const socket = join(runtimeDir(config.workspace), "aitomator.sock"); let result: any
  try { result = await controlRequest(socket, { action: "run", workflow: id, input }) }
  catch {
    const db = openDatabase(config.database), record = createRun(db, item.definition, item.path, event("manual", input))
    const runner = join(import.meta.dir, "..", "runner", "main.ts"), child = Bun.spawn([process.execPath, runner, "--run-id", record.id, "--database", config.database, "--workspace", config.workspace], { cwd: config.workspace, env: process.env, stdin: "ignore", stdout: "inherit", stderr: "inherit" }); markRunRunning(db, record.id, child.pid)
    const exitCode = await child.exited, finished = getRun(db, record.id); result = { ok: exitCode === 0, runId: record.id, workflow: id, status: finished?.status ?? "failed", output: parseJson(finished?.output_json), error: finished?.error }
    if (exitCode !== 0) { db.close(); if (json) print(result, true); process.exit(7) }
    db.close()
  }
  if (hasFlag(args, "--wait") && result.status === "queued") result = await waitForRun(config.database, result.runId)
  print(json ? result : `${result.runId}  ${result.workflow}  ${result.status}`, json)
}
async function waitForRun(database: string, id: string): Promise<any> { const db = openDatabase(database), deadline = Date.now() + Number(option(args, "--timeout") ?? 300000); while (Date.now() < deadline) { const record = getRun(db, id); if (record && !["queued", "running"].includes(record.status)) { db.close(); return { runId: record.id, workflow: record.workflow_id, status: record.status, output: parseJson(record.output_json), error: record.error } } await Bun.sleep(100) } db.close(); throw new Error(`Timed out waiting for run ${id}`) }

async function runs(): Promise<void> {
  const sub = args[0], config = await loadAItomatorConfig(), db = openDatabase(config.database)
  if (sub === "list") { const records = listRuns(db, Number(option(args, "--limit") ?? 50), option(args, "--workflow")); if (json) print({ runs: records.map(publicRun) }, true); else console.log(records.length ? records.map(r => `${r.id.padEnd(28)} ${r.workflow_id.padEnd(24)} ${r.status.padEnd(8)} ${r.queued_at}`).join("\n") : "No runs found") }
  else if (sub === "get") { const record = getRun(db, args[1] ?? ""); if (!record) fail("RUN_NOT_FOUND", `Run not found: ${args[1] ?? ""}`, 3); const value = { ...publicRun(record), triggerEvent: parseJson(record.trigger_payload), steps: stepsForRun(db, record.id).map((step: any) => ({ ...step, input: parseJson(step.input_json), output: parseJson(step.output_json) })) }; print(json ? value : formatRun(value), json) }
  else if (sub === "retry") { const original = getRun(db, args[1] ?? ""); if (!original) fail("RUN_NOT_FOUND", `Run not found: ${args[1] ?? ""}`, 3); const record = retryRun(db, original); print(json ? publicRun(record) : `Queued retry ${record.id}`, json) }
  else fail("USAGE", "Usage: aitomator runs <list|get|retry>", 2); db.close()
}

async function validate(): Promise<void> { const config = await loadAItomatorConfig(), id = args.find(a => !a.startsWith("-")); const result = await validateWorkspace(config.workspace, id); print(json ? result : result.valid ? `Valid: ${result.workflows} workflow${result.workflows === 1 ? "" : "s"}` : formatErrors(result.errors), json); if (!result.valid) process.exitCode = 5 }
async function graph(): Promise<void> { const id = args[0]; if (!id) fail("USAGE", "Usage: aitomator graph <workflow> [--format ascii|compact|mermaid|json]", 2); const config = await loadAItomatorConfig(), item = await findWorkflow(config.workspace, id); if (!item) fail("WORKFLOW_NOT_FOUND", `Workflow not found: ${id}`, 3); const format = hasFlag(args, "--compact") ? "compact" : (option(args, "--format") ?? "ascii"); if (!["ascii", "compact", "mermaid", "json"].includes(format)) fail("INVALID_FORMAT", `Unknown graph format: ${format}`, 2); console.log(renderGraph(item.definition, format as any)) }
async function logs(): Promise<void> { const config = await loadAItomatorConfig(); if (hasFlag(args, "--daemon")) { const code = await showServiceLogs(config.workspace, hasFlag(args, "--follow"), Number(option(args, "--lines") ?? 100)); if (code) process.exitCode = code; return } const runId = option(args, "--run"), workflowId = option(args, "--workflow"); if (hasFlag(args, "--follow")) return followWorkflowLogs({ workspace: config.workspace, database: config.database, runId, workflowId, lines: Number(option(args, "--lines") ?? 100), initialRuns: Number(option(args, "--limit") ?? 20) }); const dir = join(config.workspace, "data", "logs"); let files = runId ? [`${runId}.log`] : existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".log")).sort().reverse() : []; if (workflowId) { const db = openDatabase(config.database), ids = new Set(listRuns(db, 500, workflowId).map(r => `${r.id}.log`)); db.close(); files = files.filter(f => ids.has(f)) } process.stdout.write(files.slice(0, Number(option(args, "--limit") ?? 20)).map(f => existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "").join("") || "No logs found\n") }
async function doctor(): Promise<void> { const config = await loadAItomatorConfig(), validation = await validateWorkspace(config.workspace); const checks = [{ name: "bun", ok: Boolean(Bun.version), detail: Bun.version }, { name: "workspace", ok: existsSync(config.workspace), detail: config.workspace }, { name: "config", ok: existsSync(join(config.workspace, "aitomator.config.ts")), detail: join(config.workspace, "aitomator.config.ts") }, { name: "database", ok: (() => { try { openDatabase(config.database).close(); return true } catch { return false } })(), detail: config.database }, { name: "workflows", ok: validation.valid, detail: `${validation.workflows} found` }]; print(json ? { ok: checks.every(c => c.ok), checks, validation } : checks.map(c => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`).join("\n"), json); if (!checks.every(c => c.ok)) process.exitCode = 1 }

async function deps(): Promise<void> { const sub = args[0], packages = args.slice(1).filter(a => !a.startsWith("-")), workspace = findWorkspace(); if (sub === "list") { const pkg = JSON.parse(readFileSync(join(workspace, "package.json"), "utf8")), dependencies = pkg.dependencies ?? {}; print(json ? { dependencies } : Object.entries(dependencies).map(([k, v]) => `${k}@${v}`).join("\n"), json) } else if (sub === "add" || sub === "remove") { if (!packages.length) fail("USAGE", `Usage: aitomator deps ${sub} <package...>`, 2); const child = Bun.spawn([process.execPath, sub, ...packages], { cwd: workspace, stdout: "inherit", stderr: "inherit", stdin: "inherit" }); const code = await child.exited; if (code) process.exit(code) } else if (sub === "sync") { const child = Bun.spawn([process.execPath, "install"], { cwd: workspace, stdout: "inherit", stderr: "inherit", stdin: "inherit" }); const code = await child.exited; if (code) process.exit(code) } else fail("USAGE", "Usage: aitomator deps <add|remove|list|sync>", 2) }
async function service(): Promise<void> { const sub = args[0], workspace = findWorkspace(); if (sub === "install") { const path = installService(workspace), activation = activateService(path), linger = enableUserLinger(); print(json ? { ok: activation.active, path, ...activation, linger } : activation.active ? `Installed and started AItomator via ${path}${linger.enabled ? "\nStarts automatically at boot" : `\nWarning: ${linger.message}`}` : `Installed service definition at ${path}\nActivation was unavailable: ${activation.message ?? "unknown error"}`, json) } else if (sub === "uninstall") { const path = servicePath(); deactivateService(path); const removed = uninstallService(); print(json ? { ok: true, removed, path } : removed ? "Stopped and removed the AItomator service" : "Service definition was not installed", json) } else if (["start", "stop", "restart", "status"].includes(sub ?? "")) { if (!isServiceInstalled()) fail("SERVICE_NOT_INSTALLED", "Run aitomator start --background first", 3); const result = controlService(sub as "start" | "stop" | "restart" | "status"); if (json) print({ ok: result.ok, action: sub, output: result.output }, true); else if (result.output) console.log(result.output); else console.log(`${sub} completed`); if (!result.ok) process.exitCode = 1 } else if (sub === "logs") { const code = await showServiceLogs(workspace, hasFlag(args, "--follow"), Number(option(args, "--lines") ?? 100)); if (code) process.exitCode = code } else fail("USAGE", "Usage: aitomator service <install|uninstall|start|stop|restart|status|logs>", 2) }

function capabilities(): void { print({ version: packageVersion, runtime: "bun", triggers: ["http", "cron", "poll", "manual"], nodeLanguage: "typescript", features: { parallelRuns: true, schemas: true, env: true, sqlite: true, hotReload: true, backgroundService: true, workflowGraphs: true } }, json) }
function skill(): void { const markdown = readFileSync(join(import.meta.dir, "..", "..", "skill", "skill.md"), "utf8"); print(json ? { format: "markdown", content: markdown } : markdown, json) }
function publicRun(run: any): any { return { id: run.id, workflow: run.workflow_id, trigger: run.trigger_type, status: run.status, queuedAt: run.queued_at, startedAt: run.started_at, finishedAt: run.finished_at, output: parseJson(run.output_json), error: run.error } }
function formatErrors(errors: any[]): string { return errors.map(e => `${e.workflow ? `${e.workflow}: ` : ""}${e.path}: ${e.message}`).join("\n") }
function formatRun(run: any): string { return [`Workflow: ${run.workflow}`, `Run: ${run.id}`, `Status: ${run.status}`, "", "Steps", ...run.steps.map((s: any) => `  ${s.position + 1}. ${s.step_id.padEnd(24)} ${s.status}`), ...(run.error ? ["", "Error", `  ${run.error}`] : [])].join("\n") }
function help(): void { console.log(`AItomator - a tiny, agent-friendly TypeScript workflow daemon\n\nUsage: aitomator <command> [options]\n\n  init                         Initialize a workspace\n  start [--background]         Start in foreground or as an always-on service\n  stop | restart | status      Control the daemon or background service\n  logs [selectors] [--follow]  Stream workflow, run, or daemon logs\n  workflow <command>           Create, list, describe, enable, disable, remove, reload\n  node <create|inspect>        Manage TypeScript nodes\n  run <workflow>               Start a manual run\n  runs <list|get|retry>        Inspect run history\n  validate [workflow]          Validate workflow files\n  graph <workflow>             Render ascii, compact, Mermaid, or JSON\n  deps <add|remove|list|sync>  Manage shared dependencies\n  service <command>            Manage and inspect the background service\n  capabilities --json         Discover machine-readable capabilities\n  skill [--json]               Print the bundled agent guide\n  doctor                       Run diagnostics\n\nGlobal conventions: --json, --quiet, --non-interactive`) }
