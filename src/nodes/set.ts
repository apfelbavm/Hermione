import { DEFAULT_VALUE_BY_TYPE } from "../engine/graphMutations";
import { registerNode } from "../engine/registry";
import { connectionsFrom } from "../engine/graphQueries";
import { runExecFrom } from "../engine/executor";
import type { PinDef, PinType } from "../engine/types";
import { NodeInstance } from "../engine/nodeInstance";

// Sibling of array.ts — same pure-dataflow philosophy (see that file's header comment), just for
// Set<T>. Backed by a plain deduped array (see the plan's rationale: no real ES Set instance, since
// those don't survive JSON.stringify/parse and would break save/load) — uniqueness is enforced by
// every node here rather than by the storage type itself.

const GROUP = "Container.Set";

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

function dedupe(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of values) {
    const key = JSON.stringify(v);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

function compileDedupe(expr: string): string {
  return `(() => { const seen = new Set(); const out = []; for (const v of (${expr})) { const k = JSON.stringify(v); if (!seen.has(k)) { seen.add(k); out.push(v); } } return out; })()`;
}

function setPin(elementType: PinType, id = "set", label = "Set"): PinDef {
  return {
    id,
    label,
    type: elementType,
    direction: "input",
    container: "set",
    defaultValue: [],
  };
}

function setOutPin(elementType: PinType, label = "Set"): PinDef {
  return {
    id: "result",
    label,
    type: elementType,
    direction: "output",
    container: "set",
  };
}

function itemPin(id: string, label: string, elementType: PinType): PinDef {
  return {
    id,
    label,
    type: elementType,
    direction: "input",
    defaultValue: DEFAULT_VALUE_BY_TYPE[elementType],
  };
}

// --- Make Set: same variadic-entry mechanism as Make Array (see string.ts's Append String for the
// original pattern) — the assembled result is deduped, so adding the same literal twice collapses
// to one entry rather than erroring.

const ENTRY_PREFIX = "entry-";

function entrySuffix(pinId: string): number {
  return Number(pinId.slice(ENTRY_PREFIX.length));
}

function makeSetEntryIds(node: NodeInstance): string[] {
  return Object.keys(node.pins)
    .filter((id) => id.startsWith(ENTRY_PREFIX))
    .sort((a, b) => entrySuffix(a) - entrySuffix(b));
}

function makeSetEntryPins(node: NodeInstance): PinDef[] {
  const elementType = elementTypeOf(node);
  return makeSetEntryIds(node).map((id, i) => ({
    id,
    label: `Element ${i + 1}`,
    type: elementType,
    direction: "input" as const,
    defaultValue: DEFAULT_VALUE_BY_TYPE[elementType],
    removable: true,
  }));
}

registerNode({
  type: "set.make",
  label: "Make Set",
  description: "Builds a new set from the given elements, dropping duplicates.",
  group: GROUP,
  configurableElementType: {},
  pins: [
    {
      id: `${ENTRY_PREFIX}0`,
      label: "Element 1",
      type: "number",
      direction: "input",
      defaultValue: 0,
      removable: true,
    },
    setOutPin("number"),
  ],
  deriveInstancePins: (node) => [...makeSetEntryPins(node), setOutPin(elementTypeOf(node))],
  addInstancePinEntry: (node) => {
    const suffixes = makeSetEntryIds(node).map(entrySuffix);
    const nextSuffix = suffixes.length === 0 ? 0 : Math.max(...suffixes) + 1;
    node.pins[`${ENTRY_PREFIX}${nextSuffix}`] = {
      value: DEFAULT_VALUE_BY_TYPE[elementTypeOf(node)],
    };
  },
  evaluate: ({ node, inputs }) => ({
    result: dedupe(makeSetEntryIds(node).map((id) => inputs[id])),
  }),
  compileEvaluate: ({ node, inputs }) => ({
    result: compileDedupe(
      `[${makeSetEntryIds(node)
        .map((id) => inputs[id])
        .join(", ")}]`,
    ),
  }),
});

registerNode({
  type: "set.length",
  label: "Set Length",
  description: "Returns how many unique elements are in the set.",
  group: GROUP,
  configurableElementType: {},
  pins: [setPin("number"), { id: "length", label: "Length", type: "number", direction: "output" }],
  deriveInstancePins: (node) => [setPin(elementTypeOf(node)), { id: "length", label: "Length", type: "number", direction: "output" }],
  evaluate: ({ inputs }) => ({ length: asArray(inputs.set).length }),
  compileEvaluate: ({ inputs }) => ({
    length: `(${compileAsArray(inputs.set)}).length`,
  }),
});

registerNode({
  type: "set.add",
  label: "Set Add",
  description: "Adds a value to the set, unless it's already present.",
  group: GROUP,
  configurableElementType: {},
  pins: [setPin("number"), itemPin("item", "Item", "number"), setOutPin("number"), { id: "added", label: "Added", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [setPin(t), itemPin("item", "Item", t), setOutPin(t), { id: "added", label: "Added", type: "boolean", direction: "output" }];
  },
  evaluate: ({ inputs }) => {
    const arr = asArray(inputs.set);
    const exists = arr.some((v) => JSON.stringify(v) === JSON.stringify(inputs.item));
    return {
      result: exists ? arr.slice() : [...arr, inputs.item],
      added: !exists,
    };
  },
  compileEvaluate: ({ inputs }) => {
    const exists = `(${compileAsArray(inputs.set)}).some((v) => ${jsonEq("v", inputs.item)})`;
    return {
      result: `(${exists} ? (${compileAsArray(inputs.set)}).slice() : [...(${compileAsArray(inputs.set)}), ${inputs.item}])`,
      added: `!${exists}`,
    };
  },
});

registerNode({
  type: "set.remove",
  label: "Set Remove",
  description: "Removes a value from the set if it is present.",
  group: GROUP,
  configurableElementType: {},
  pins: [setPin("number"), itemPin("item", "Item", "number"), setOutPin("number"), { id: "removed", label: "Removed", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [setPin(t), itemPin("item", "Item", t), setOutPin(t), { id: "removed", label: "Removed", type: "boolean", direction: "output" }];
  },
  evaluate: ({ inputs }) => {
    const arr = asArray(inputs.set);
    const index = arr.findIndex((v) => JSON.stringify(v) === JSON.stringify(inputs.item));
    const removed = index !== -1;
    const result = removed ? [...arr.slice(0, index), ...arr.slice(index + 1)] : arr.slice();
    return { result, removed };
  },
  compileEvaluate: ({ inputs }) => ({
    result: `(() => { const a = (${compileAsArray(inputs.set)}); const i = a.findIndex((v) => ${jsonEq("v", inputs.item)}); return i === -1 ? a.slice() : [...a.slice(0, i), ...a.slice(i + 1)]; })()`,
    removed: `(${compileAsArray(inputs.set)}).some((v) => ${jsonEq("v", inputs.item)})`,
  }),
});

registerNode({
  type: "set.clear",
  label: "Set Clear",
  description: "Returns an empty set, discarding all elements.",
  group: GROUP,
  configurableElementType: {},
  pins: [setPin("number"), setOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [setPin(t), setOutPin(t)];
  },
  evaluate: () => ({ result: [] }),
  compileEvaluate: () => ({ result: "[]" }),
});

registerNode({
  type: "set.contains",
  label: "Set Contains",
  description: "True if the set already contains this value.",
  group: GROUP,
  configurableElementType: {},
  pins: [setPin("number"), itemPin("item", "Item", "number"), { id: "contains", label: "Contains", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [
      setPin(t),
      itemPin("item", "Item", t),
      {
        id: "contains",
        label: "Contains",
        type: "boolean",
        direction: "output",
      },
    ];
  },
  evaluate: ({ inputs }) => ({
    contains: asArray(inputs.set).some((v) => JSON.stringify(v) === JSON.stringify(inputs.item)),
  }),
  compileEvaluate: ({ inputs }) => ({
    contains: `(${compileAsArray(inputs.set)}).some((v) => ${jsonEq("v", inputs.item)})`,
  }),
});

registerNode({
  type: "set.isEmpty",
  label: "Set Is Empty",
  description: "True if the set has no elements.",
  group: GROUP,
  configurableElementType: {},
  pins: [setPin("number"), { id: "isEmpty", label: "Is Empty", type: "boolean", direction: "output" }],
  deriveInstancePins: (node) => [setPin(elementTypeOf(node)), { id: "isEmpty", label: "Is Empty", type: "boolean", direction: "output" }],
  evaluate: ({ inputs }) => ({ isEmpty: asArray(inputs.set).length === 0 }),
  compileEvaluate: ({ inputs }) => ({
    isEmpty: `((${compileAsArray(inputs.set)}).length === 0)`,
  }),
});

registerNode({
  type: "set.toArray",
  label: "Set To Array",
  description: "Converts the set's elements into an ordinary array.",
  group: GROUP,
  configurableElementType: {},
  pins: [
    setPin("number"),
    {
      id: "result",
      label: "Array",
      type: "number",
      direction: "output",
      container: "array",
    },
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [
      setPin(t),
      {
        id: "result",
        label: "Array",
        type: t,
        direction: "output",
        container: "array" as const,
      },
    ];
  },
  evaluate: ({ inputs }) => ({ result: asArray(inputs.set).slice() }),
  compileEvaluate: ({ inputs }) => ({
    result: `(${compileAsArray(inputs.set)}).slice()`,
  }),
});

registerNode({
  type: "set.union",
  label: "Set Union",
  description: "Combines two sets, keeping every distinct element from both.",
  group: GROUP,
  configurableElementType: {},
  pins: [{ ...setPin("number"), id: "a", label: "Set A" }, { ...setPin("number"), id: "b", label: "Set B" }, setOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [{ ...setPin(t), id: "a", label: "Set A" }, { ...setPin(t), id: "b", label: "Set B" }, setOutPin(t)];
  },
  evaluate: ({ inputs }) => ({
    result: dedupe([...asArray(inputs.a), ...asArray(inputs.b)]),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: compileDedupe(`[...${compileAsArray(inputs.a)}, ...${compileAsArray(inputs.b)}]`),
  }),
});

registerNode({
  type: "set.intersection",
  label: "Set Intersection",
  description: "Returns only the elements present in both sets.",
  group: GROUP,
  configurableElementType: {},
  pins: [{ ...setPin("number"), id: "a", label: "Set A" }, { ...setPin("number"), id: "b", label: "Set B" }, setOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [{ ...setPin(t), id: "a", label: "Set A" }, { ...setPin(t), id: "b", label: "Set B" }, setOutPin(t)];
  },
  evaluate: ({ inputs }) => {
    const a = asArray(inputs.a);
    const b = asArray(inputs.b);
    return {
      result: a.filter((v) => b.some((bv) => JSON.stringify(bv) === JSON.stringify(v))),
    };
  },
  compileEvaluate: ({ inputs }) => ({
    result: `(${compileAsArray(inputs.a)}).filter((v) => (${compileAsArray(inputs.b)}).some((bv) => ${jsonEq("bv", "v")}))`,
  }),
});

registerNode({
  type: "set.difference",
  label: "Set Difference",
  description: "Returns elements in the first set that aren't in the second.",
  group: GROUP,
  configurableElementType: {},
  pins: [{ ...setPin("number"), id: "a", label: "Set A" }, { ...setPin("number"), id: "b", label: "Set B" }, setOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [{ ...setPin(t), id: "a", label: "Set A" }, { ...setPin(t), id: "b", label: "Set B" }, setOutPin(t)];
  },
  evaluate: ({ inputs }) => {
    const a = asArray(inputs.a);
    const b = asArray(inputs.b);
    return {
      result: a.filter((v) => !b.some((bv) => JSON.stringify(bv) === JSON.stringify(v))),
    };
  },
  compileEvaluate: ({ inputs }) => ({
    result: `(${compileAsArray(inputs.a)}).filter((v) => !(${compileAsArray(inputs.b)}).some((bv) => ${jsonEq("bv", "v")}))`,
  }),
});

// --- Set For Each: same control-flow shape as Array For Each (see array.ts) — the one exec node
// in this file, same documented compiler gap (no compileExecute/compileEvaluate yet).
const MAX_SET_FOR_EACH_ITERATIONS = 100_000;

registerNode({
  type: "set.forEach",
  label: "Set For Each",
  description: "Runs the loop body once for each element in the set.",
  group: GROUP,
  configurableElementType: {},
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    setPin("number"),
    { id: "loop-body", label: "Loop Body", type: "exec", direction: "output" },
    { id: "element", label: "Element", type: "number", direction: "output" },
    { id: "index", label: "Index", type: "number", direction: "output" },
    { id: "completed", label: "Completed", type: "exec", direction: "output" },
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      setPin(t),
      {
        id: "loop-body",
        label: "Loop Body",
        type: "exec",
        direction: "output",
      },
      { id: "element", label: "Element", type: t, direction: "output" },
      { id: "index", label: "Index", type: "number", direction: "output" },
      {
        id: "completed",
        label: "Completed",
        type: "exec",
        direction: "output",
      },
    ];
  },
  // Disabled must skip straight to "completed" — never firing "loop-body" — same rationale as
  // flow.forLoop (see its own comment and NodeDef.disabledNextExec).
  disabledNextExec: ["completed"],
  // Latent only if its body is — same reasoning as flow.forLoop. See NodeDef.latentBodyPin.
  latentBodyPins: () => ["loop-body"],
  execute: async ({ node, inputs, ctx }) => {
    const arr = asArray(inputs.set);
    if (arr.length > MAX_SET_FOR_EACH_ITERATIONS) {
      throw new Error(`Set For Each (${node.id}) would run ${arr.length} iterations, over the ${MAX_SET_FOR_EACH_ITERATIONS} limit.`);
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
