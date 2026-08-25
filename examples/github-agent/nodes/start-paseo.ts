export async function run(ctx: { input: { title?: string } }) {
  const process = Bun.spawn(["paseo", "run", `Work on: ${ctx.input.title ?? "the selected issue"}`], { stdout: "inherit", stderr: "inherit" })
  const exitCode = await process.exited
  if (exitCode !== 0) throw new Error(`paseo exited with status ${exitCode}`)
  return ctx.input
}
