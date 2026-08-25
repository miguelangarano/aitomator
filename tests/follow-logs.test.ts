import { afterEach, expect, test } from "bun:test"
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRun } from "../src/database/runs"
import { openDatabase } from "../src/database/db"
import { followWorkflowLogs, tailLines } from "../src/cli/follow-logs"
import { executionLogPath, initializeExecutionLog } from "../src/logging/execution"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test("tailLines returns the requested trailing lines", () => {
  expect(tailLines("one\ntwo\nthree\n", 2)).toBe("two\nthree\n")
  expect(tailLines("one\ntwo\nthree", 2)).toBe("two\nthree")
})

test("tailLines handles empty and disabled tails", () => {
  expect(tailLines("", 10)).toBe("")
  expect(tailLines("one\n", 0)).toBe("")
})

test("follows appended logs and new runs for one workflow", async () => {
  const root = join(tmpdir(), `aitomator-follow-${crypto.randomUUID()}`)
  roots.push(root)
  mkdirSync(join(root, "data"), { recursive: true })
  const database = join(root, "data", "test.db")
  const db = openDatabase(database)
  const workflow = { id: "target", trigger: { type: "manual" as const }, steps: [] }
  const trigger = { id: "event", type: "manual" as const, timestamp: new Date().toISOString(), data: {} }
  const first = createRun(db, workflow, join(root, "target.workflow.ts"), trigger)
  initializeExecutionLog(root, workflow.id, first.id)
  writeFileSync(executionLogPath(root, workflow.id, first.id), "first line\n")

  const output: string[] = []
  const controller = new AbortController()
  const following = followWorkflowLogs({ workspace: root, database, workflowId: "target", pollInterval: 10, signal: controller.signal, write: chunk => output.push(Buffer.from(chunk).toString("utf8")) })

  await Bun.sleep(30)
  appendFileSync(executionLogPath(root, workflow.id, first.id), "appended line\n")
  const second = createRun(db, workflow, join(root, "target.workflow.ts"), { ...trigger, id: "event-2" })
  initializeExecutionLog(root, workflow.id, second.id)
  writeFileSync(executionLogPath(root, workflow.id, second.id), "new run line\n")
  await Bun.sleep(40)
  controller.abort()
  await following
  db.close()

  expect(output.join("")).toContain("first line\n")
  expect(output.join("")).toContain("appended line\n")
  expect(output.join("")).toContain("new run line\n")
})
