import type { WorkflowDefinition } from "../workflow/types"

function triggerLabel(w: WorkflowDefinition): string { const t = w.trigger; if (t.type === "http") return `${(t.method ?? "POST").toUpperCase()} ${t.path}`; if (t.type === "cron") return `Cron: ${t.expression}`; if (t.type === "poll") return `Poll: every ${t.every}`; return "Manual" }
export function graphJson(w: WorkflowDefinition): object { return { workflow: w.id, trigger: { ...w.trigger }, nodes: w.steps.map((s, index) => ({ id: s.id, node: s.node, position: index })), edges: w.steps.map((s, index) => ({ from: index === 0 ? "trigger" : w.steps[index - 1]!.id, to: s.id })) } }
export function renderGraph(w: WorkflowDefinition, format: "ascii" | "compact" | "mermaid" | "json" = "ascii"): string {
  const label = triggerLabel(w)
  if (format === "json") return JSON.stringify(graphJson(w), null, 2)
  if (format === "compact") return [`${w.trigger.type}(${label.replace(/^[^:]+:\s*/, "")})`, ...w.steps.map(s => s.id)].join(" -> ")
  if (format === "mermaid") { const lines = ["flowchart TD", `    trigger["${escape(label)}"]`]; w.steps.forEach((s, i) => { lines.push(`    n${i + 1}["${escape(s.id)}"]`); lines.push(`    ${i === 0 ? "trigger" : `n${i}`} --> n${i + 1}`) }); return lines.join("\n") }
  return [`Workflow: ${w.id}`, "", `[${label}]`, ...w.steps.flatMap(s => ["      |", "      v", `[${s.id}]`])].join("\n")
}
function escape(value: string): string { return value.replaceAll('"', "&quot;") }
