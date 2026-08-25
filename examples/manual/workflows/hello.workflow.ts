import { defineWorkflow } from "aitomator"
export default defineWorkflow({ id: "hello", trigger: { type: "manual" }, steps: [{ id: "hello", node: "../nodes/hello.ts" }] })
