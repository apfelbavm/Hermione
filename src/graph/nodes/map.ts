import { DEFAULT_VALUE_BY_TYPE } from "../../engine/graphMutations";
import { registerNode } from "../../engine/registry";
import { connectionsFrom } from "../../engine/graphQueries";
import { runExecFrom } from "../../engine/executor";
import { NodeColorCategory } from "../../engine/types";
import type { PinDef, PinType } from "../../engine/types";
import { NodeInstance } from "../../engine/nodeInstance";
import { i18n } from "@i18n";

const GROUP = i18n.nodes.map.group;

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
  label = i18n.nodes.map.pin_map,
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
  label = i18n.nodes.map.pin_result,
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

function keyPin(
  keyType: PinType,
  id = "key",
  label = i18n.nodes.map.pin_key,
): PinDef {
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
      label: `${i18n.nodes.map.make.pin_key_n} ${position + 1}`,
      type: keyType,
      direction: "input",
      defaultValue: DEFAULT_VALUE_BY_TYPE[keyType],
    });
    pins.push({
      id: `${VALUE_PREFIX}${i}`,
      label: `${i18n.nodes.map.make.pin_value_n} ${position + 1}`,
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
  label: i18n.nodes.map.make.label,
  description: i18n.nodes.map.make.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    {
      id: `${KEY_PREFIX}0`,
      label: `${i18n.nodes.map.make.pin_key_n} 1`,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: `${VALUE_PREFIX}0`,
      label: `${i18n.nodes.map.make.pin_value_n} 1`,
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
  label: i18n.nodes.map.length.label,
  description: i18n.nodes.map.length.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    {
      id: "length",
      label: i18n.nodes.__shared.pin_length,
      type: "number",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => [
    mapPin(valueTypeOf(node), keyTypeOf(node)),
    {
      id: "length",
      label: i18n.nodes.__shared.pin_length,
      type: "number",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({ length: asEntries(inputs.map).length }),
  compileEvaluate: ({ inputs }) => ({
    length: `(${compileAsEntries(inputs.map)}).length`,
  }),
});

registerNode({
  type: "map.set",
  label: i18n.nodes.map.set.label,
  description: i18n.nodes.map.set.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
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
  label: i18n.nodes.map.remove.label,
  description: i18n.nodes.map.remove.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    keyPin("string"),
    mapOutPin("number", "string"),
    {
      id: "removed",
      label: i18n.nodes.__shared.pin_removed,
      type: "boolean",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      keyPin(k),
      mapOutPin(v, k),
      {
        id: "removed",
        label: i18n.nodes.__shared.pin_removed,
        type: "boolean",
        direction: "output",
      },
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
  label: i18n.nodes.map.clear.label,
  description: i18n.nodes.map.clear.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
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
  label: i18n.nodes.map.containsKey.label,
  description: i18n.nodes.map.containsKey.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    keyPin("string"),
    {
      id: "contains",
      label: i18n.nodes.__shared.pin_contains,
      type: "boolean",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      keyPin(k),
      {
        id: "contains",
        label: i18n.nodes.__shared.pin_contains,
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
  label: i18n.nodes.map.find.label,
  description: i18n.nodes.map.find.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    keyPin("string"),
    valuePin("number", "value", "Value", "output"),
    {
      id: "found",
      label: i18n.nodes.map.find.pin_found,
      type: "boolean",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      mapPin(v, k),
      keyPin(k),
      valuePin(v, "value", "Value", "output"),
      {
        id: "found",
        label: i18n.nodes.map.find.pin_found,
        type: "boolean",
        direction: "output",
      },
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
  label: i18n.nodes.map.keys.label,
  description: i18n.nodes.map.keys.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    {
      id: "result",
      label: i18n.nodes.map.keys.pin_keys,
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
        label: i18n.nodes.map.keys.pin_keys,
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
  label: i18n.nodes.map.values.label,
  description: i18n.nodes.map.values.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    {
      id: "result",
      label: i18n.nodes.map.values.pin_values,
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
        label: i18n.nodes.map.values.pin_values,
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
  label: i18n.nodes.map.isEmpty.label,
  description: i18n.nodes.map.isEmpty.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    mapPin("number", "string"),
    {
      id: "isEmpty",
      label: i18n.nodes.map.isEmpty.pin_is_empty,
      type: "boolean",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => [
    mapPin(valueTypeOf(node), keyTypeOf(node)),
    {
      id: "isEmpty",
      label: i18n.nodes.map.isEmpty.pin_is_empty,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({ isEmpty: asEntries(inputs.map).length === 0 }),
  compileEvaluate: ({ inputs }) => ({
    isEmpty: `((${compileAsEntries(inputs.map)}).length === 0)`,
  }),
});

const MAX_MAP_FOR_EACH_ITERATIONS = 100_000;

registerNode({
  type: "map.forEach",
  label: i18n.nodes.map.forEach.label,
  description: i18n.nodes.map.forEach.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: { includeKeyType: true },
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    mapPin("number", "string"),
    {
      id: "loop-body",
      label: i18n.nodes.__shared.pin_loop_body,
      type: "exec",
      direction: "output",
    },
    {
      id: "key",
      label: i18n.nodes.map.pin_key,
      type: "string",
      direction: "output",
    },
    valuePin("number", "value", "Value", "output"),
    {
      id: "completed",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => {
    const v = valueTypeOf(node);
    const k = keyTypeOf(node);
    return [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      mapPin(v, k),
      {
        id: "loop-body",
        label: i18n.nodes.__shared.pin_loop_body,
        type: "exec",
        direction: "output",
      },
      {
        id: "key",
        label: i18n.nodes.map.pin_key,
        type: k,
        direction: "output",
      },
      valuePin(v, "value", "Value", "output"),
      {
        id: "completed",
        label: i18n.nodes.__shared.pin_completed,
        type: "exec",
        direction: "output",
      },
    ];
  },

  disabledNextExec: ["completed"],

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
