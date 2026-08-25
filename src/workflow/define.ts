import type { AItomatorConfig, NodeDefinition, WorkflowDefinition } from "./types"
export function defineWorkflow<T extends WorkflowDefinition>(workflow: T): T { return workflow }
export function defineNode<T extends NodeDefinition>(node: T): T { return node }
export function defineConfig<T extends Partial<AItomatorConfig>>(config: T): T { return config }
