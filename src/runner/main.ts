#!/usr/bin/env bun
import { openDatabase } from "../database/db"
import { getRun } from "../database/runs"
import { executeWorkflow } from "./execute-workflow"

const values = Bun.argv.slice(2); const option = (name: string) => { const i = values.indexOf(name); return i >= 0 ? values[i + 1] : undefined }
const runId = option("--run-id"), database = option("--database"), workspace = option("--workspace")
if (!runId || !database || !workspace) { console.error("runner requires --run-id, --database, and --workspace"); process.exit(2) }
const db = openDatabase(database); const run = getRun(db, runId)
if (!run) { console.error(`Run not found: ${runId}`); process.exit(3) }
try { await executeWorkflow(db, run, workspace) } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 7 } finally { db.close() }
