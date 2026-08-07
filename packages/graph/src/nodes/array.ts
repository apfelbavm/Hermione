import { defaultValueFor } from "@hermione/graph/engine/graphMutations";
import { registerNode } from "@hermione/graph/engine/registry";
import { connectionsFrom } from "@hermione/graph/engine/graphQueries";
import { runExecFrom } from "@hermione/graph/engine/executor";
import { NodeColorCategory } from "@hermione/graph/engine/types";
import type { PinDef, PinType } from "@hermione/graph/engine/types";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import { i18n } from "@i18n";

const GROUP = i18n.nodes.array.group;

function elementTypeOf(node: NodeInstance): PinType {
  return node.elementType ?? "number";
}

function elementSubTypeOf(node: NodeInstance): string | undefined {
  return node.elementSubType;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compileAsArray(expr: string): string {
  return `(Array.isArray(${expr}) ? (${expr}) : [])`;
}

function jsonEq(aExpr: string, bExpr: string): string {
  return `(JSON.stringify(${aExpr}) === JSON.stringify(${bExpr}))`;
}

function arrayPin(elementType: PinType, defaultValue: unknown = [], subType?: string): PinDef {
  return {
    id: "array",
    label: i18n.nodes.array.pin_array_in,
    type: elementType,
    direction: "input",
    container: "array",
    defaultValue,
    subType,
  };
}

// A distinct id from arrayPin's "array" — several nodes below have BOTH an array input and an
// array output, and pin ids must be unique within one node (they key NodeInstance.pins and
// NodeScreenGeometry.pinScreen, both flat Records regardless of direction).
function arrayOutPin(elementType: PinType, label = i18n.nodes.array.pin_result, subType?: string): PinDef {
  return {
    id: "result",
    label,
    type: elementType,
    direction: "output",
    container: "array",
    subType,
  };
}

function itemPin(id: string, label: string, elementType: PinType, direction: "input" | "output" = "input", subType?: string): PinDef {
  return {
    id,
    label,
    type: elementType,
    direction,
    defaultValue: direction === "input" ? defaultValueFor(elementType, undefined, subType) : undefined,
    subType,
  };
}

function indexPin(id = "index", label = i18n.nodes.__shared.pin_index, direction: "input" | "output" = "input"): PinDef {
  return direction === "input" ? { id, label, type: "number", direction, defaultValue: 0, integer: true } : { id, label, type: "number", direction };
}

const ENTRY_PREFIX = "entry-";

function entrySuffix(pinId: string): number {
  return Number(pinId.slice(ENTRY_PREFIX.length));
}

function makeArrayEntryIds(node: NodeInstance): string[] {
  return Object.keys(node.pins)
    .filter((id) => id.startsWith(ENTRY_PREFIX))
    .sort((a, b) => entrySuffix(a) - entrySuffix(b));
}

function makeArrayEntryPins(node: NodeInstance): PinDef[] {
  const elementType = elementTypeOf(node);
  const subType = elementSubTypeOf(node);
  return makeArrayEntryIds(node).map((id, i) => ({
    id,
    label: `${i18n.nodes.array.pin_element} ${i + 1}`,
    type: elementType,
    direction: "input" as const,
    defaultValue: defaultValueFor(elementType, undefined, subType),
    subType,
    removable: true,
  }));
}

registerNode({
  type: "array.make",
  label: i18n.nodes.array.make.label,
  description: i18n.nodes.array.make.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [{ id: `${ENTRY_PREFIX}0`, label: `${i18n.nodes.array.pin_element} 1`, type: "number", direction: "input", defaultValue: 0, removable: true }, arrayOutPin("number")],
  deriveInstancePins: (node) => [...makeArrayEntryPins(node), arrayOutPin(elementTypeOf(node), undefined, elementSubTypeOf(node))],
  addInstancePinEntry: (node) => {
    const suffixes = makeArrayEntryIds(node).map(entrySuffix);
    const nextSuffix = suffixes.length === 0 ? 0 : Math.max(...suffixes) + 1;
    node.pins[`${ENTRY_PREFIX}${nextSuffix}`] = {
      value: defaultValueFor(elementTypeOf(node), undefined, elementSubTypeOf(node)),
    };
  },
  evaluate: ({ node, inputs }) => ({
    result: makeArrayEntryIds(node).map((id) => inputs[id]),
  }),
  compileEvaluate: ({ node, inputs }) => ({
    result: `[${makeArrayEntryIds(node)
      .map((id) => inputs[id])
      .join(", ")}]`,
  }),
});

registerNode({
  type: "array.length",
  label: i18n.nodes.array.length.label,
  description: i18n.nodes.array.length.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), { id: "length", label: i18n.nodes.__shared.pin_length, type: "number", direction: "output" }],
  deriveInstancePins: (node) => [arrayPin(elementTypeOf(node), undefined, elementSubTypeOf(node)), { id: "length", label: i18n.nodes.__shared.pin_length, type: "number", direction: "output" }],
  evaluate: ({ inputs }) => ({ length: asArray(inputs.array).length }),
  compileEvaluate: ({ inputs }) => ({
    length: `(${compileAsArray(inputs.array)}).length`,
  }),
});

registerNode({
  type: "array.get",
  label: i18n.nodes.array.get.label,
  description: i18n.nodes.array.get.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), indexPin(), itemPin("element", i18n.nodes.array.pin_element, "number", "output"), { id: "found", label: i18n.nodes.array.get.pin_found, type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), indexPin(), itemPin("element", i18n.nodes.array.pin_element, t, "output", s), { id: "found", label: i18n.nodes.array.get.pin_found, type: "boolean", direction: "output" }];
  },
  evaluate: ({ node, inputs }) => {
    const arr = asArray(inputs.array);
    const index = Math.trunc(Number(inputs.index ?? 0));
    const found = index >= 0 && index < arr.length;
    return {
      element: found ? arr[index] : defaultValueFor(elementTypeOf(node), undefined, elementSubTypeOf(node)),
      found,
    };
  },
  compileEvaluate: ({ node, inputs }) => {
    const fallback = JSON.stringify(defaultValueFor(elementTypeOf(node), undefined, elementSubTypeOf(node)));
    const bounds = `(Number(${inputs.index}) >= 0 && Number(${inputs.index}) < (${compileAsArray(inputs.array)}).length)`;
    return {
      element: `(${bounds} ? (${compileAsArray(inputs.array)})[Math.trunc(Number(${inputs.index}))] : ${fallback})`,
      found: bounds,
    };
  },
});

registerNode({
  type: "array.set",
  label: i18n.nodes.array.set.label,
  description: i18n.nodes.array.set.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), indexPin(), itemPin("value", i18n.nodes.__shared.pin_value, "number"), arrayOutPin("number"), { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), indexPin(), itemPin("value", i18n.nodes.__shared.pin_value, t, "input", s), arrayOutPin(t, undefined, s), { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" }];
  },
  evaluate: ({ inputs }) => {
    const arr = asArray(inputs.array).slice();
    const index = Math.trunc(Number(inputs.index ?? 0));
    const success = index >= 0 && index < arr.length;
    if (success) arr[index] = inputs.value;
    return { result: arr, success };
  },
  compileEvaluate: ({ inputs }) => {
    const bounds = `(Number(${inputs.index}) >= 0 && Number(${inputs.index}) < (${compileAsArray(inputs.array)}).length)`;
    const setExpr = `(() => { const a = (${compileAsArray(inputs.array)}).slice(); const i = Math.trunc(Number(${inputs.index})); if (i >= 0 && i < a.length) a[i] = ${inputs.value}; return a; })()`;
    return { result: setExpr, success: bounds };
  },
});

registerNode({
  type: "array.add",
  label: i18n.nodes.array.add.label,
  description: i18n.nodes.array.add.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), itemPin("item", i18n.nodes.__shared.pin_item, "number"), arrayOutPin("number"), { id: "index", label: i18n.nodes.__shared.pin_index, type: "number", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), itemPin("item", i18n.nodes.__shared.pin_item, t, "input", s), arrayOutPin(t, undefined, s), { id: "index", label: i18n.nodes.__shared.pin_index, type: "number", direction: "output" }];
  },
  evaluate: ({ inputs }) => {
    const arr = asArray(inputs.array).slice();
    const index = arr.length;
    arr.push(inputs.item);
    return { result: arr, index };
  },
  compileEvaluate: ({ inputs }) => ({
    result: `[...(${compileAsArray(inputs.array)}), ${inputs.item}]`,
    index: `(${compileAsArray(inputs.array)}).length`,
  }),
});

registerNode({
  type: "array.append",
  label: i18n.nodes.array.append.label,
  description: i18n.nodes.array.append.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [{ ...arrayPin("number"), id: "a", label: i18n.nodes.array.append.pin_array_a }, { ...arrayPin("number"), id: "b", label: i18n.nodes.array.append.pin_array_b }, arrayOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [{ ...arrayPin(t, undefined, s), id: "a", label: i18n.nodes.array.append.pin_array_a }, { ...arrayPin(t, undefined, s), id: "b", label: i18n.nodes.array.append.pin_array_b }, arrayOutPin(t, undefined, s)];
  },
  evaluate: ({ inputs }) => ({
    result: [...asArray(inputs.a), ...asArray(inputs.b)],
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `[...${compileAsArray(inputs.a)}, ...${compileAsArray(inputs.b)}]`,
  }),
});

registerNode({
  type: "array.insert",
  label: i18n.nodes.array.insert.label,
  description: i18n.nodes.array.insert.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), indexPin(), itemPin("item", i18n.nodes.__shared.pin_item, "number"), arrayOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), indexPin(), itemPin("item", i18n.nodes.__shared.pin_item, t, "input", s), arrayOutPin(t, undefined, s)];
  },
  evaluate: ({ inputs }) => {
    const arr = asArray(inputs.array).slice();
    const index = Math.max(0, Math.min(arr.length, Math.trunc(Number(inputs.index ?? 0))));
    arr.splice(index, 0, inputs.item);
    return { result: arr };
  },
  compileEvaluate: ({ inputs }) => ({
    result: `(() => { const a = (${compileAsArray(inputs.array)}).slice(); const i = Math.max(0, Math.min(a.length, Math.trunc(Number(${inputs.index})))); a.splice(i, 0, ${inputs.item}); return a; })()`,
  }),
});

registerNode({
  type: "array.removeAt",
  label: i18n.nodes.array.removeAt.label,
  description: i18n.nodes.array.removeAt.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), indexPin(), arrayOutPin("number"), { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), indexPin(), arrayOutPin(t, undefined, s), { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" }];
  },
  evaluate: ({ inputs }) => {
    const arr = asArray(inputs.array).slice();
    const index = Math.trunc(Number(inputs.index ?? 0));
    const success = index >= 0 && index < arr.length;
    if (success) arr.splice(index, 1);
    return { result: arr, success };
  },
  compileEvaluate: ({ inputs }) => {
    const bounds = `(Number(${inputs.index}) >= 0 && Number(${inputs.index}) < (${compileAsArray(inputs.array)}).length)`;
    return {
      result: `(() => { const a = (${compileAsArray(inputs.array)}).slice(); const i = Math.trunc(Number(${inputs.index})); if (i >= 0 && i < a.length) a.splice(i, 1); return a; })()`,
      success: bounds,
    };
  },
});

registerNode({
  type: "array.removeItem",
  label: i18n.nodes.array.removeItem.label,
  description: i18n.nodes.array.removeItem.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), itemPin("item", i18n.nodes.__shared.pin_item, "number"), arrayOutPin("number"), { id: "removed", label: i18n.nodes.__shared.pin_removed, type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), itemPin("item", i18n.nodes.__shared.pin_item, t, "input", s), arrayOutPin(t, undefined, s), { id: "removed", label: i18n.nodes.__shared.pin_removed, type: "boolean", direction: "output" }];
  },
  evaluate: ({ inputs }) => {
    const arr = asArray(inputs.array).slice();
    const index = arr.findIndex((v) => JSON.stringify(v) === JSON.stringify(inputs.item));
    const removed = index !== -1;
    if (removed) arr.splice(index, 1);
    return { result: arr, removed };
  },
  compileEvaluate: ({ inputs }) => ({
    result: `(() => { const a = (${compileAsArray(inputs.array)}).slice(); const i = a.findIndex((v) => JSON.stringify(v) === JSON.stringify(${inputs.item})); if (i !== -1) a.splice(i, 1); return a; })()`,
    removed: `(${compileAsArray(inputs.array)}).some((v) => ${jsonEq("v", inputs.item)})`,
  }),
});

registerNode({
  type: "array.clear",
  label: i18n.nodes.array.clear.label,
  description: i18n.nodes.array.clear.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), arrayOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), arrayOutPin(t, undefined, s)];
  },
  evaluate: () => ({ result: [] }),
  compileEvaluate: () => ({ result: "[]" }),
});

registerNode({
  type: "array.contains",
  label: i18n.nodes.array.contains.label,
  description: i18n.nodes.array.contains.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), itemPin("item", i18n.nodes.__shared.pin_item, "number"), { id: "contains", label: i18n.nodes.__shared.pin_contains, type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), itemPin("item", i18n.nodes.__shared.pin_item, t, "input", s), { id: "contains", label: i18n.nodes.__shared.pin_contains, type: "boolean", direction: "output" }];
  },
  evaluate: ({ inputs }) => ({
    contains: asArray(inputs.array).some((v) => JSON.stringify(v) === JSON.stringify(inputs.item)),
  }),
  compileEvaluate: ({ inputs }) => ({
    contains: `(${compileAsArray(inputs.array)}).some((v) => ${jsonEq("v", inputs.item)})`,
  }),
});

registerNode({
  type: "array.findIndex",
  label: i18n.nodes.array.findIndex.label,
  description: i18n.nodes.array.findIndex.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), itemPin("item", i18n.nodes.__shared.pin_item, "number"), { id: "index", label: i18n.nodes.__shared.pin_index, type: "number", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), itemPin("item", i18n.nodes.__shared.pin_item, t, "input", s), { id: "index", label: i18n.nodes.__shared.pin_index, type: "number", direction: "output" }];
  },
  evaluate: ({ inputs }) => ({
    index: asArray(inputs.array).findIndex((v) => JSON.stringify(v) === JSON.stringify(inputs.item)),
  }),
  compileEvaluate: ({ inputs }) => ({
    index: `(${compileAsArray(inputs.array)}).findIndex((v) => ${jsonEq("v", inputs.item)})`,
  }),
});

registerNode({
  type: "array.isEmpty",
  label: i18n.nodes.array.isEmpty.label,
  description: i18n.nodes.array.isEmpty.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), { id: "isEmpty", label: i18n.nodes.array.isEmpty.pin_is_empty, type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => [arrayPin(elementTypeOf(node), undefined, elementSubTypeOf(node)), { id: "isEmpty", label: i18n.nodes.array.isEmpty.pin_is_empty, type: "boolean", direction: "output" }],
  evaluate: ({ inputs }) => ({ isEmpty: asArray(inputs.array).length === 0 }),
  compileEvaluate: ({ inputs }) => ({
    isEmpty: `((${compileAsArray(inputs.array)}).length === 0)`,
  }),
});

registerNode({
  type: "array.reverse",
  label: i18n.nodes.array.reverse.label,
  description: i18n.nodes.array.reverse.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [arrayPin("number"), arrayOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [arrayPin(t, undefined, s), arrayOutPin(t, undefined, s)];
  },
  evaluate: ({ inputs }) => ({
    result: asArray(inputs.array).slice().reverse(),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(${compileAsArray(inputs.array)}).slice().reverse()`,
  }),
});

// --- Array For Each: the one genuinely control-flow (exec) node in this file — mirrors
// flow.forLoop's exact shape (ctx.execOutputs + recursive runExecFrom), same documented compiler
// gap (no compileExecute/compileEvaluate yet).
const MAX_ARRAY_FOR_EACH_ITERATIONS = 100_000;

registerNode({
  type: "array.forEach",
  label: i18n.nodes.array.forEach.label,
  description: i18n.nodes.array.forEach.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    arrayPin("number"),
    { id: "loop-body", label: i18n.nodes.__shared.pin_loop_body, type: "exec", direction: "output" },
    itemPin("element", i18n.nodes.array.pin_element, "number", "output"),
    { id: "index", label: i18n.nodes.__shared.pin_index, type: "number", direction: "output" },
    { id: "completed", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    const s = elementSubTypeOf(node);
    return [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      arrayPin(t, undefined, s),
      { id: "loop-body", label: i18n.nodes.__shared.pin_loop_body, type: "exec", direction: "output" },
      itemPin("element", i18n.nodes.array.pin_element, t, "output", s),
      { id: "index", label: i18n.nodes.__shared.pin_index, type: "number", direction: "output" },
      { id: "completed", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    ];
  },
  // Disabled must skip straight to "completed" — never firing "loop-body" — same rationale as
  // flow.forLoop (see its own comment and NodeDef.disabledNextExec).
  disabledNextExec: ["completed"],
  // Latent only if its body is — same reasoning as flow.forLoop. See NodeDef.latentBodyPin.
  latentBodyPins: () => ["loop-body"],
  execute: async ({ node, inputs, ctx }) => {
    const arr = asArray(inputs.array);
    if (arr.length > MAX_ARRAY_FOR_EACH_ITERATIONS) {
      throw new Error(`Array For Each (${node.id}) would run ${arr.length} iterations, over the ${MAX_ARRAY_FOR_EACH_ITERATIONS} limit.`);
    }
    const bodyTargets = connectionsFrom(ctx.graph, node.id, "loop-body");
    for (let i = 0; i < arr.length; i++) {
      ctx.execOutputs.set(`${node.id}:element`, arr[i]);
      ctx.execOutputs.set(`${node.id}:index`, i);
      for (const conn of bodyTargets) {
        await runExecFrom(conn.toNode, conn.toPin, ctx);
      }
    }
    return { nextExec: "completed" };
  },
});
