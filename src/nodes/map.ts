import { DEFAULT_VALUE_BY_TYPE } from "../engine/graphMutations";
import { registerNode } from "../engine/registry";
import { connectionsFrom } from "../engine/graphQueries";
import { runExecFrom } from "../engine/executor";
import type { PinDef, PinType } from "../engine/types";
import { NodeInstance } from "../engine/nodeInstance";

// Sibling of array.ts/set.ts — same pure-dataflow philosophy (see array.ts's header comment), just
// for Map<K,V>. Backed by a plain array of {key,value} entries (see the plan's rationale: no real
// ES Map instance, since those don't survive JSON.stringify/parse and would break save/load).
// Every map node needs BOTH a value type (NodeInstance.elementType, same field array/set nodes use)
// AND a key type (NodeInstance.mapKeyType) configured per instance — see
// NodeDef.configurableElementType's includeKeyType flag.

const GROUP = "Container.Map";

interface MapEntry {
  key: unknown;
  value: unknown;
}

function valueTypeOf(node: NodeInstance): PinType {
  return node.elementType ?? "number";
}

function keyTypeOf(node: NodeInstance): PinType {
  return node.mapKeyType ?? "string";
}

function asEntries(value: unknown): MapEntry[] {
  return Array.isArray(value) ? (value as MapEntry[]) : [];
}

function compileAsEntries(expr: string): string {
  return `(Array.isArray(${expr}) ? (${expr}) : [])`;
}

function jsonEq(aExpr: string, bExpr: string): string {
  return `(JSON.stringify(${aExpr}) === JSON.stringify(${bExpr}))`;
}

function mapPin(
  valueType: PinType,
  keyType: PinType,
  id = "map",
  label = "Map",
): PinDef {
  return {
    id,
    label,
    type: valueType,
    direction: "input",
    container: "map",
    keyType,
    defaultValue: [],
  };
}

function mapOutPin(
  valueType: PinType,
  keyType: PinType,
  label = "Map",
): PinDef {
  return {
    id: "result",
    label,
    type: valueType,
    direction: "output",
    container: "map",
    keyType,
  };
}

function keyPin(keyType: PinType, id = "key", label = "Key"): PinDef {
  return {
    id,
    label,
    type: keyType,
    direction: "input",
    defaultValue: DEFAULT_VALUE_BY_TYPE[keyType],
  };
}

function valuePin(
  valueType: PinType,
  id: string,
  label: string,
  direction: "input" | "output" = "input",
): PinDef {
  return {
    id,
    label,
    type: valueType,
    direction,
    defaultValue:
      direction === "input" ? DEFAULT_VALUE_BY_TYPE[valueType] : undefined,
  };
}

// --- Make Map: variadic KEY+VALUE PAIRS, added/removed together — see NodeDef.onInstancePinRemoved
// (Part D of the plan): only the value-N side is individually removable via the canvas's generic
// right-click "Delete", and removing it takes its paired key-N along with it, so an entry can never
// be left half-deleted.

const KEY_PREFIX = "key-";
const VALUE_PREFIX = "value-";

function entrySuffix(pinId: string, prefix: string): number {
  return Number(pinId.slice(prefix.length));
}

function makeMapEntrySuffixes(node: NodeInstance): number[] {
  return Object.keys(node.pins)
    .filter((id) => id.startsWith(VALUE_PREFIX))
    .map((id) => entrySuffix(id, VALUE_PREFIX))
    .sort((a, b) => a - b);
}

function makeMapEntryPins(node: NodeInstance): PinDef[] {
  const keyType = keyTypeOf(node);
  const valueType = valueTypeOf(node);
  const pins: PinDef[] = [];
  makeMapEntrySuffixes(node).forEach((i, position) => {
    pins.push({
      id: `${KEY_PREFIX}${i}`,
      label: `Key ${position + 1}`,
      type: keyType,
      direction: "input",
      defaultValue: DEFAULT_VALUE_BY_TYPE[keyType],
    });
    pins.push({
      id: `${VALUE_PREFIX}${i}`,
      label: `Value ${position + 1}`,
      type: valueType,
      direction: "input",
      defaultValue: DEFAULT_VALUE_BY_TYPE[valueType],
      removable: true,
    });
  });
  return pins;
}

registerNode({
  type: "map.make",
  label: "Make Map",
  description: "Builds a new map from the given key-value pairs.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    {
      id: `${KEY_PREFIX}0`,
      label: "Key 1",
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: `${VALUE_PREFIX}0`,
      label: "Value 1",
      type: "number",
      direction: "input",
      defaultValue: 0,
      removable: true,
    },
    mapOutPin("number", "string"),
  ],
  deriveInstancePins: (node) => [
    ...makeMapEntryPins(node),
    mapOutPin(valueTypeOf(node), keyTypeOf(node)),
  ],
  addInstancePinEntry: (node) => {
    const suffixes = makeMapEntrySuffixes(node);
    const next = suffixes.length === 0 ? 0 : Math.max(...suffixes) + 1;
    node.pins[`${KEY_PREFIX}${next}`] = {
      value: DEFAULT_VALUE_BY_TYPE[keyTypeOf(node)],
    };
    node.pins[`${VALUE_PREFIX}${next}`] = {
      value: DEFAULT_VALUE_BY_TYPE[valueTypeOf(node)],
    };
  },
  onInstancePinRemoved: (_node, removedPinId) => {
    if (!removedPinId.startsWith(VALUE_PREFIX)) return [];
    return [`${KEY_PREFIX}${entrySuffix(removedPinId, VALUE_PREFIX)}`];
  },
  evaluate: ({ node, inputs }) => ({
    result: makeMapEntrySuffixes(node).map((i) => ({
      key: inputs[`${KEY_PREFIX}${i}`],
      value: inputs[`${VALUE_PREFIX}${i}`],
    })),
  }),
  compileEvaluate: ({ node, inputs }) => ({
    result: `[${makeMapEntrySuffixes(node)
      .map(
        (i) =>
          `{ key: ${inputs[`${KEY_PREFIX}${i}`]}, value: ${inputs[`${VALUE_PREFIX}${i}`]} }`,
      )
      .join(", ")}]`,
  }),
});

registerNode({
  type: "map.length",
  label: "Map Length",
  description: "Returns how many key-value pairs are in the map.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    { id: "length", label: "Length", type: "number", direction: "output" },
  ],
  deriveInstancePins: (node) => [
    mapPin(valueTypeOf(node), keyTypeOf(node)),
    { id: "length", label: "Length", type: "number", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ length: asEntries(inputs.map).length }),
  compileEvaluate: ({ inputs }) => ({
    length: `(${compileAsEntries(inputs.map)}).length`,
  }),
});

registerNode({
  type: "map.set",
  label: "Map Add",
  description: "Sets the value for a key, adding it or overwriting the existing one.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    keyPin("string"),
    valuePin("number", "value", "Value"),
    mapOutPin("number", "string"),
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      keyPin(k),
      valuePin(v, "value", "Value"),
      mapOutPin(v, k),
    ];
  },
  evaluate: ({ inputs }) => {
    const entries = asEntries(inputs.map).slice();
    const index = entries.findIndex(
      (e) => JSON.stringify(e.key) === JSON.stringify(inputs.key),
    );
    if (index !== -1) entries[index] = { key: inputs.key, value: inputs.value };
    else entries.push({ key: inputs.key, value: inputs.value });
    return { result: entries };
  },
  compileEvaluate: ({ inputs }) => ({
    result: `(() => { const entries = (${compileAsEntries(inputs.map)}).slice(); const i = entries.findIndex((e) => ${jsonEq("e.key", inputs.key)}); const entry = { key: ${inputs.key}, value: ${inputs.value} }; if (i !== -1) entries[i] = entry; else entries.push(entry); return entries; })()`,
  }),
});

registerNode({
  type: "map.remove",
  label: "Map Remove",
  description: "Removes the entry for a key, if one exists.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    keyPin("string"),
    mapOutPin("number", "string"),
    { id: "removed", label: "Removed", type: "boolean", direction: "output" },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      keyPin(k),
      mapOutPin(v, k),
      { id: "removed", label: "Removed", type: "boolean", direction: "output" },
    ];
  },
  evaluate: ({ inputs }) => {
    const entries = asEntries(inputs.map);
    const index = entries.findIndex(
      (e) => JSON.stringify(e.key) === JSON.stringify(inputs.key),
    );
    const removed = index !== -1;
    const result = removed
      ? [...entries.slice(0, index), ...entries.slice(index + 1)]
      : entries.slice();
    return { result, removed };
  },
  compileEvaluate: ({ inputs }) => ({
    result: `(() => { const entries = (${compileAsEntries(inputs.map)}); const i = entries.findIndex((e) => ${jsonEq("e.key", inputs.key)}); return i === -1 ? entries.slice() : [...entries.slice(0, i), ...entries.slice(i + 1)]; })()`,
    removed: `(${compileAsEntries(inputs.map)}).some((e) => ${jsonEq("e.key", inputs.key)})`,
  }),
});

registerNode({
  type: "map.clear",
  label: "Map Clear",
  description: "Returns an empty map, discarding all entries.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [mapPin("number", "string"), mapOutPin("number", "string")],
  deriveInstancePins: (node) => [
    mapPin(valueTypeOf(node), keyTypeOf(node)),
    mapOutPin(valueTypeOf(node), keyTypeOf(node)),
  ],
  evaluate: () => ({ result: [] }),
  compileEvaluate: () => ({ result: "[]" }),
});

registerNode({
  type: "map.containsKey",
  label: "Map Contains Key",
  description: "True if the map has an entry stored under this key.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    keyPin("string"),
    { id: "contains", label: "Contains", type: "boolean", direction: "output" },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      keyPin(k),
      {
        id: "contains",
        label: "Contains",
        type: "boolean",
        direction: "output",
      },
    ];
  },
  evaluate: ({ inputs }) => ({
    contains: asEntries(inputs.map).some(
      (e) => JSON.stringify(e.key) === JSON.stringify(inputs.key),
    ),
  }),
  compileEvaluate: ({ inputs }) => ({
    contains: `(${compileAsEntries(inputs.map)}).some((e) => ${jsonEq("e.key", inputs.key)})`,
  }),
});

registerNode({
  type: "map.find",
  label: "Map Find",
  description: "Returns the value stored under a key, and whether it was found.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    keyPin("string"),
    valuePin("number", "value", "Value", "output"),
    { id: "found", label: "Found", type: "boolean", direction: "output" },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      keyPin(k),
      valuePin(v, "value", "Value", "output"),
      { id: "found", label: "Found", type: "boolean", direction: "output" },
    ];
  },
  evaluate: ({ node, inputs }) => {
    const entry = asEntries(inputs.map).find(
      (e) => JSON.stringify(e.key) === JSON.stringify(inputs.key),
    );
    return {
      value: entry ? entry.value : DEFAULT_VALUE_BY_TYPE[valueTypeOf(node)],
      found: !!entry,
    };
  },
  compileEvaluate: ({ node, inputs }) => {
    const fallback = JSON.stringify(DEFAULT_VALUE_BY_TYPE[valueTypeOf(node)]);
    return {
      value: `(() => { const entry = (${compileAsEntries(inputs.map)}).find((e) => ${jsonEq("e.key", inputs.key)}); return entry ? entry.value : ${fallback}; })()`,
      found: `(${compileAsEntries(inputs.map)}).some((e) => ${jsonEq("e.key", inputs.key)})`,
    };
  },
});

registerNode({
  type: "map.keys",
  label: "Map Keys",
  description: "Returns an array of every key currently in the map.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    {
      id: "result",
      label: "Keys",
      type: "string",
      direction: "output",
      container: "array",
    },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      {
        id: "result",
        label: "Keys",
        type: k,
        direction: "output",
        container: "array" as const,
      },
    ];
  },
  evaluate: ({ inputs }) => ({
    result: asEntries(inputs.map).map((e) => e.key),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(${compileAsEntries(inputs.map)}).map((e) => e.key)`,
  }),
});

registerNode({
  type: "map.values",
  label: "Map Values",
  description: "Returns an array of every value currently in the map.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    {
      id: "result",
      label: "Values",
      type: "number",
      direction: "output",
      container: "array",
    },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      {
        id: "result",
        label: "Values",
        type: v,
        direction: "output",
        container: "array" as const,
      },
    ];
  },
  evaluate: ({ inputs }) => ({
    result: asEntries(inputs.map).map((e) => e.value),
  }),
  compileEvaluate: ({ inputs }) => ({
    result: `(${compileAsEntries(inputs.map)}).map((e) => e.value)`,
  }),
});

registerNode({
  type: "map.isEmpty",
  label: "Map Is Empty",
  description: "True if the map has no entries.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    { id: "isEmpty", label: "Is Empty", type: "boolean", direction: "output" },
  ],
  deriveInstancePins: (node) => [
    mapPin(valueTypeOf(node), keyTypeOf(node)),
    { id: "isEmpty", label: "Is Empty", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({ isEmpty: asEntries(inputs.map).length === 0 }),
  compileEvaluate: ({ inputs }) => ({
    isEmpty: `((${compileAsEntries(inputs.map)}).length === 0)`,
  }),
});

// --- Map For Each: same control-flow shape as Array/Set For Each — the one exec node in this
// file, same documented compiler gap (no compileExecute/compileEvaluate yet).
const MAX_MAP_FOR_EACH_ITERATIONS = 100_000;

registerNode({
  type: "map.forEach",
  label: "Map For Each",
  description: "Runs the loop body once for each key-value pair in the map.",
  group: GROUP,
  configurableElementType: { includeKeyType: true },
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    mapPin("number", "string"),
    { id: "loop-body", label: "Loop Body", type: "exec", direction: "output" },
    { id: "key", label: "Key", type: "string", direction: "output" },
    valuePin("number", "value", "Value", "output"),
    { id: "completed", label: "Completed", type: "exec", direction: "output" },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      mapPin(v, k),
      {
        id: "loop-body",
        label: "Loop Body",
        type: "exec",
        direction: "output",
      },
      { id: "key", label: "Key", type: k, direction: "output" },
      valuePin(v, "value", "Value", "output"),
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
    const entries = asEntries(inputs.map);
    if (entries.length > MAX_MAP_FOR_EACH_ITERATIONS) {
      throw new Error(
        `Map For Each (${node.id}) would run ${entries.length} iterations, over the ${MAX_MAP_FOR_EACH_ITERATIONS} limit.`,
      );
    }
    const bodyTargets = connectionsFrom(ctx.graph, node.id, "loop-body");
    for (const entry of entries) {
      ctx.execOutputs.set(`${node.id}:key`, entry.key);
      ctx.execOutputs.set(`${node.id}:value`, entry.value);
      for (const conn of bodyTargets) {
        await runExecFrom(conn.toNode, conn.toPin, ctx);
      }
    }
    return { nextExec: "completed" };
  },
});
