import { NodeInstance } from "../engine/nodeInstance";
import { registerNode } from "../engine/registry";
import type { PinDef } from "../engine/types";

registerNode({
  type: "string.fromNumber",
  label: "To String (Number)",
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
  type: "string.fromJson",
  label: "To String (JSON)",
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
