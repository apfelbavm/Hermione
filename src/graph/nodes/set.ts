import { DEFAULT_VALUE_BY_TYPE } from "../../engine/graphMutations";
import { registerNode } from "../../engine/registry";
import { connectionsFrom } from "../../engine/graphQueries";
import { runExecFrom } from "../../engine/executor";
import { NodeColorCategory } from "../../engine/types";
import type { PinDef, PinType } from "../../engine/types";
import { NodeInstance } from "../../engine/nodeInstance";
import { i18n } from "@i18n";

const GROUP = i18n.nodes.set.group;

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

function setPin(elementType: PinType, id = "set", label = i18n.nodes.set.pin_set_in): PinDef {
  return {
    id,
    label,
    type: elementType,
    direction: "input",
    container: "set",
    defaultValue: [],
  };
}

function setOutPin(elementType: PinType, label = i18n.nodes.set.pin_result): PinDef {
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
    label: `${i18n.nodes.set.pin_element} ${i + 1}`,
    type: elementType,
    direction: "input" as const,
    defaultValue: DEFAULT_VALUE_BY_TYPE[elementType],
    removable: true,
  }));
}

registerNode({
  type: "set.make",
  label: i18n.nodes.set.make.label,
  description: i18n.nodes.set.make.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    {
      id: `${ENTRY_PREFIX}0`,
      label: `${i18n.nodes.set.pin_element} 1`,
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
  label: i18n.nodes.set.length.label,
  description: i18n.nodes.set.length.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    setPin("number"),
    {
      id: "length",
      label: i18n.nodes.__shared.pin_length,
      type: "number",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => [
    setPin(elementTypeOf(node)),
    {
      id: "length",
      label: i18n.nodes.__shared.pin_length,
      type: "number",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({ length: asArray(inputs.set).length }),
  compileEvaluate: ({ inputs }) => ({
    length: `(${compileAsArray(inputs.set)}).length`,
  }),
});

registerNode({
  type: "set.add",
  label: i18n.nodes.set.add.label,
  description: i18n.nodes.set.add.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    setPin("number"),
    itemPin("item", i18n.nodes.__shared.pin_item, "number"),
    setOutPin("number"),
    {
      id: "added",
      label: i18n.nodes.set.add.pin_added,
      type: "boolean",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [
      setPin(t),
      itemPin("item", i18n.nodes.__shared.pin_item, t),
      setOutPin(t),
      {
        id: "added",
        label: i18n.nodes.set.add.pin_added,
        type: "boolean",
        direction: "output",
      },
    ];
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
  label: i18n.nodes.set.remove.label,
  description: i18n.nodes.set.remove.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    setPin("number"),
    itemPin("item", i18n.nodes.__shared.pin_item, "number"),
    setOutPin("number"),
    {
      id: "removed",
      label: i18n.nodes.__shared.pin_removed,
      type: "boolean",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [
      setPin(t),
      itemPin("item", i18n.nodes.__shared.pin_item, t),
      setOutPin(t),
      {
        id: "removed",
        label: i18n.nodes.__shared.pin_removed,
        type: "boolean",
        direction: "output",
      },
    ];
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
  label: i18n.nodes.set.clear.label,
  description: i18n.nodes.set.clear.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
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
  label: i18n.nodes.set.contains.label,
  description: i18n.nodes.set.contains.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    setPin("number"),
    itemPin("item", i18n.nodes.__shared.pin_item, "number"),
    {
      id: "contains",
      label: i18n.nodes.__shared.pin_contains,
      type: "boolean",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [
      setPin(t),
      itemPin("item", i18n.nodes.__shared.pin_item, t),
      {
        id: "contains",
        label: i18n.nodes.__shared.pin_contains,
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
  label: i18n.nodes.set.isEmpty.label,
  description: i18n.nodes.set.isEmpty.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    setPin("number"),
    {
      id: "isEmpty",
      label: i18n.nodes.set.isEmpty.pin_is_empty,
      type: "boolean",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => [
    setPin(elementTypeOf(node)),
    {
      id: "isEmpty",
      label: i18n.nodes.set.isEmpty.pin_is_empty,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({ isEmpty: asArray(inputs.set).length === 0 }),
  compileEvaluate: ({ inputs }) => ({
    isEmpty: `((${compileAsArray(inputs.set)}).length === 0)`,
  }),
});

registerNode({
  type: "set.toArray",
  label: i18n.nodes.set.toArray.label,
  description: i18n.nodes.set.toArray.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    setPin("number"),
    {
      id: "result",
      label: i18n.nodes.set.toArray.pin_array,
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
        label: i18n.nodes.set.toArray.pin_array,
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
  label: i18n.nodes.set.union.label,
  description: i18n.nodes.set.union.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [{ ...setPin("number"), id: "a", label: i18n.nodes.set.union.pin_set_a }, { ...setPin("number"), id: "b", label: i18n.nodes.set.union.pin_set_b }, setOutPin("number")],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [{ ...setPin(t), id: "a", label: i18n.nodes.set.union.pin_set_a }, { ...setPin(t), id: "b", label: i18n.nodes.set.union.pin_set_b }, setOutPin(t)];
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
  label: i18n.nodes.set.intersection.label,
  description: i18n.nodes.set.intersection.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    {
      ...setPin("number"),
      id: "a",
      label: i18n.nodes.set.intersection.pin_set_a,
    },
    {
      ...setPin("number"),
      id: "b",
      label: i18n.nodes.set.intersection.pin_set_b,
    },
    setOutPin("number"),
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [{ ...setPin(t), id: "a", label: i18n.nodes.set.intersection.pin_set_a }, { ...setPin(t), id: "b", label: i18n.nodes.set.intersection.pin_set_b }, setOutPin(t)];
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
  label: i18n.nodes.set.difference.label,
  description: i18n.nodes.set.difference.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    {
      ...setPin("number"),
      id: "a",
      label: i18n.nodes.set.difference.pin_set_a,
    },
    {
      ...setPin("number"),
      id: "b",
      label: i18n.nodes.set.difference.pin_set_b,
    },
    setOutPin("number"),
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [{ ...setPin(t), id: "a", label: i18n.nodes.set.difference.pin_set_a }, { ...setPin(t), id: "b", label: i18n.nodes.set.difference.pin_set_b }, setOutPin(t)];
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

const MAX_SET_FOR_EACH_ITERATIONS = 100_000;

registerNode({
  type: "set.forEach",
  label: i18n.nodes.set.forEach.label,
  description: i18n.nodes.set.forEach.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableElementType: {},
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    setPin("number"),
    {
      id: "loop-body",
      label: i18n.nodes.__shared.pin_loop_body,
      type: "exec",
      direction: "output",
    },
    {
      id: "element",
      label: i18n.nodes.set.pin_element,
      type: "number",
      direction: "output",
    },
    {
      id: "index",
      label: i18n.nodes.__shared.pin_index,
      type: "number",
      direction: "output",
    },
    {
      id: "completed",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => {
    const t = elementTypeOf(node);
    return [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      setPin(t),
      {
        id: "loop-body",
        label: i18n.nodes.__shared.pin_loop_body,
        type: "exec",
        direction: "output",
      },
      {
        id: "element",
        label: i18n.nodes.set.pin_element,
        type: t,
        direction: "output",
      },
      {
        id: "index",
        label: i18n.nodes.__shared.pin_index,
        type: "number",
        direction: "output",
      },
      {
        id: "completed",
        label: i18n.nodes.__shared.pin_completed,
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
