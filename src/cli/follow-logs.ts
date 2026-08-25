import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { openDatabase } from "../database/db"
import { getRun, listRuns } from "../database/runs"

export interface FollowLogOptions {
  workspace: string
  database: string
  workflowId?: string
  runId?: string
  lines?: number
  initialRuns?: number
  pollInterval?: number
  signal?: AbortSignal
  write?: (chunk: string | Uint8Array) => void
}

export async function followWorkflowLogs(options: FollowLogOptions): Promise<void> {
  const db = openDatabase(options.database)
  const logDir = join(options.workspace, "data", "logs")
  const offsets = new Map<string, number>()
  const initialRuns = options.initialRuns ?? 20
  const lines = options.lines ?? 100
  const write = options.write ?? ((chunk: string | Uint8Array) => { process.stdout.write(chunk) })
  let firstPass = true

  if (options.runId && !getRun(db, options.runId)) {
    db.close()
    throw new Error(`Run not found: ${options.runId}`)
  }

  try {
    while (!options.signal?.aborted) {
      const records = options.runId ? [getRun(db, options.runId)!] : listRuns(db, 500, options.workflowId)

      for (const [index, record] of records.entries()) {
        const path = join(logDir, `${record.id}.log`)
        if (!existsSync(path)) continue

        const content = readFileSync(path)
        const previous = offsets.get(path)

        if (previous === undefined) {
          if (!firstPass || index < initialRuns) write(tailLines(content.toString("utf8"), lines))
        } else if (content.byteLength < previous) {
          write(tailLines(content.toString("utf8"), lines))
        } else if (content.byteLength > previous) {
          write(content.subarray(previous))
        }

        offsets.set(path, content.byteLength)
      }

      firstPass = false
      await Bun.sleep(options.pollInterval ?? 250)
    }
  } finally {
    db.close()
  }
}

export function tailLines(content: string, count: number): string {
  if (count <= 0 || !content) return ""
  const hasTrailingNewline = content.endsWith("\n")
  const lines = content.split("\n")
  if (hasTrailingNewline) lines.pop()
  const result = lines.slice(-count).join("\n")
  return result ? `${result}${hasTrailingNewline ? "\n" : ""}` : ""
}
