import { defineWorkflow } from "aitomator"
export default defineWorkflow({ id: "backup", trigger: { type: "cron", expression: "0 2 * * *" }, steps: [{ id: "backup", node: "../nodes/backup.ts" }] })
