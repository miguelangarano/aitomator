import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

export function openDatabase(path: string): Database {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;")
  migrate(db)
  return db
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, workflow_path TEXT NOT NULL,
      trigger_type TEXT NOT NULL, trigger_payload TEXT, status TEXT NOT NULL,
      queued_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, runner_pid INTEGER,
      error TEXT, output_json TEXT
    );
    CREATE TABLE IF NOT EXISTS step_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_run_id TEXT NOT NULL,
      step_id TEXT NOT NULL, position INTEGER NOT NULL, status TEXT NOT NULL,
      input_json TEXT, output_json TEXT, started_at TEXT, finished_at TEXT, error TEXT
    );
    CREATE TABLE IF NOT EXISTS poll_state (
      workflow_id TEXT PRIMARY KEY, state_json TEXT, state_hash TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_settings (
      workflow_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_status_queued ON workflow_runs(status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_runs_workflow ON workflow_runs(workflow_id, queued_at DESC);
    CREATE INDEX IF NOT EXISTS idx_steps_run ON step_runs(workflow_run_id, position);
  `)
}
