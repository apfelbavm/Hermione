import { allNodeDefs, topLevelGroup, tryGetNodeDef } from "../engine/registry";
import type { NodeDef, PinDef } from "../engine/types";
import type { NodeTypeMetadata, PortMetadata } from "./types";

function toPortMetadata(pin: PinDef): PortMetadata {
  const isExec = pin.type === "exec";
  return {
    id: pin.id,
    label: pin.label,
    direction: pin.direction,
    type: pin.type,
    container: pin.container,
    keyType: pin.keyType,
    subType: pin.subType,
    defaultValue: pin.defaultValue,
    options: pin.options,
    integer: pin.integer,
    removable: pin.removable,
    required: pin.direction === "input" && isExec,
    allowsMultipleConnections: pin.direction === "output" ? !isExec : isExec,
  };
}

/** Adapts a registered NodeDef into the AI-facing metadata shape — the registry (see registry.ts)
 * remains the single source of truth the visual editor itself reads from; this never stores a
 * second copy of a node's pins/behavior. */
export function describeNodeType(def: NodeDef): NodeTypeMetadata {
  return {
    type: def.type,
    label: def.label,
    description: def.description,
    group: def.group,
    category: topLevelGroup(def.group),
    colorCategory: def.colorCategory,
    ports: def.pins.map(toPortMetadata),
    detailProperties: (def.detailProperties ?? []).map(toPortMetadata),
    isEventTrigger: !!def.eventTrigger,
    eventKind: def.eventTrigger?.kind,
    latent: def.latent,
    compact: def.compact,
    headerOnly: def.headerOnly,
    hasVariableBinding: !!def.derivePins,
    hasFunctionBinding: !!def.deriveFunctionPins,
    hasScriptBinding: !!def.deriveScriptPins,
    configurableElementType: !!def.configurableElementType,
    configurableSubType: !!def.configurableSubType,
    editableInputs: !!def.editableInputs,
    editableOutputs: !!def.editableOutputs,
  };
}

export function allNodeTypeMetadata(): NodeTypeMetadata[] {
  return allNodeDefs().map(describeNodeType);
}

export function getNodeTypeMetadata(type: string): NodeTypeMetadata | undefined {
  const def = tryGetNodeDef(type);
  return def ? describeNodeType(def) : undefined;
}

export interface NodeTypeFilter {
  category?: string;
  search?: string;
  limit?: number;
}

export function findNodeTypes(filter: NodeTypeFilter = {}): NodeTypeMetadata[] {
  let results = allNodeTypeMetadata();
  if (filter.category) {
    const category = filter.category.toLowerCase();
    results = results.filter((m) => m.category.toLowerCase() === category);
  }
  if (filter.search) {
    const terms = filter.search.toLowerCase().split(/\s+/).filter(Boolean);
    results = results.filter((m) => {
      const haystack = `${m.type} ${m.label} ${m.description} ${m.group}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }
  // Each result carries its full port list, so an unfiltered/broad call here is the single
  // biggest token cost in the AI chat loop (see docs/architecture.md's AI section) — keep the
  // default cap small and push callers toward category/search filters or searchNodeTypes.
  return results.slice(0, filter.limit ?? 20);
}

/** Ranked free-text search over every registered node type — matches on type id, label,
 * description, group and port labels, scoring an exact/whole-word label match highest so e.g.
 * "JSON text conversion" surfaces the most relevant converter node(s) first. */
export function searchNodeTypes(query: string, limit: number = 15): NodeTypeMetadata[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored = allNodeTypeMetadata()
    .map((m) => {
      const label = m.label.toLowerCase();
      const haystack = `${m.type} ${label} ${m.description} ${m.group} ${m.ports.map((p) => p.label).join(" ")}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (label === term) score += 5;
        else if (label.includes(term)) score += 3;
        else if (haystack.includes(term)) score += 1;
      }
      return { m, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((r) => r.m);
}
