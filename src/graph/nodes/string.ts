import { NodeInstance } from "../engine/nodeInstance";
import { registerNode } from "../engine/registry";
import { NodeColorCategory } from "../engine/types";
import type { PinDef } from "../engine/types";
import { i18n } from "@i18n";

registerNode({
  type: "string.fromNumber",
  label: i18n.nodes.string.fromNumber.label,
  description: i18n.nodes.string.fromNumber.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "number", direction: "input", defaultValue: 0 },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: String(Number(inputs.value ?? 0)) }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(Number(${inputs.value}))`,
  }),
});

registerNode({
  type: "string.fromBoolean",
  label: i18n.nodes.string.fromBoolean.label,
  description: i18n.nodes.string.fromBoolean.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "boolean", direction: "input", defaultValue: false },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
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
  label: i18n.nodes.string.fromDate.label,
  description: i18n.nodes.string.fromDate.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "date", direction: "input", defaultValue: "" },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
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
  label: i18n.nodes.string.fromJson.label,
  description: i18n.nodes.string.fromJson.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "object", direction: "input" },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: JSON.stringify(inputs.value ?? null) }),
  compileEvaluate: ({ inputs }) => ({
    result: `JSON.stringify(${inputs.value})`,
  }),
});

registerNode({
  type: "string.equalCaseSensitive",
  label: i18n.nodes.string.equalCaseSensitive.label,
  description: i18n.nodes.string.equalCaseSensitive.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "a", label: i18n.nodes.__shared.pin_a, type: "string", direction: "input", defaultValue: "" },
    { id: "b", label: i18n.nodes.__shared.pin_b, type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "boolean", direction: "output" },
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
  label: i18n.nodes.string.equalCaseInsensitive.label,
  description: i18n.nodes.string.equalCaseInsensitive.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "a", label: i18n.nodes.__shared.pin_a, type: "string", direction: "input", defaultValue: "" },
    { id: "b", label: i18n.nodes.__shared.pin_b, type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: typeof inputs.a === "string" && (inputs.a as string).toLowerCase() === (inputs.b as string).toLowerCase(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(typeof ${inputs.a} === "string" && ${inputs.a}.toLowerCase() === ${inputs.b}.toLowerCase())`,
  }),
});

registerNode({
  type: "string.length",
  label: i18n.nodes.string.length.label,
  description: i18n.nodes.string.length.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "number", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ result: String(inputs.value ?? "").length }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(${inputs.value}).length`,
  }),
});

registerNode({
  type: "string.replace",
  label: i18n.nodes.string.replace.label,
  description: i18n.nodes.string.replace.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "string", direction: "input", defaultValue: "" },
    { id: "search", label: i18n.nodes.string.replace.pin_search, type: "string", direction: "input", defaultValue: "" },
    { id: "replacement", label: i18n.nodes.string.replace.pin_replacement, type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
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
  label: i18n.nodes.string.replaceAll.label,
  description: i18n.nodes.string.replaceAll.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "string", direction: "input", defaultValue: "" },
    { id: "search", label: i18n.nodes.string.replaceAll.pin_search, type: "string", direction: "input", defaultValue: "" },
    { id: "replacement", label: i18n.nodes.string.replaceAll.pin_replacement, type: "string", direction: "input", defaultValue: "" },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
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
  label: i18n.nodes.string.substring.label,
  description: i18n.nodes.string.substring.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "string", direction: "input", defaultValue: "" },
    { id: "start", label: i18n.nodes.__shared.pin_start, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "end", label: i18n.nodes.__shared.pin_end, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
  ],

  evaluate: ({ inputs }) => ({
    result: String(inputs.value ?? "").substring(Math.round(Number(inputs.start ?? 0)), Math.round(Number(inputs.end ?? 0))),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(${inputs.value}).substring(Math.round(Number(${inputs.start})), Math.round(Number(${inputs.end})))`,
  }),
});

registerNode({
  type: "string.slice",
  label: i18n.nodes.string.slice.label,
  description: i18n.nodes.string.slice.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [
    { id: "value", label: i18n.nodes.__shared.pin_value, type: "string", direction: "input", defaultValue: "" },
    { id: "start", label: i18n.nodes.__shared.pin_start, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "end", label: i18n.nodes.__shared.pin_end, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    result: String(inputs.value ?? "").slice(Math.round(Number(inputs.start ?? 0)), Math.round(Number(inputs.end ?? 0))),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `String(${inputs.value}).slice(Math.round(Number(${inputs.start})), Math.round(Number(${inputs.end})))`,
  }),
});

const ENTRY_PREFIX = "entry-";
const MIN_APPEND_ENTRIES = 1;

const APPEND_RESULT_PIN: PinDef = {
  id: "result",
  label: i18n.nodes.__shared.pin_result,
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
    label: `${i18n.nodes.string.append.pin_string} ${i + 1}`,
    type: "string",
    direction: "input",
    defaultValue: "",
    removable: ids.length > MIN_APPEND_ENTRIES,
  }));
}

registerNode({
  type: "string.append",
  label: i18n.nodes.string.append.label,
  description: i18n.nodes.string.append.description,
  group: "String",
  colorCategory: NodeColorCategory.String,
  pins: [{ id: `${ENTRY_PREFIX}0`, label: i18n.nodes.string.append.pin_string_1, type: "string", direction: "input", defaultValue: "" }, { id: `${ENTRY_PREFIX}1`, label: i18n.nodes.string.append.pin_string_2, type: "string", direction: "input", defaultValue: "" }, APPEND_RESULT_PIN],
  deriveInstancePins: (node) => [...appendEntryPinDefs(node), APPEND_RESULT_PIN],
  addInstancePinEntry: (node) => {
    const ids = appendEntryIds(node);
    const nextSuffix = ids.length === 0 ? 0 : entrySuffix(ids[ids.length - 1]) + 1;
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
