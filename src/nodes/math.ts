import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";

registerNode({
  type: "math.add",
  label: "Add ( + )",
  description: "Adds two numbers together.",
  group: "Math.Arithmetic",
  colorCategory: NodeColorCategory.Math,
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
  label: "Subtract ( - )",
  description: "Subtracts B from A.",
  group: "Math.Arithmetic",
  colorCategory: NodeColorCategory.Math,
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
  label: "Multiply ( * )",
  description: "Multiplies two numbers together.",
  group: "Math.Arithmetic",
  colorCategory: NodeColorCategory.Math,
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
  label: "Divide ( / )",
  description: "Divides A by B.",
  group: "Math.Arithmetic",
  colorCategory: NodeColorCategory.Math,
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
  label: "Greater than ( > )",
  description: "True if A is greater than B.",
  group: "Math.Comparison",
  colorCategory: NodeColorCategory.Math,
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
  label: "Greater equal ( >= )",
  description: "True if A is greater than or equal to B.",
  group: "Math.Comparison",
  colorCategory: NodeColorCategory.Math,
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
  label: "Less than ( < )",
  description: "True if A is less than B.",
  group: "Math.Comparison",
  colorCategory: NodeColorCategory.Math,
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
  label: "Less equal ( <= )",
  description: "True if A is less than or equal to B.",
  group: "Math.Comparison",
  colorCategory: NodeColorCategory.Math,
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
  label: "Equal ( == )",
  description: "True if A and B are numerically equal.",
  group: "Math.Comparison",
  colorCategory: NodeColorCategory.Math,
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
  label: "Unequal ( != )",
  description: "True if A and B are not numerically equal.",
  group: "Math.Comparison",
  colorCategory: NodeColorCategory.Math,
  pins: [
    { id: "a", label: "A", type: "number", direction: "input", defaultValue: 0 },
    { id: "b", label: "B", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) !== Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) !== Number(${inputs.b}))`,
  }),
});
