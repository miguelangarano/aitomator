import { defineNode } from "aitomator"

export default defineNode({
  async run(ctx) {
    return { message: `Hello, ${(ctx.input as { name?: string }).name ?? "world"}!` }
  },
})
