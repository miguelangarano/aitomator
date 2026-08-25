import { defineWorkflow } from "aitomator"
export default defineWorkflow({ id: "github-agent", trigger: { type: "poll", every: "60s", node: "../nodes/check-ready-issues.ts" }, concurrency: { maxRuns: 1, overflow: "queue" }, steps: [{ id: "start-paseo", node: "../nodes/start-paseo.ts" }] })
