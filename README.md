# AItomator

> A tiny, agent-friendly TypeScript workflow daemon for people who want automation without a workflow platform.

AItomator runs code-first workflows on Bun. One small daemon owns HTTP, cron, poll, and manual triggers; every workflow run executes as a fresh, short-lived Bun process. State and the durable concurrency queue live in SQLite—there is no Redis, RabbitMQ, Postgres, cloud control plane, or required UI.

## Features

- Ordinary TypeScript nodes with optional Zod or Standard Schema validation
- Sequential output-to-input chaining
- Isolated runner processes with durable run and step history
- Global and per-workflow concurrency with `queue` and `drop` overflow policies
- HTTP routes (including path parameters and bearer auth), five-field cron, persistent polling, and manual runs
- Hot workflow reloads and fresh node imports without daemon restarts
- Agent-oriented JSON output, scaffolding, validation, graphs, and a bundled usage skill
- `.env`/system environment access and one shared Bun dependency graph
- Linux systemd user-service and macOS launchd definitions

Nodes are trusted local code and are not sandboxed.

## Install and start

```bash
bun add -g aitomator
mkdir my-automations && cd my-automations
aitomator init
bun install
aitomator workflow create hello --trigger manual --non-interactive
aitomator validate
aitomator run hello --input '{"name":"world"}' --json
```

Start the long-running trigger daemon:

```bash
aitomator start
```

In another terminal:

```bash
aitomator status
aitomator workflow reload
aitomator runs list
aitomator stop
```

## Workflow and node contracts

```ts
// workflows/greet.workflow.ts
import { defineWorkflow } from "aitomator"

export default defineWorkflow({
  id: "greet",
  trigger: { type: "http", method: "POST", path: "/greet/:name" },
  concurrency: { maxRuns: 1, overflow: "queue" },
  steps: [
    { id: "normalize", node: "../nodes/normalize.ts" },
    { id: "greet", node: "../nodes/greet.ts", params: { punctuation: "!" } },
  ],
})
```

```ts
// nodes/greet.ts
import { defineNode } from "aitomator"

export default defineNode({
  async run(ctx) {
    ctx.log.info("Greeting", ctx.input)
    return { message: `Hello ${ctx.input.name}${ctx.params.punctuation}` }
  },
})
```

The trigger payload enters the first node. Each node's output becomes the next node's input. Returning `undefined` intentionally passes `undefined` onward.

## Triggers

```ts
{ type: "manual" }
{ type: "http", method: "POST", path: "/deploy", auth: { type: "bearer", env: "WEBHOOK_SECRET" } }
{ type: "cron", expression: "0 2 * * *", timezone: "America/Guayaquil" }
{ type: "poll", every: "60s", node: "../nodes/check.ts" }
```

A poll node returns `{ state, events? }`. A changed state starts one run after the baseline is established, or each explicit event starts a separate run.

## CLI

```text
aitomator init
aitomator start|stop|restart|status|logs
aitomator workflow create|list|describe|enable|disable|remove|reload
aitomator node create|inspect
aitomator run <workflow> [--input JSON|--stdin] [--wait]
aitomator runs list|get|retry
aitomator validate [workflow] [--json]
aitomator graph <workflow> [--format ascii|compact|mermaid|json]
aitomator deps add|remove|list|sync
aitomator service install|uninstall
aitomator capabilities --json
aitomator skill [--json]
aitomator doctor
```

Exit codes are stable for automation: `0` success, `1` general failure, `2` invalid usage/configuration, `3` not found, `5` validation failure, `6` daemon unavailable, and `7` failed run.

## Configuration

```ts
import { defineConfig } from "aitomator"

export default defineConfig({
  database: "./data/aitomator.db",
  http: { host: "127.0.0.1", port: 8787 },
  concurrency: { maxRuns: 4, defaultWorkflowMaxRuns: 1 },
  logging: { level: "info" },
})
```

Overrides: `AITOMATOR_WORKSPACE`, `AITOMATOR_DATABASE_PATH`, `AITOMATOR_HTTP_HOST`, `AITOMATOR_HTTP_PORT`, `AITOMATOR_MAX_RUNS`, and `AITOMATOR_LOG_LEVEL`.

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

See [SECURITY.md](SECURITY.md) before running third-party workflows. MIT licensed.
