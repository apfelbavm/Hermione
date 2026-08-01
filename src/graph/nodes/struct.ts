import { registerNode } from "../../engine/registry";
import { NodeColorCategory } from "../../engine/types";
import type { PinDef } from "../../engine/types";
import { NodeInstance } from "../../engine/nodeInstance";
import { allStructTypeDefs, defaultStructValue, tryGetStructTypeDef } from "../../engine/structRegistry";
import { i18n } from "@i18n";

const GROUP = i18n.nodes.struct.group;

const VALUE_PIN_ID = "value";

/** Every field pin this struct's registered fields resolve to, in `direction` (Make has them as
 * inputs, Break has them as outputs) — see structRegistry.ts's StructFieldDef. Tolerates an unknown
 * (or not-yet-registered) subType by yielding no field pins, since this also has to work for the
 * hardcoded `pins` shown before any NodeInstance/subType exists (e.g. the node search menu). */
function fieldPins(subType: string, direction: "input" | "output"): PinDef[] {
  return (tryGetStructTypeDef(subType)?.fields ?? []).map((field) => ({
    ...field,
    direction,
  }));
}

function structValuePin(subType: string, direction: "input" | "output"): PinDef {
  const def = tryGetStructTypeDef(subType);
  return {
    id: VALUE_PIN_ID,
    label: def?.label ?? i18n.nodes.struct.pin_value,
    type: "struct",
    subType,
    direction,
    defaultValue: direction === "input" ? (def ? defaultStructValue(def) : {}) : undefined,
  };
}

// Both node types share one hardcoded default struct type for their static `pins` (used before a
// NodeInstance exists, e.g. for the node search menu's preview) — the real, per-instance shape
// always comes from deriveInstancePins/node.subType once placed (see NodeDef.configurableSubType).
const FALLBACK_SUBTYPE = allStructTypeDefs()[0]?.id ?? "";

function subTypeOf(node: NodeInstance): string {
  return node.subType ?? FALLBACK_SUBTYPE;
}

registerNode({
  type: "struct.make",
  label: i18n.nodes.struct.make.label,
  description: i18n.nodes.struct.make.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableSubType: { kind: "struct" },
  pins: [...fieldPins(FALLBACK_SUBTYPE, "input"), structValuePin(FALLBACK_SUBTYPE, "output")],
  deriveInstancePins: (node) => {
    const subType = subTypeOf(node);
    return [...fieldPins(subType, "input"), structValuePin(subType, "output")];
  },
  evaluate: ({ node, inputs }) => {
    const value: Record<string, unknown> = {};
    for (const field of tryGetStructTypeDef(subTypeOf(node))?.fields ?? []) value[field.id] = inputs[field.id];
    return { [VALUE_PIN_ID]: value };
  },
});

registerNode({
  type: "struct.break",
  label: i18n.nodes.struct.break.label,
  description: i18n.nodes.struct.break.description,
  group: GROUP,
  colorCategory: NodeColorCategory.Collections,
  configurableSubType: { kind: "struct" },
  pins: [structValuePin(FALLBACK_SUBTYPE, "input"), ...fieldPins(FALLBACK_SUBTYPE, "output")],
  deriveInstancePins: (node) => {
    const subType = subTypeOf(node);
    return [structValuePin(subType, "input"), ...fieldPins(subType, "output")];
  },
  evaluate: ({ node, inputs }) => {
    const struct = (inputs[VALUE_PIN_ID] as Record<string, unknown> | undefined) ?? {};
    const result: Record<string, unknown> = {};
    for (const field of tryGetStructTypeDef(subTypeOf(node))?.fields ?? []) result[field.id] = struct[field.id];
    return result;
  },
});
