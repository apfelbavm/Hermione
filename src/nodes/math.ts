import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { i18n } from "@i18n";

const GROUP_ARITHMETIC = i18n.nodes.math.group_arithmetic;
const GROUP_COMPARISON = i18n.nodes.math.group_comparison;

registerNode({
  type: "math.add",
  label: i18n.nodes.math.add.label,
  description: i18n.nodes.math.add.description,
  group: GROUP_ARITHMETIC,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "number",
      direction: "output",
    },
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
  label: i18n.nodes.math.subtract.label,
  description: i18n.nodes.math.subtract.description,
  group: GROUP_ARITHMETIC,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "number",
      direction: "output",
    },
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
  label: i18n.nodes.math.multiply.label,
  description: i18n.nodes.math.multiply.description,
  group: GROUP_ARITHMETIC,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "number",
      direction: "output",
    },
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
  label: i18n.nodes.math.divide.label,
  description: i18n.nodes.math.divide.description,
  group: GROUP_ARITHMETIC,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "number",
      direction: "output",
    },
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
  label: i18n.nodes.math.greaterThan.label,
  description: i18n.nodes.math.greaterThan.description,
  group: GROUP_COMPARISON,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
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
  label: i18n.nodes.math.greaterEqual.label,
  description: i18n.nodes.math.greaterEqual.description,
  group: GROUP_COMPARISON,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
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
  label: i18n.nodes.math.lessThan.label,
  description: i18n.nodes.math.lessThan.description,
  group: GROUP_COMPARISON,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
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
  label: i18n.nodes.math.lessEqual.label,
  description: i18n.nodes.math.lessEqual.description,
  group: GROUP_COMPARISON,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
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
  label: i18n.nodes.math.equal.label,
  description: i18n.nodes.math.equal.description,
  group: GROUP_COMPARISON,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
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
  label: i18n.nodes.math.unequal.label,
  description: i18n.nodes.math.unequal.description,
  group: GROUP_COMPARISON,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: Number(inputs.a ?? 0) !== Number(inputs.b ?? 0),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(Number(${inputs.a}) !== Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.min",
  label: i18n.nodes.math.min.label,
  description: i18n.nodes.math.min.description,
  group: GROUP_ARITHMETIC,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "number",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: Math.min(Number(inputs.a ?? 0), Number(inputs.b ?? 0)),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `Math.min(Number(${inputs.a}), Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.max",
  label: i18n.nodes.math.max.label,
  description: i18n.nodes.math.max.description,
  group: GROUP_ARITHMETIC,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "number",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: Math.max(Number(inputs.a ?? 0), Number(inputs.b ?? 0)),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `Math.max(Number(${inputs.a}), Number(${inputs.b}))`,
  }),
});

registerNode({
  type: "math.clamp",
  label: i18n.nodes.math.clamp.label,
  description: i18n.nodes.math.clamp.description,
  group: GROUP_ARITHMETIC,
  colorCategory: NodeColorCategory.Math,
  pins: [
    {
      id: "value",
      label: i18n.nodes.__shared.pin_value,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "min",
      label: i18n.nodes.__shared.pin_min,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "max",
      label: i18n.nodes.__shared.pin_max,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "number",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: Math.min(Math.max(Number(inputs.value ?? 0), Number(inputs.min ?? 0)), Number(inputs.max ?? 0)),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `Math.min(Math.max(Number(${inputs.value}), Number(${inputs.min})), Number(${inputs.max}))`,
  }),
});
