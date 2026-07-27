import { registerNode } from "../engine/registry";

registerNode({
  type: "math.add",
  label: "Add",
  category: "Math",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "number", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) + Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) + Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.compare",
  label: "Compare (A > B)",
  category: "Math",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) > Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) > Number(${inputs.b}))`,
  }),
});
