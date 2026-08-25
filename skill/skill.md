# AItomator agent guide

AItomator is a Bun-native workflow daemon. A workspace contains `aitomator.config.ts`, `workflows/*.workflow.ts`, `nodes/*.ts`, and runtime data under `data/`.

Use this loop:

1. `aitomator capabilities --json`
2. `aitomator workflow list --json`
3. Create with `aitomator workflow create <id> --trigger manual|http|cron|poll --non-interactive`.
4. Edit ordinary TypeScript nodes. A node exports `run(ctx)` or uses `defineNode({ run })`.
5. Add packages with `aitomator deps add <package...>`.
6. Run `aitomator validate --json`, fix every error, then `aitomator workflow reload`.
7. Inspect with `aitomator graph <id>` and test with `aitomator run <id> --input '{"key":"value"}' --wait`.
8. Inspect failures with `aitomator runs get <run-id> --json` and `aitomator logs --run <run-id>`.

For an always-on daemon, run `aitomator start --background`. Inspect its service output with `aitomator logs --daemon --follow`; stop or restart it with the ordinary `aitomator stop` and `aitomator restart` commands.

Node output becomes the next node's input. Return `ctx.input` to preserve input. Nodes can read `process.env`, `Bun.env`, or `ctx.env`; `.env` and `.env.local` follow Bun behavior. Workflow source is trusted local code, not sandboxed. Use scoped credentials and never put secrets in node outputs.

Triggers are `manual`, `http`, `cron`, and `poll`. Poll nodes return `{ state, events? }`; state is persisted and each explicit event starts one run. Runs execute in fresh Bun processes. Global and per-workflow concurrency use a durable SQLite queue; overflow can be `queue` or `drop`.
