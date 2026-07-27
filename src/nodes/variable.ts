import { registerNode } from "../engine/registry";

registerNode({
  type: "variable.get",
  label: "Get Variable",
  category: "Variables",
  pins: [], // real pins are derived per-instance from the bound Variable via derivePins
  derivePins: (variable) => [
    { id: "value", label: variable.name, type: variable.type, direction: "output" },
  ],
  evaluate: ({ node, ctx }) => ({
    value: node.variableId ? ctx.variableValues.get(node.variableId) : undefined,
  }),
});

registerNode({
  type: "variable.set",
  label: "Set Variable",
  category: "Variables",
  pins: [],
  derivePins: (variable) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "value", label: variable.name, type: variable.type, direction: "input", defaultValue: variable.defaultValue },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: ({ node, inputs, ctx }) => {
    if (node.variableId) ctx.variableValues.set(node.variableId, inputs.value);
    return { nextExec: "exec-out" };
  },
});
