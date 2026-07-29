import { registerNode } from "../engine/registry";

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
  label: "Now",
  description: "Returns the current date and time as a Date.",
  group: "Date",
  pins: [{ id: "result", label: "Result", type: "date", direction: "output" }],
  evaluate: () => ({ result: new Date() }),
  compileEvaluate: () => ({
    result: `new Date()`,
  }),
});

registerNode({
  type: "date.fromString",
  label: "To Date (String)",
  description: "Parses a text string into a Date.",
  group: "Date",
  pins: [
    { id: "value", label: "Value", type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "date", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: new Date(String(inputs.value ?? "")) }),
  compileEvaluate: ({ inputs }) => ({
    result: `new Date(String(${inputs.value}))`,
  }),
});

registerNode({
  type: "date.fromNumber",
  label: "To Date (Number)",
  description: "Converts a number of milliseconds since epoch into a Date.",
  group: "Date",
  pins: [
    { id: "value", label: "Value", type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: "Result", type: "date", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: new Date(Number(inputs.value || 0)) }),
  compileEvaluate: ({ inputs }) => ({
    result: `new Date(Number(${inputs.value}))`,
  }),
});

registerNode({
  type: "date.subtract",
  label: "Subtract Dates (A - B) → ms",
  description: "Returns the difference between two dates in milliseconds.",
  group: "Date",
  pins: [
    { id: "a", label: "A", type: "date", direction: "input", defaultValue: "" },
    { id: "b", label: "B", type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "number", direction: "output" },
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
  label: "Equal (A == B)",
  description: "True if two dates represent the same moment in time.",
  group: "Date.Comparison",
  pins: [
    { id: "a", label: "A", type: "date", direction: "input", defaultValue: "" },
    { id: "b", label: "B", type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
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
  label: "Unequal (A != B)",
  description: "True if two dates do not represent the same moment in time.",
  group: "Date.Comparison",
  pins: [
    { id: "a", label: "A", type: "date", direction: "input", defaultValue: "" },
    { id: "b", label: "B", type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
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
  label: "Greater than (A > B)",
  description: "True if date A is later than date B.",
  group: "Date.Comparison",
  pins: [
    { id: "a", label: "A", type: "date", direction: "input", defaultValue: "" },
    { id: "b", label: "B", type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
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
  label: "Greater equal (A >= B)",
  description: "True if date A is later than or the same as date B.",
  group: "Date.Comparison",
  pins: [
    { id: "a", label: "A", type: "date", direction: "input", defaultValue: "" },
    { id: "b", label: "B", type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
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
  label: "Less than (A < B)",
  description: "True if date A is earlier than date B.",
  group: "Date.Comparison",
  pins: [
    { id: "a", label: "A", type: "date", direction: "input", defaultValue: "" },
    { id: "b", label: "B", type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
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
  label: "Less equal (A <= B)",
  description: "True if date A is earlier than or the same as date B.",
  group: "Date.Comparison",
  pins: [
    { id: "a", label: "A", type: "date", direction: "input", defaultValue: "" },
    { id: "b", label: "B", type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: toDate(inputs.a).getTime() <= toDate(inputs.b).getTime(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(new Date(${inputs.a} || 0).getTime() <= new Date(${inputs.b} || 0).getTime())`,
  }),
});
