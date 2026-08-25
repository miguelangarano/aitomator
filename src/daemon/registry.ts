import type { Database } from "bun:sqlite"
import type { LoadedWorkflow } from "../workflow/loader"
import { loadWorkflows } from "../workflow/loader"
import { validateWorkflow } from "../workflow/validation"
import { workflowEnabled } from "../database/runs"

export class WorkflowRegistry {
  private workflows = new Map<string, LoadedWorkflow>()
  constructor(private workspace: string, private db: Database) {}
  async reload(): Promise<{ loaded: number; errors: unknown[] }> {
    const next = new Map<string, LoadedWorkflow>(), errors: unknown[] = []
    try { for (const item of await loadWorkflows(this.workspace, true)) { const validation = await validateWorkflow(item); if (validation.length) { errors.push(...validation); continue } if (next.has(item.definition.id)) { errors.push({ workflow: item.definition.id, message: "Duplicate workflow ID" }); continue } next.set(item.definition.id, item) } } catch (error) { errors.push({ message: error instanceof Error ? error.message : String(error) }) }
    if (errors.length === 0) this.workflows = next
    return { loaded: errors.length ? this.workflows.size : next.size, errors }
  }
  get(id: string): LoadedWorkflow | undefined { return this.workflows.get(id) }
  list(includeDisabled = true): LoadedWorkflow[] { return [...this.workflows.values()].filter(item => includeDisabled || this.enabled(item)) }
  enabled(item: LoadedWorkflow): boolean { return workflowEnabled(this.db, item.definition.id, item.definition.enabled !== false) }
}
