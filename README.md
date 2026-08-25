# AItomator

![AItomator](assets/aitomator-banner.png)

> A tiny, agent-friendly TypeScript workflow daemon for automation without a workflow platform.

AItomator lets you build local automations as ordinary TypeScript files. It runs continuously on a workstation, mini PC, home server, or VPS and responds to HTTP requests, cron schedules, polling results, and manual commands.

It uses Bun and SQLite and does not require Redis, RabbitMQ, Postgres, Docker, Kubernetes, or a hosted control plane.

## What is it for?

AItomator is useful when you want to:

- receive a webhook and run local TypeScript code;
- run backups, reports, or maintenance tasks on a schedule;
- poll an API that does not provide webhooks;
- start a coding agent when a project item changes;
- chain API calls, scripts, and command-line programs;
- keep automations as reviewable source code instead of configuring them through a visual editor;
- give an AI agent a deterministic CLI and JSON interface for creating and operating workflows.

Workflows execute trusted local code. AItomator is not a sandbox.

## How it works

```text
HTTP / cron / poll / manual trigger
                 │
                 v
        AItomator daemon
          │           │
          │           └── SQLite state and durable run queue
          │
          v
   fresh Bun runner process
          │
          v
   TypeScript node → TypeScript node → TypeScript node
          │
          v
      result + logs
```

The daemon owns trigger registration, scheduling, persistence, and concurrency. Each workflow run gets a fresh Bun child process. This isolates crashes and memory leaks, and it means node edits and newly installed dependencies are picked up on the next run without restarting the daemon.

Node output becomes the next node's input. Workflow source remains in TypeScript files; only runtime state and history are stored in SQLite.

## Requirements

- [Bun](https://bun.sh/) 1.1 or newer
- Linux, macOS, or another platform supported by Bun

## Installation

Once the package is published, install the CLI globally:

```bash
bun add --global aitomator
aitomator --version
```

Make sure Bun's global binary directory is on your `PATH`:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

To work from a local source checkout instead:

```bash
git clone https://github.com/miguelangarano/aitomator.git
cd aitomator
bun install
bun link
```

## Quick start

Create a workspace for your automations:

```bash
mkdir my-automations
cd my-automations
aitomator init
bun install
```

`aitomator init` creates:

```text
my-automations/
├── aitomator.config.ts   # daemon and runtime settings
├── package.json          # dependencies shared by every node
├── .env.example          # environment variable template
├── .gitignore
├── workflows/            # workflow definitions
├── nodes/                # executable TypeScript nodes
└── data/
    └── logs/             # SQLite data and per-run logs
```

Create and run a manual workflow:

```bash
aitomator workflow create hello --trigger manual --non-interactive
aitomator validate
aitomator graph hello
aitomator run hello --input '{"name":"world"}' --json
```

Inspect its history:

```bash
aitomator runs list
aitomator runs get <run-id> --json
aitomator logs --run <run-id>
```

## Writing workflows

A workflow declares a trigger and a sequential list of nodes:

```ts
// workflows/greet.workflow.ts
import { defineWorkflow } from "aitomator"

export default defineWorkflow({
  id: "greet",
  name: "Greeting endpoint",

  trigger: {
    type: "http",
    method: "POST",
    path: "/greet/:name",
  },

  concurrency: {
    maxRuns: 1,
    overflow: "queue",
  },

  steps: [
    {
      id: "normalize",
      node: "../nodes/normalize.ts",
    },
    {
      id: "greet",
      node: "../nodes/greet.ts",
      params: { punctuation: "!" },
    },
  ],
})
```

Node paths are resolved relative to the workflow file.

## Writing nodes

A node is an ordinary TypeScript module with a `run` function:

```ts
// nodes/greet.ts
import { defineNode } from "aitomator"

export default defineNode({
  async run(ctx) {
    const input = ctx.input as { name: string }
    const params = ctx.params as { punctuation: string }

    ctx.log.info("Creating greeting for", input.name)

    return {
      message: `Hello, ${input.name}${params.punctuation}`,
    }
  },
})
```

The context provides:

- `ctx.input`: trigger data or the previous node's output;
- `ctx.params`: parameters declared on the workflow step;
- `ctx.workflow`: workflow ID and run ID;
- `ctx.node`: current node ID;
- `ctx.trigger`: normalized trigger type and data;
- `ctx.env`: environment variables;
- `ctx.log`: run-associated debug, info, warning, and error logging.

Returning `undefined` intentionally passes `undefined` to the next node. Return `ctx.input` when a node should preserve its input.

Nodes can use normal Bun and Node-compatible APIs, including `fetch`, filesystem access, and `Bun.spawn`.

## Input and output validation

Schemas are optional. AItomator supports objects with a `parse()` method, including Zod, and Standard Schema-compatible validators.

```bash
aitomator deps add zod
```

```ts
import { z } from "zod"
import { defineNode } from "aitomator"

const input = z.object({ issueNumber: z.number() })
const output = z.object({ accepted: z.boolean() })

export default defineNode({
  input,
  output,

  async run(ctx) {
    return { accepted: ctx.input.issueNumber > 0 }
  },
})
```

## Trigger types

### Manual

```ts
trigger: { type: "manual" }
```

```bash
aitomator run my-workflow --input '{"issueNumber":42}'
cat input.json | aitomator run my-workflow --stdin
```

Manual execution works with or without the daemon. User code still runs in a separate Bun process.

### HTTP

```ts
trigger: {
  type: "http",
  method: "POST",
  path: "/deploy/:environment",
  auth: { type: "bearer", env: "DEPLOY_WEBHOOK_SECRET" },
}
```

Start the daemon and send a request:

```bash
aitomator start
```

```bash
curl -X POST http://127.0.0.1:8787/deploy/staging \
  -H "Authorization: Bearer $DEPLOY_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"revision":"abc123"}'
```

The first node receives the method, path, route parameters, query parameters, headers, and body.

### Cron

```ts
trigger: {
  type: "cron",
  expression: "0 2 * * *",
  timezone: "America/Guayaquil",
}
```

Cron uses the standard five-field order: minute, hour, day of month, month, and day of week. The daemon must be running for scheduled workflows.

### Poll

```ts
trigger: {
  type: "poll",
  every: "60s",
  node: "../nodes/check-project.ts",
}
```

A polling node returns state and can optionally emit explicit events:

```ts
export async function poll() {
  const response = await fetch("https://example.com/api/items")
  const items = await response.json()

  return {
    state: items,
    events: items
      .filter((item) => item.ready)
      .map((item) => ({ id: item.id, title: item.title })),
  }
}
```

State is persisted in SQLite. Without `events`, AItomator starts a run when the state changes after the initial baseline. With `events`, each emitted event creates a separate workflow run.

## Running the daemon

Run it in the foreground:

```bash
aitomator start
```

Or install and start it as an always-on background service:

```bash
aitomator start --background
```

On Linux, AItomator also enables user lingering when permitted so the service starts at boot and continues after logout. If the operating system requires administrator authorization, the command reports the exact limitation instead of hiding it.

Control it from another terminal in the same workspace:

```bash
aitomator status
aitomator workflow reload
aitomator stop
aitomator restart
```

View daemon output without calling `journalctl` or `log` directly:

```bash
aitomator logs --daemon
aitomator logs --daemon --follow
```

Follow one workflow across its current and future runs, or follow one specific run:

```bash
aitomator logs --workflow github-agent --follow
aitomator logs --run <run-id> --follow
```

Use `--lines N` to control the initial tail and press `Ctrl+C` to stop following.

Workflow definitions are watched and hot-reloaded when valid. Invalid updates are rejected, leaving the previous valid registry active. Node files and dependency changes are naturally refreshed because every run starts a new process.

## Background service

Install and start a per-user systemd service on Linux or a launchd service on macOS:

```bash
cd /path/to/my-automations
aitomator service install
```

`aitomator start --background` is the shorter equivalent.

All service operations are available through the CLI:

```bash
aitomator service status
aitomator service restart
aitomator service stop
aitomator service start
aitomator service logs --follow
```

Remove it with:

```bash
aitomator service uninstall
```

If the workspace is moved, reinstall the service because its definition contains an absolute working-directory path.

## Configuration

`aitomator.config.ts` controls the daemon:

```ts
import { defineConfig } from "aitomator"

export default defineConfig({
  database: "./data/aitomator.db",

  http: {
    host: "127.0.0.1",
    port: 8787,
  },

  concurrency: {
    maxRuns: 4,
    defaultWorkflowMaxRuns: 1,
  },

  logging: {
    level: "info",
  },
})
```

Environment overrides:

| Variable | Purpose |
| --- | --- |
| `AITOMATOR_WORKSPACE` | Override workspace discovery |
| `AITOMATOR_DATABASE_PATH` | Override the SQLite path |
| `AITOMATOR_HTTP_HOST` | Override the HTTP bind address |
| `AITOMATOR_HTTP_PORT` | Override the HTTP port |
| `AITOMATOR_MAX_RUNS` | Override global concurrency |
| `AITOMATOR_LOG_LEVEL` | Set `debug`, `info`, `warn`, or `error` |

Bun loads `.env` files automatically. Nodes can read variables through `process.env`, `Bun.env`, or `ctx.env`.

Secrets are not automatically copied to SQLite, but trigger payloads, node inputs and outputs, errors, and logs are persisted. Do not return or log secrets.

## Concurrency and persistence

Global concurrency limits the number of runner processes across the workspace. Each workflow can set its own limit and overflow policy:

```ts
concurrency: {
  maxRuns: 1,
  overflow: "queue", // or "drop"
}
```

Queued runs and run history survive daemon restarts. A failed node marks its step and workflow run as failed without crashing the daemon.

## Dependencies

All workflows share one workspace dependency graph:

```bash
aitomator deps add octokit zod
aitomator deps remove octokit
aitomator deps list --json
aitomator deps sync
```

Nodes can import any package installed in the workspace.

## CLI reference

```text
aitomator init

aitomator start [--background]
aitomator stop
aitomator restart
aitomator status
aitomator logs [--workflow ID | --run ID] [--follow] [--lines N]
aitomator logs --daemon [--follow] [--lines N]

aitomator workflow create <id> --trigger manual|http|cron|poll
aitomator workflow list
aitomator workflow describe <id>
aitomator workflow enable <id>
aitomator workflow disable <id>
aitomator workflow remove <id> --force
aitomator workflow reload [id]

aitomator node create <id>
aitomator node inspect <id>

aitomator run <workflow> [--input JSON | --stdin] [--wait]
aitomator runs list [--workflow ID] [--limit N]
aitomator runs get <run-id>
aitomator runs retry <run-id>

aitomator validate [workflow] [--json]
aitomator graph <workflow> [--format ascii|compact|mermaid|json]
aitomator doctor

aitomator deps add|remove|list|sync
aitomator service install|uninstall|start|stop|restart|status|logs
aitomator capabilities --json
aitomator skill [--json]
```

Commands support deterministic JSON output where applicable. Exit codes are stable for automation:

| Code | Meaning |
| ---: | --- |
| `0` | Success |
| `1` | General failure |
| `2` | Invalid usage or configuration |
| `3` | Workflow, node, or run not found |
| `5` | Validation failure |
| `6` | Daemon unavailable |
| `7` | Workflow run failed |

## Agent usage

AItomator exposes its capabilities and a bundled agent guide:

```bash
aitomator capabilities --json
aitomator skill
```

A recommended automation loop is:

```text
discover capabilities → scaffold files → edit TypeScript → add dependencies
→ validate → reload → inspect graph → run → inspect history
```

## Security

Installing or executing an AItomator workflow is equivalent to executing local TypeScript code. Nodes can access the filesystem, environment, processes, and network.

Recommended precautions:

- run the daemon as a dedicated, unprivileged user;
- use scoped API keys and access tokens;
- bind HTTP to loopback unless remote access is intentional;
- authenticate sensitive HTTP workflows;
- review third-party workflow and node code before running it;
- never run the daemon as root unless absolutely necessary.

See [SECURITY.md](SECURITY.md) for the complete security model.

## Development

```bash
git clone https://github.com/miguelangarano/aitomator.git
cd aitomator
bun install
bun test
bun run typecheck
bun run build
```

Release automation and npm publishing are documented in [RELEASING.md](RELEASING.md).

## License

AItomator is open-source software released under the [MIT License](LICENSE).
