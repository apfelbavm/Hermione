import { registerNode } from "../engine/registry";

registerNode({
  type: "boolean.not",
  label: "Not",
  description: "Inverts a boolean value — true becomes false and false becomes true.",
  group: "Boolean",
  pins: [
    { id: "value", label: "Value", type: "boolean", direction: "input", defaultValue: false },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: !inputs.value }),
  compileEvaluate: ({ inputs }) => ({
    result: `!(${inputs.value})`,
  }),
});
