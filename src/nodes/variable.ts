import { registerNode } from "../engine/registry";
import { NodeColorCategory } from "../engine/types";
import type { ExecutionContext } from "../engine/types";

function variableName(graph: { variables: { id: string; name: string }[] }, variableId?: string): string {
  return graph.variables.find((v) => v.id === variableId)?.name ?? "unknown";
}

// Local variables (the current function-call frame's own) shadow globals of the same id — but since
// ids are unique per-Variable regardless of scope, this is really just "check local first, else global."
function getVariableValue(ctx: ExecutionContext, variableId: string): unknown {
  if (ctx.localVariableValues?.has(variableId)) return ctx.localVariableValues.get(variableId);
  return ctx.variableValues.get(variableId);
}

function setVariableValue(ctx: ExecutionContext, variableId: string, value: unknown): void {
  if (ctx.localVariableValues?.has(variableId)) {
    ctx.localVariableValues.set(variableId, value);
  } else {
    ctx.variableValues.set(variableId, value);
  }
}

registerNode({
  type: "variable.get",
  label: "Get Variable",
  description: "Reads the bound variable's current value.",
  group: "Variables",
  colorCategory: NodeColorCategory.Variables,
  pins: [], // real pins are derived per-instance from the bound Variable via derivePins
  // Just its one unlabeled output pin — no separate pin-row space needed below the title, which
  // already names the variable (see headerOnly's own doc comment).
  headerOnly: true,
  // Unlabeled — the node's own title already shows the variable's name (see resolveNodeLabel).
  // container/keyType are forwarded too so a container variable's Get pin wires exactly like the
  // variable itself (see isPinTypeCompatible) — the value flows through untouched either way, since
  // executor.ts/codegen.ts only ever branch on type !== "exec".
  derivePins: (variable) => [{ id: "value", label: "", type: variable.type, direction: "output", container: variable.container, keyType: variable.keyType }],
  evaluate: ({ node, ctx }) => ({
    value: node.variableId ? getVariableValue(ctx, node.variableId) : undefined,
  }),
  compileEvaluate: ({ node, graph }) => ({
    value: `rt.state[${JSON.stringify(node.variableId)}] /* ${variableName(graph, node.variableId)} */`,
  }),
});

registerNode({
  type: "variable.set",
  label: "Set Variable",
  description: "Writes a new value to the bound variable.",
  group: "Variables",
  colorCategory: NodeColorCategory.Variables,
  pins: [],
  // "value" is unlabeled too — the node's own title already shows the variable's name.
  derivePins: (variable) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "value",
      label: "",
      type: variable.type,
      direction: "input",
      defaultValue: variable.defaultValue,
      container: variable.container,
      keyType: variable.keyType,
    },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: ({ node, inputs, ctx }) => {
    if (node.variableId) setVariableValue(ctx, node.variableId, inputs.value);
    return { nextExec: "exec-out" };
  },
  compileExecute: ({ node, inputs, graph, compileFrom }) => [`rt.state[${JSON.stringify(node.variableId)}] = ${inputs.value}; /* ${variableName(graph, node.variableId)} */`, ...compileFrom("exec-out")],
});
