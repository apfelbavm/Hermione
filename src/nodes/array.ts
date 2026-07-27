import { DEFAULT_VALUE_BY_TYPE } from "../engine/graphMutations";
import { registerNode } from "../engine/registry";
import { connectionsFrom } from "../engine/graphQueries";
import { runExecFrom } from "../engine/executor";
import type { NodeInstance, PinDef, PinType } from "../engine/types";

// Every node below operates on Array<T> for a per-INSTANCE-chosen T (see
// NodeDef.configurableElementType) — an Array Length node must work on Array<Number> and
// Array<String> alike, but a node's own `pins` are otherwise fixed at registerNode-time, so T is
// read off NodeInstance.elementType (chosen via the Details panel's "Element Type" selector)
// instead. All operations here are pure functions of their inputs (never mutate a shared
// container), consistent with every other node in this engine — see the plan's explicit deviation
// from Unreal's by-reference Array library for why. Only For Each needs exec pins (an actual
// control-flow operation, not a value transformation).

const GROUP = "Collections.Array";

function elementTypeOf(node: NodeInstance): PinType {
  return node.elementType ?? "number";
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

function arrayPin(elementType: PinType, defaultValue: unknown = []): PinDef {
  return { id: "array", label: "Array", type: elementType, direction: "input", container: "array", defaultValue };
}

// A distinct id from arrayPin's "array" — several nodes below have BOTH an array input and an
// array output, and pin ids must be unique within one node (they key NodeInstance.pins and
// NodeScreenGeometry.pinScreen, both flat Records regardless of direction).
function arrayOutPin(elementType: PinType, label = "Array"): PinDef {
  return { id: "result", label, type: elementType, direction: "output", container: "array" };
}

function itemPin(id: string, label: string, elementType: PinType, direction: "input" | "output" = "input"): PinDef {
  return { id, label, type: elementType, direction, defaultValue: direction === "input" ? DEFAULT_VALUE_BY_TYPE[elementType] : undefined };
}

function indexPin(id = "index", label = "Index", direction: "input" | "output" = "input"): PinDef {
  return direction === "input"
    ? { id, label, type: "number", direction, defaultValue: 0, integer: true }
    : { id, label, type: "number", direction };
}

// --- Make Array: Unreal-style variadic constructor, one input pin per element, element type
// configurable per instance. Storage/expansion mechanism mirrors Append String exactly (see
// string.ts) — the NodeInstance's own pins ARE the source of truth for how many entries exist.

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
  return makeArrayEntryIds(node).map((id, i) => ({
    id,
    label: `Element ${i + 1}`,
    type: elementType,
    direction: "input" as const,
    defaultValue: DEFAULT_VALUE_BY_TYPE[elementType],
    removable: true,
  }));
}

registerNode({
  type: "array.make",
  label: "Make Array",
  group: GROUP,
  configurableElementType: {},
  pins: [
    { id: `${ENTRY_PREFIX}0`, label: "Element 1", type: "number", direction: "input", defaultValue: 0, removable: true },
    arrayOutPin("number"),
  ],
  deriveInstancePins: (node) => [...makeArrayEntryPins(node), arrayOutPin(elementTypeOf(node))],
  addInstancePinEntry: (node) => {
    const suffixes = makeArrayEntryIds(node).map(entrySuffix);
    const nextSuffix = suffixes.length === 0 ? 0 : Math.max(...suffixes) + 1;
    node.pins[`${ENTRY_PREFIX}${nextSuffix}`] = { value: DEFAULT_VALUE_BY_TYPE[elementTypeOf(node)] };
  },
  evaluate: ({ node, inputs }) => ({ result: makeArrayEntryIds(node).map((id) => inputs[id]) }),
  compileEvaluate: ({ node, inputs }) => ({
    result: `[${makeArrayEntryIds(node)
      .map((id) => inputs[id])
      .join(", ")}]`,
  }),
});

registerNode({
  type: "array.length",
  label: "Array Length",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), { id: "length", label: "Length", type: "number", direction: "output" }],
  deriveInstancePins: (node) => [
    arrayPin(elementTypeOf(node)),
    { id: "length", label: "Length", type: "number", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ length: asArray(inputs.array).length }),
  compileEvaluate: ({ inputs }) => ({ length: `(${compileAsArray(inputs.array)}).length` }),
});

registerNode({
  type: "array.get",
  label: "Array Get",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), indexPin(), itemPin("element", "Element", "number", "output"), { id: "found", label: "Found", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), indexPin(), itemPin("element", "Element", t, "output"), { id: "found", label: "Found", type: "boolean", direction: "output" }];
  },
  evaluate: ({ node, inputs }) => {
    const arr = asArray(inputs.array);
    const index = Math.trunc(Number(inputs.index ?? 0));
    const found = index >= 0 && index < arr.length;
    return { element: found ? arr[index] : DEFAULT_VALUE_BY_TYPE[elementTypeOf(node)], found };
  },
  compileEvaluate: ({ node, inputs }) => {
    const fallback = JSON.stringify(DEFAULT_VALUE_BY_TYPE[elementTypeOf(node)]);
    const bounds = `(Number(${inputs.index}) >= 0 && Number(${inputs.index}) < (${compileAsArray(inputs.array)}).length)`;
    return {
      element: `(${bounds} ? (${compileAsArray(inputs.array)})[Math.trunc(Number(${inputs.index}))] : ${fallback})`,
      found: bounds,
    };
  },
});

registerNode({
  type: "array.set",
  label: "Array Set",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), indexPin(), itemPin("value", "Value", "number"), arrayOutPin("number"), { id: "success", label: "Success", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), indexPin(), itemPin("value", "Value", t), arrayOutPin(t), { id: "success", label: "Success", type: "boolean", direction: "output" }];
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
  label: "Array Add",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), itemPin("item", "Item", "number"), arrayOutPin("number"), { id: "index", label: "Index", type: "number", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), itemPin("item", "Item", t), arrayOutPin(t), { id: "index", label: "Index", type: "number", direction: "output" }];
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
  label: "Array Append",
  group: GROUP,
  configurableElementType: {},
  pins: [
    { ...arrayPin("number"), id: "a", label: "Array A" },
    { ...arrayPin("number"), id: "b", label: "Array B" },
    arrayOutPin("number"),
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [{ ...arrayPin(t), id: "a", label: "Array A" }, { ...arrayPin(t), id: "b", label: "Array B" }, arrayOutPin(t)];
  },
  evaluate: ({ inputs }) => ({ result: [...asArray(inputs.a), ...asArray(inputs.b)] }),
  compileEvaluate: ({ inputs }) => ({ result: `[...${compileAsArray(inputs.a)}, ...${compileAsArray(inputs.b)}]` }),
});

registerNode({
  type: "array.insert",
  label: "Array Insert",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), indexPin(), itemPin("item", "Item", "number"), arrayOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), indexPin(), itemPin("item", "Item", t), arrayOutPin(t)];
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
  label: "Array Remove At",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), indexPin(), arrayOutPin("number"), { id: "success", label: "Success", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), indexPin(), arrayOutPin(t), { id: "success", label: "Success", type: "boolean", direction: "output" }];
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
  label: "Array Remove Item",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), itemPin("item", "Item", "number"), arrayOutPin("number"), { id: "removed", label: "Removed", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), itemPin("item", "Item", t), arrayOutPin(t), { id: "removed", label: "Removed", type: "boolean", direction: "output" }];
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
  label: "Array Clear",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), arrayOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), arrayOutPin(t)];
  },
  evaluate: () => ({ result: [] }),
  compileEvaluate: () => ({ result: "[]" }),
});

registerNode({
  type: "array.contains",
  label: "Array Contains",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), itemPin("item", "Item", "number"), { id: "contains", label: "Contains", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), itemPin("item", "Item", t), { id: "contains", label: "Contains", type: "boolean", direction: "output" }];
  },
  evaluate: ({ inputs }) => ({ contains: asArray(inputs.array).some((v) => JSON.stringify(v) === JSON.stringify(inputs.item)) }),
  compileEvaluate: ({ inputs }) => ({ contains: `(${compileAsArray(inputs.array)}).some((v) => ${jsonEq("v", inputs.item)})` }),
});

registerNode({
  type: "array.findIndex",
  label: "Array Find Index",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), itemPin("item", "Item", "number"), { id: "index", label: "Index", type: "number", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), itemPin("item", "Item", t), { id: "index", label: "Index", type: "number", direction: "output" }];
  },
  evaluate: ({ inputs }) => ({ index: asArray(inputs.array).findIndex((v) => JSON.stringify(v) === JSON.stringify(inputs.item)) }),
  compileEvaluate: ({ inputs }) => ({
    index: `(${compileAsArray(inputs.array)}).findIndex((v) => ${jsonEq("v", inputs.item)})`,
  }),
});

registerNode({
  type: "array.isEmpty",
  label: "Array Is Empty",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), { id: "isEmpty", label: "Is Empty", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => [arrayPin(elementTypeOf(node)), { id: "isEmpty", label: "Is Empty", type: "boolean", direction: "output" }],
  evaluate: ({ inputs }) => ({ isEmpty: asArray(inputs.array).length === 0 }),
  compileEvaluate: ({ inputs }) => ({ isEmpty: `((${compileAsArray(inputs.array)}).length === 0)` }),
});

registerNode({
  type: "array.reverse",
  label: "Array Reverse",
  group: GROUP,
  configurableElementType: {},
  pins: [arrayPin("number"), arrayOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [arrayPin(t), arrayOutPin(t)];
  },
  evaluate: ({ inputs }) => ({ result: asArray(inputs.array).slice().reverse() }),
  compileEvaluate: ({ inputs }) => ({ result: `(${compileAsArray(inputs.array)}).slice().reverse()` }),
});

// --- Array For Each: the one genuinely control-flow (exec) node in this file — mirrors
// flow.forLoop's exact shape (ctx.execOutputs + recursive runExecFrom), same documented compiler
// gap (no compileExecute/compileEvaluate yet).
const MAX_ARRAY_FOR_EACH_ITERATIONS = 100_000;

registerNode({
  type: "array.forEach",
  label: "Array For Each",
  group: GROUP,
  configurableElementType: {},
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    arrayPin("number"),
    { id: "loop-body", label: "Loop Body", type: "exec", direction: "output" },
    itemPin("element", "Element", "number", "output"),
    { id: "index", label: "Index", type: "number", direction: "output" },
    { id: "completed", label: "Completed", type: "exec", direction: "output" },
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      arrayPin(t),
      { id: "loop-body", label: "Loop Body", type: "exec", direction: "output" },
      itemPin("element", "Element", t, "output"),
      { id: "index", label: "Index", type: "number", direction: "output" },
      { id: "completed", label: "Completed", type: "exec", direction: "output" },
    ];
  },
  // Disabled must skip straight to "completed" — never firing "loop-body" — same rationale as
  // flow.forLoop (see its own comment and NodeDef.disabledNextExec).
  disabledNextExec: ["completed"],
  // Latent only if its body is — same reasoning as flow.forLoop. See NodeDef.latentBodyPin.
  latentBodyPin: "loop-body",
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
