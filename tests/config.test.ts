import { afterEach, expect, test } from "bun:test"
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { configuredEnvironment } from "../src/config/environment"
import { loadAItomatorConfig } from "../src/config/load-config"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test("config env is propagated to child processes", async () => {
  const root = join(tmpdir(), `aitomator-config-test-${crypto.randomUUID()}`), bin = join(root, "bin")
  roots.push(root); mkdirSync(bin, { recursive: true })
  const command = join(bin, "configured-command")
  writeFileSync(command, "#!/bin/sh\nprintf '%s' \"$CONFIGURED_VALUE\"\n"); chmodSync(command, 0o755)
  writeFileSync(join(root, "aitomator.config.ts"), `export default { env: { PATH: ${JSON.stringify(`${bin}:${process.env.PATH ?? ""}`)}, CONFIGURED_VALUE: "from-config" } }`)

  const config = await loadAItomatorConfig(root)
  const child = Bun.spawn(["configured-command"], { env: configuredEnvironment(config), stdout: "pipe" })

  expect(await new Response(child.stdout).text()).toBe("from-config")
  expect(await child.exited).toBe(0)
})
