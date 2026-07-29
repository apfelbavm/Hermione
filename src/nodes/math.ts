import { registerNode } from "../engine/registry";

registerNode({
  type: "math.add",
  label: "Add (A + B)",
  description: "Adds two numbers together.",
  group: "Math.Arithmetic",
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
  type: "math.subtract",
  label: "Subtract (A - B)",
  description: "Subtracts B from A.",
  group: "Math.Arithmetic",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "number", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) - Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) - Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.multiply",
  label: "Multiply (A * B)",
  description: "Multiplies two numbers together.",
  group: "Math.Arithmetic",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "number", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) * Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) * Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.divide",
  label: "Divide (A / B)",
  description: "Divides A by B.",
  group: "Math.Arithmetic",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "number", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) / Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) / Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.greaterThan",
  label: "Greater than (A > B)",
  description: "True if A is greater than B.",
  group: "Math.Comparison",
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

registerNode({
  type: "math.greaterEqual",
  label: "Greater equal (A >= B)",
  description: "True if A is greater than or equal to B.",
  group: "Math.Comparison",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) >= Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) >= Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.lessThan",
  label: "Less than (A < B)",
  description: "True if A is less than B.",
  group: "Math.Comparison",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) < Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) < Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.lessEqual",
  label: "Less equal (A <= B)",
  description: "True if A is less than or equal to B.",
  group: "Math.Comparison",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) <= Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) <= Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.equal",
  label: "Equal (A == B)",
  description: "True if A and B are numerically equal.",
  group: "Math.Comparison",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) === Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) === Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.unequal",
  label: "Unequal (A != B)",
  description: "True if A and B are not numerically equal.",
  group: "Math.Comparison",
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) != Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) != Number(${inputs.b}))`,
  }),
});
