import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
export function expandPath(path: string): string { if (path === "~") return homedir(); if (path.startsWith("~/")) return join(homedir(), path.slice(2)); return path }
export function findWorkspace(from = process.cwd()): string {
  const override = process.env.AITOMATOR_WORKSPACE; if (override) return resolve(expandPath(override))
  let current = resolve(from)
  while (true) { if (existsSync(join(current, "aitomator.config.ts"))) return current; const parent = resolve(current, ".."); if (parent === current) return resolve(from); current = parent }
}
export function resolveWorkspacePath(workspace: string, path: string): string { const expanded = expandPath(path); return isAbsolute(expanded) ? expanded : resolve(workspace, expanded) }
export function runtimeDir(workspace: string): string { return join(workspace, ".aitomator") }
