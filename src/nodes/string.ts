import { NodeInstance } from "../engine/nodeInstance";
import { registerNode } from "../engine/registry";
import type { PinDef } from "../engine/types";

registerNode({
  type: "string.fromNumber",
  label: "To String (Number)",
  description: "Converts a number to its text representation.",
  group: "String",
  pins: [
    {
      id: "value",
      label: "Value",
      type: "number",
      direction: "input",
      defaultValue: 0,
    },
    { id: "result", label: "Result", type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: String(Number(inputs.value ?? 0)) }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(Number(${inputs.value}))`,
  }),
});

registerNode({
  type: "string.fromBoolean",
  label: "To String (Boolean)",
  description: "Converts a boolean to its text representation.",
  group: "String",
  pins: [
    {
      id: "value",
      label: "Value",
      type: "boolean",
      direction: "input",
      defaultValue: false,
    },
    { id: "result", label: "Result", type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: String(Boolean(inputs.value ?? false)),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(Boolean(${inputs.value}))`,
  }),
});

registerNode({
  type: "string.fromDate",
  label: "To String (Date)",
  description: "Converts a date to an ISO 8601 text string.",
  group: "String",
  pins: [
    { id: "value", label: "Value", type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: new Date((inputs.value || 0) as number | string | Date).toISOString(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `new Date(${inputs.value} || 0).toISOString()`,
  }),
});

registerNode({
  type: "string.fromJson",
  label: "To String (JSON)",
  description: "Converts a value to its JSON text representation.",
  group: "String",
  pins: [
    { id: "value", label: "Value", type: "object", direction: "input" },
    { id: "result", label: "Result", type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: JSON.stringify(inputs.value ?? null) }),
  compileEvaluate: ({ inputs }) => ({
    result: `JSON.stringify(${inputs.value})`,
  }),
});

registerNode({
  type: "string.equalCaseSensitive",
  label: "Equal (A === B) case-sensitive",
  description: "True if two strings are exactly equal, case-sensitive.",
  group: "String",
  pins: [
    {
      id: "a",
      label: "A",
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: "B",
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: typeof inputs.a === "string" && inputs.a === inputs.b,
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(typeof ${inputs.a} === "string" && ${inputs.a}.toLowerCase() === ${inputs.b}.toLowerCase())`,
  }),
});

registerNode({
  type: "string.equalCaseInsensitive",
  label: "Equal (A == B) case-insensitive",
  description: "True if two strings are equal, ignoring letter case.",
  group: "String",
  pins: [
    {
      id: "a",
      label: "A",
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "b",
      label: "B",
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    { id: "result", label: "Result", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result:
      typeof inputs.a === "string" &&
      (inputs.a as string).toLowerCase() === (inputs.b as string).toLowerCase(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(typeof ${inputs.a} === "string" && ${inputs.a}.toLowerCase() === ${inputs.b}.toLowerCase())`,
  }),
});

registerNode({
  type: "string.length",
  label: "Length",
  description: "Returns how many characters are in the string.",
  group: "String",
  pins: [
    { id: "value", label: "Value", type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "number", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: String(inputs.value ?? "").length }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(${inputs.value}).length`,
  }),
});

registerNode({
  type: "string.replace",
  label: "Replace",
  description: "Replaces only the first occurrence of a substring with another string.",
  group: "String",
  pins: [
    { id: "value", label: "Value", type: "string", direction: "input", defaultValue: "" },
    { id: "search", label: "Search", type: "string", direction: "input", defaultValue: "" },
    { id: "replacement", label: "Replacement", type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: String(inputs.value ?? "").replace(String(inputs.search ?? ""), String(inputs.replacement ?? "")),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(${inputs.value}).replace(String(${inputs.search}), String(${inputs.replacement}))`,
  }),
});

registerNode({
  type: "string.replaceAll",
  label: "Replace All",
  description: "Replaces every occurrence of a substring with another string.",
  group: "String",
  pins: [
    { id: "value", label: "Value", type: "string", direction: "input", defaultValue: "" },
    { id: "search", label: "Search", type: "string", direction: "input", defaultValue: "" },
    { id: "replacement", label: "Replacement", type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: "Result", type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: String(inputs.value ?? "").replaceAll(String(inputs.search ?? ""), String(inputs.replacement ?? "")),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(${inputs.value}).replaceAll(String(${inputs.search}), String(${inputs.replacement}))`,
  }),
});

registerNode({
  type: "string.substring",
  label: "Substring",
  description: "Returns the characters between Start and End (order-independent, clamped to the string's bounds).",
  group: "String",
  pins: [
    { id: "value", label: "Value", type: "string", direction: "input", defaultValue: "" },
    { id: "start", label: "Start", type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "end", label: "End", type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "result", label: "Result", type: "string", direction: "output" },
  ],
  // Rounded here too (not just at the literal-input widget, see PinDef.integer) since a wired
  // Start/End can come from any number-producing node, not only a literal the user typed.
  evaluate: ({ inputs }) => ({
    result: String(inputs.value ?? "").substring(
      Math.round(Number(inputs.start ?? 0)),
      Math.round(Number(inputs.end ?? 0)),
    ),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(${inputs.value}).substring(Math.round(Number(${inputs.start})), Math.round(Number(${inputs.end})))`,
  }),
});

registerNode({
  type: "string.slice",
  label: "Slice",
  description: "Returns the characters between Start and End, where a negative index counts from the string's end.",
  group: "String",
  pins: [
    { id: "value", label: "Value", type: "string", direction: "input", defaultValue: "" },
    { id: "start", label: "Start", type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "end", label: "End", type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "result", label: "Result", type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: String(inputs.value ?? "").slice(
      Math.round(Number(inputs.start ?? 0)),
      Math.round(Number(inputs.end ?? 0)),
    ),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(${inputs.value}).slice(Math.round(Number(${inputs.start})), Math.round(Number(${inputs.end})))`,
  }),
});

// --- Append String: an Unreal-style node whose number of string inputs grows/shrinks live. Each
// entry is stored as its own "entry-<n>" pin on the NodeInstance itself (see NodeDef.deriveInstancePins
// in types.ts) — there's no separate "entry count" field, the pins record IS the source of truth.

const ENTRY_PREFIX = "entry-";
const MIN_APPEND_ENTRIES = 1;

const APPEND_RESULT_PIN: PinDef = {
  id: "result",
  label: "Result",
  type: "string",
  direction: "output",
};

function entrySuffix(pinId: string): number {
  return Number(pinId.slice(ENTRY_PREFIX.length));
}

function appendEntryIds(node: NodeInstance): string[] {
  return Object.keys(node.pins)
    .filter((id) => id.startsWith(ENTRY_PREFIX))
    .sort((a, b) => entrySuffix(a) - entrySuffix(b));
}

function appendEntryPinDefs(node: NodeInstance): PinDef[] {
  const ids = appendEntryIds(node);
  return ids.map((id, i) => ({
    id,
    label: `String ${i + 1}`,
    type: "string",
    direction: "input",
    defaultValue: "",
    removable: ids.length > MIN_APPEND_ENTRIES,
  }));
}

registerNode({
  type: "string.append",
  label: "Append String",
  description: "Concatenates all of its string inputs into one result.",
  group: "String",
  pins: [
    {
      id: `${ENTRY_PREFIX}0`,
      label: "String 1",
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: `${ENTRY_PREFIX}1`,
      label: "String 2",
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    APPEND_RESULT_PIN,
  ],
  deriveInstancePins: (node) => [
    ...appendEntryPinDefs(node),
    APPEND_RESULT_PIN,
  ],
  addInstancePinEntry: (node) => {
    const ids = appendEntryIds(node);
    const nextSuffix =
      ids.length === 0 ? 0 : entrySuffix(ids[ids.length - 1]) + 1;
    node.pins[`${ENTRY_PREFIX}${nextSuffix}`] = { value: "" };
  },
  evaluate: ({ node, inputs }) => ({
    result: appendEntryIds(node)
      .map((id) => String(inputs[id] ?? ""))
      .join(""),
  }),
  compileEvaluate: ({ node, inputs }) => ({
    result: `[${appendEntryIds(node)
      .map((id) => `String(${inputs[id]})`)
      .join(", ")}].join("")`,
  }),
});
