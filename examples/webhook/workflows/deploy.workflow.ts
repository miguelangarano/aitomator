import { defineWorkflow } from "aitomator"
export default defineWorkflow({ id: "deploy", trigger: { type: "http", method: "POST", path: "/deploy", auth: { type: "bearer", env: "DEPLOY_SECRET" } }, steps: [{ id: "deploy", node: "../nodes/deploy.ts" }] })
