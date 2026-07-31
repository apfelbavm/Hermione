import { registerNode } from "../engine/registry";
import { NodeColorCategory } from "../engine/types";
import type { ExecutionContext } from "../engine/types";
import { i18n } from "@i18n";

function variableName(graph: { variables: { id: string; name: string }[] }, variableId?: string): string {
  return graph.variables.find((v) => v.id === variableId)?.name ?? "unknown";
}

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
  label: i18n.nodes.variable.get.label,
  description: i18n.nodes.variable.get.description,
  group: "Variables",
  colorCategory: NodeColorCategory.Variables,
  pins: [], // real pins are derived per-instance from the bound Variable via derivePins

  headerOnly: true,

  derivePins: (variable) => [
    {
      id: "value",
      label: "",
      type: variable.type,
      direction: "output",
      container: variable.container,
      keyType: variable.keyType,
    },
  ],
  evaluate: ({ node, ctx }) => ({
    value: node.variableId ? getVariableValue(ctx, node.variableId) : undefined,
  }),
  compileEvaluate: ({ node, graph }) => ({
    value: `rt.state[${JSON.stringify(node.variableId)}] /* ${variableName(graph, node.variableId)} */`,
  }),
});

registerNode({
  type: "variable.set",
  label: i18n.nodes.variable.set.label,
  description: i18n.nodes.variable.set.description,
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
