import type { AItomatorConfig } from "../workflow/types"

export function configuredEnvironment(config: AItomatorConfig): Record<string, string | undefined> {
  return { ...process.env, ...config.env }
}

export function applyConfiguredEnvironment(config: AItomatorConfig): void {
  Object.assign(process.env, config.env)
}
