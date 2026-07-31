import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { i18n } from "@i18n";

/** Normalizes a "date" pin's runtime value into a Date instance to operate on — a real Date
 * instance when wired from another date node, or whatever its literal `datetime-local` widget
 * holds when left unconnected (an empty/unset widget is `""`, same falsy-default treatment as
 * epoch). `new Date(existingDate)` clones it exactly, so this is safe to call even when `value`
 * is already a Date. */
function toDate(value: unknown): Date {
  return new Date((value || 0) as number | string | Date);
}

registerNode({
  type: "date.now",
  label: i18n.nodes.date.now.label,
  description: i18n.nodes.date.now.description,
  group: "Date",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "date",
      direction: "output",
    },
  ],
  evaluate: () => ({ result: new Date() }),
  compileEvaluate: () => ({
    result: `new Date()`,
  }),
});

registerNode({
  type: "date.fromString",
  label: i18n.nodes.date.fromString.label,
  description: i18n.nodes.date.fromString.description,
  group: "Date",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "value",
      label: i18n.nodes.__shared.pin_value,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "date",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({ result: new Date(String(inputs.value ?? "")) }),
  compileEvaluate: ({ inputs }) => ({
    result: `new Date(String(${inputs.value}))`,
  }),
});

registerNode({
  type: "date.fromNumber",
  label: i18n.nodes.date.fromNumber.label,
  description: i18n.nodes.date.fromNumber.description,
  group: "Date",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "value",
      label: i18n.nodes.__shared.pin_value,
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "date",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({ result: new Date(Number(inputs.value || 0)) }),
  compileEvaluate: ({ inputs }) => ({
    result: `new Date(Number(${inputs.value}))`,
  }),
});

registerNode({
  type: "date.subtract",
  label: i18n.nodes.date.subtract.label,
  description: i18n.nodes.date.subtract.description,
  group: "Date",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "number",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: toDate(inputs.a).getTime() - toDate(inputs.b).getTime(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(new Date(${inputs.a} || 0).getTime() - new Date(${inputs.b} || 0).getTime())`,
  }),
});

registerNode({
  type: "date.equal",
  label: i18n.nodes.date.equal.label,
  description: i18n.nodes.date.equal.description,
  group: "Date.Comparison",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: toDate(inputs.a).getTime() === toDate(inputs.b).getTime(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(new Date(${inputs.a} || 0).getTime() === new Date(${inputs.b} || 0).getTime())`,
  }),
});

registerNode({
  type: "date.unequal",
  label: i18n.nodes.date.unequal.label,
  description: i18n.nodes.date.unequal.description,
  group: "Date.Comparison",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: toDate(inputs.a).getTime() !== toDate(inputs.b).getTime(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(new Date(${inputs.a} || 0).getTime() !== new Date(${inputs.b} || 0).getTime())`,
  }),
});

registerNode({
  type: "date.greaterThan",
  label: i18n.nodes.date.greaterThan.label,
  description: i18n.nodes.date.greaterThan.description,
  group: "Date.Comparison",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: toDate(inputs.a).getTime() > toDate(inputs.b).getTime(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(new Date(${inputs.a} || 0).getTime() > new Date(${inputs.b} || 0).getTime())`,
  }),
});

registerNode({
  type: "date.greaterEqual",
  label: i18n.nodes.date.greaterEqual.label,
  description: i18n.nodes.date.greaterEqual.description,
  group: "Date.Comparison",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: toDate(inputs.a).getTime() >= toDate(inputs.b).getTime(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(new Date(${inputs.a} || 0).getTime() >= new Date(${inputs.b} || 0).getTime())`,
  }),
});

registerNode({
  type: "date.lessThan",
  label: i18n.nodes.date.lessThan.label,
  description: i18n.nodes.date.lessThan.description,
  group: "Date.Comparison",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: toDate(inputs.a).getTime() < toDate(inputs.b).getTime(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(new Date(${inputs.a} || 0).getTime() < new Date(${inputs.b} || 0).getTime())`,
  }),
});

registerNode({
  type: "date.lessEqual",
  label: i18n.nodes.date.lessEqual.label,
  description: i18n.nodes.date.lessEqual.description,
  group: "Date.Comparison",
  colorCategory: NodeColorCategory.Date,
  pins: [
    {
      id: "a",
      label: i18n.nodes.__shared.pin_a,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: i18n.nodes.__shared.pin_b,
      type: "date",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({
    result: toDate(inputs.a).getTime() <= toDate(inputs.b).getTime(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(new Date(${inputs.a} || 0).getTime() <= new Date(${inputs.b} || 0).getTime())`,
  }),
});
