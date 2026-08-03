import type { OperationCategory } from "./types";

/** Which operation category each AI tool belongs to (see section 21 of the design) — the
 * application decides which categories require explicit user approval before committing; this
 * layer never hardcodes that policy itself. */
export const TOOL_OPERATION_CATEGORY: Record<string, OperationCategory> = {
  "graph.get_summary": "read",
  "graph.get_nodes": "read",
  "graph.get_node": "read",
  "graph.find_nodes": "read",
  "graph.get_connections": "read",
  "graph.get_node_types": "read",
  "graph.search_node_types": "read",
  "graph.validate": "read",
  "graph.get_runtime_errors": "read",
  "graph.get_runtime_state": "read",
  "graph.trace_execution": "read",
  "graph.create_node": "safe_mutation",
  "graph.update_node": "safe_mutation",
  "graph.connect": "safe_mutation",
  "graph.apply_changes": "safe_mutation",
  "graph.disconnect": "destructive_mutation",
  "graph.delete_node": "destructive_mutation",
  "graph.undo": "destructive_mutation",
  "graph.redo": "destructive_mutation",
  "graph.restore_snapshot": "destructive_mutation",
  "graph.create_snapshot": "safe_mutation",
  "graph.run": "execution",
};

export interface ApprovalPolicy {
  /** Categories that must be shown to the user for explicit approval before committing. */
  requiresApproval: (category: OperationCategory) => boolean;
}

/** A reasonable app default: only destructive mutations and execution need a human in the loop.
 * The host application is free to supply a stricter/looser policy instead. */
export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  requiresApproval: (category) => category === "destructive_mutation" || category === "execution",
};

export function categoryForTool(toolName: string): OperationCategory {
  return TOOL_OPERATION_CATEGORY[toolName] ?? "read";
}
