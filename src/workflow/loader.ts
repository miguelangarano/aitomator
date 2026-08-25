import { existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import type { WorkflowDefinition } from "./types"

export interface LoadedWorkflow { path: string; definition: WorkflowDefinition }

export function workflowFiles(workspace: string): string[] {
  const root = join(workspace, "workflows")
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".workflow.ts"))
    .map(entry => resolve(entry.parentPath, entry.name)).sort()
}

export async function loadWorkflow(path: string, fresh = false): Promise<WorkflowDefinition> {
  const suffix = fresh ? `?v=${Date.now()}-${Math.random()}` : ""
  const module = await import(`${Bun.pathToFileURL(path).href}${suffix}`)
  return module.default as WorkflowDefinition
}

export async function loadWorkflows(workspace: string, fresh = false): Promise<LoadedWorkflow[]> {
  const loaded: LoadedWorkflow[] = []
  for (const path of workflowFiles(workspace)) loaded.push({ path, definition: await loadWorkflow(path, fresh) })
  return loaded
}

export async function findWorkflow(workspace: string, id: string): Promise<LoadedWorkflow | null> {
  for (const item of await loadWorkflows(workspace, true)) if (item.definition?.id === id) return item
  return null
}
