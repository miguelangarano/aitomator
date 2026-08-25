import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export function initWorkspace(root: string): string[] {
  const created: string[] = []; for (const dir of ["workflows", "nodes", "data", "executions"]) mkdirSync(join(root, dir), { recursive: true })
  create(join(root, "aitomator.config.ts"), `import { defineConfig } from "aitomator"\n\nexport default defineConfig({\n  database: "./data/aitomator.db",\n  http: { host: "127.0.0.1", port: 8787 },\n  concurrency: { maxRuns: 2, defaultWorkflowMaxRuns: 1 },\n  logging: { level: "info" },\n})\n`, created)
  create(join(root, "package.json"), `${JSON.stringify({ name: "aitomator-workspace", private: true, type: "module", dependencies: { aitomator: "^0.1.0" } }, null, 2)}\n`, created)
  create(join(root, ".env.example"), "# API_TOKEN=\n", created); create(join(root, ".gitignore"), ".env\n.env.local\ndata/\nexecutions/\n.aitomator/\nnode_modules/\n", created)
  return created
}

export function createWorkflow(root: string, id: string, triggerType: string): string[] {
  assertId(id); if (!["manual", "http", "cron", "poll"].includes(triggerType)) throw new Error(`Unknown trigger: ${triggerType}`)
  const nodePath = join(root, "nodes", `${id}.ts`), workflowPath = join(root, "workflows", `${id}.workflow.ts`); if (existsSync(nodePath) || existsSync(workflowPath)) throw new Error(`Workflow or node already exists: ${id}`)
  mkdirSync(dirname(nodePath), { recursive: true }); mkdirSync(dirname(workflowPath), { recursive: true })
  const trigger = triggerType === "http" ? `{ type: "http", method: "POST", path: "/${id}" }` : triggerType === "cron" ? `{ type: "cron", expression: "0 2 * * *" }` : triggerType === "poll" ? `{ type: "poll", every: "60s", node: "../nodes/${id}-poll.ts" }` : `{ type: "manual" }`
  writeFileSync(workflowPath, `import { defineWorkflow } from "aitomator"\n\nexport default defineWorkflow({\n  id: "${id}",\n  name: "${title(id)}",\n  trigger: ${trigger},\n  steps: [\n    { id: "${id}", node: "../nodes/${id}.ts" },\n  ],\n})\n`)
  writeFileSync(nodePath, `import { defineNode } from "aitomator"\n\nexport default defineNode({\n  async run(ctx) {\n    ctx.log.info("Running ${id}")\n    return ctx.input\n  },\n})\n`)
  const paths = [workflowPath, nodePath]
  if (triggerType === "poll") { const pollPath = join(root, "nodes", `${id}-poll.ts`); writeFileSync(pollPath, `export async function poll(ctx: { input: unknown }) {\n  return { state: ctx.input, events: [] }\n}\n`); paths.push(pollPath) }
  return paths
}
export function createNode(root: string, id: string): string { assertId(id); const path = join(root, "nodes", `${id}.ts`); if (existsSync(path)) throw new Error(`Node already exists: ${id}`); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `import { defineNode } from "aitomator"\n\nexport default defineNode({\n  async run(ctx) {\n    return ctx.input\n  },\n})\n`); return path }
function assertId(id: string) { if (!/^[a-z0-9][a-z0-9-_/]*$/.test(id) || id.includes("..")) throw new Error("ID must use lowercase letters, digits, dashes, underscores, or subdirectories") }
function title(id: string): string { return id.split(/[\/_-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") }
function create(path: string, content: string, created: string[]): void { if (!existsSync(path)) { writeFileSync(path, content); created.push(path) } }
