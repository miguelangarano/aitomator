import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDatabase } from "../src/database/db"
import { createRun, getRun, markRunRunning, stepsForRun } from "../src/database/runs"
import { renderGraph } from "../src/graph/render"
import { executeWorkflow } from "../src/runner/execute-workflow"
import { createWorkflow, initWorkspace } from "../src/cli/scaffold"
import { event } from "../src/daemon/scheduler"
import { cronMatches } from "../src/triggers/cron"
import { findWorkflow } from "../src/workflow/loader"
import { parseDuration, validateWorkspace } from "../src/workflow/validation"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function workspace(): string { const root = join(tmpdir(), `aitomator-test-${crypto.randomUUID()}`); roots.push(root); mkdirSync(join(root, "node_modules"), { recursive: true }); symlinkSync(join(import.meta.dir, ".."), join(root, "node_modules", "aitomator"), "dir"); initWorkspace(root); return root }

describe("workflow execution", () => {
  test("chains node output and persists run and step history", async () => {
    const root = workspace(); mkdirSync(join(root, "workflows"), { recursive: true }); mkdirSync(join(root, "nodes"), { recursive: true })
    writeFileSync(join(root, "workflows", "chain.workflow.ts"), `export default { id: "chain", trigger: { type: "manual" }, steps: [{ id: "one", node: "../nodes/one.ts" }, { id: "two", node: "../nodes/two.ts" }] }`)
    writeFileSync(join(root, "nodes", "one.ts"), `export async function run(ctx) { return { value: ctx.input.value + 1 } }`)
    writeFileSync(join(root, "nodes", "two.ts"), `export default { input: { parse(value) { if (typeof value.value !== "number") throw new Error("invalid"); return value } }, async run(ctx) { return { value: ctx.input.value * 2 } } }`)
    const item = await findWorkflow(root, "chain"); expect(item).not.toBeNull(); const db = openDatabase(join(root, "data", "test.db")); const record = createRun(db, item!.definition, item!.path, event("manual", { value: 2 })); markRunRunning(db, record.id, process.pid)
    expect(await executeWorkflow(db, { ...record, status: "running" }, root)).toEqual({ value: 6 }); expect(getRun(db, record.id)?.status).toBe("success"); expect(stepsForRun(db, record.id)).toHaveLength(2); db.close()
  })

  test("persists node failures without throwing into the daemon", async () => {
    const root = workspace(); createWorkflow(root, "broken", "manual"); writeFileSync(join(root, "nodes", "broken.ts"), `export function run() { throw new Error("boom") }`)
    const item = await findWorkflow(root, "broken"), db = openDatabase(join(root, "data", "test.db")); const record = createRun(db, item!.definition, item!.path, event("manual", {})); markRunRunning(db, record.id, process.pid)
    await expect(executeWorkflow(db, { ...record, status: "running" }, root)).rejects.toThrow("boom"); expect(getRun(db, record.id)?.status).toBe("failed"); expect(getRun(db, record.id)?.error).toContain("boom"); db.close()
  })
})

test("scaffold is valid and graphs render in every format", async () => {
  const root = workspace(); createWorkflow(root, "hello", "http"); const result = await validateWorkspace(root); expect(result).toEqual({ valid: true, errors: [], workflows: 1 }); const item = await findWorkflow(root, "hello"); expect(renderGraph(item!.definition)).toContain("[POST /hello]"); expect(renderGraph(item!.definition, "compact")).toContain("-> hello"); expect(renderGraph(item!.definition, "mermaid")).toContain("flowchart TD"); expect(JSON.parse(renderGraph(item!.definition, "json")).workflow).toBe("hello")
})

test("duration and cron scheduling helpers are deterministic", () => { expect(parseDuration("60s")).toBe(60000); expect(parseDuration("2h")).toBe(7200000); expect(parseDuration("soon")).toBeNull(); const date = new Date("2026-08-25T14:30:00Z"); expect(cronMatches("30 14 * * *", date)).toBe(true); expect(cronMatches("*/10 * * * *", date)).toBe(true); expect(cronMatches("31 14 * * *", date)).toBe(false) })
