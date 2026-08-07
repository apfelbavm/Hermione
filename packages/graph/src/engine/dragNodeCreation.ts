import { NodeInstance } from "./nodeInstance";
import { allNodeDefs, isPinTypeCompatible, type PinTypeShape } from "./registry";
import type { NodeDef, PinDef, PinType } from "./types";

/** What to seed onto a freshly-created NodeInstance so a "wildcard" configurableElementType/
 * configurableSubType node (Array/Set/Map operations, Struct Make/Break) takes on the exact type
 * being dragged, instead of its hardcoded fallback (see NodeInstance.createNodeInstance) — same
 * fields Graph.changeNodeElementType/changeNodeSubType accept, just computed up front. */
interface DragConfig {
  elementType?: PinType;
  elementSubType?: string;
  mapKeyType?: PinType;
  subType?: string;
}

/** Every configuration worth trying for `def` against the dragged `pin`, cheapest/most-specific
 * first: the node's own unmodified defaults, then (for a struct.make/struct.break-shaped def)
 * that exact struct class, then (for an Array/Set/Map-shaped def) the dragged pin's type as
 * either the whole container, a single element/value, or — for a Map — a single key. Several of
 * these are no-ops for most defs (e.g. a plain "number" pin never touches struct/map handling)
 * but trying them unconditionally is far simpler than working out in advance which apply. */
function candidateConfigs(def: NodeDef, pin: PinTypeShape): DragConfig[] {
  const configs: DragConfig[] = [{}];

  if (def.configurableSubType?.kind === "struct" && pin.type === "struct" && pin.subType) {
    configs.push({ subType: pin.subType });
  }

  if (def.configurableElementType) {
    configs.push({ elementType: pin.type, elementSubType: pin.subType, mapKeyType: pin.container === "map" ? pin.keyType : undefined });
    if ((pin.container ?? "single") === "single") {
      configs.push({ elementType: pin.type, elementSubType: pin.subType });
      if (def.configurableElementType.includeKeyType) configs.push({ mapKeyType: pin.type });
    }
  }

  return configs;
}

/** `def`'s pins under `config` — its own hardcoded `pins` unmodified for the (near-universal)
 * empty config, otherwise a throwaway instance seeded with `config` and run through the node
 * type's own deriveInstancePins, exactly as a real placed instance would resolve them. */
function pinsFor(def: NodeDef, config: DragConfig): PinDef[] {
  if (!config.elementType && !config.subType && !config.mapKeyType) return def.pins;

  const node = NodeInstance.createNodeInstance(def.type, { x: 0, y: 0 }, def.pins);
  if (config.elementType !== undefined) node.elementType = config.elementType;
  if (config.elementSubType !== undefined) node.elementSubType = config.elementSubType;
  if (config.mapKeyType !== undefined) node.mapKeyType = config.mapKeyType;
  if (config.subType !== undefined) node.subType = config.subType;
  return def.deriveInstancePins ? def.deriveInstancePins(node) : def.pins;
}

/** Sibling of registry.ts's findCompatibleNodeDefs, extended to also surface "wildcard" nodes —
 * Array/Set/Map operations and Struct Make/Break — whose static `pins` only ever show one
 * hardcoded placeholder type (see NodeDef.configurableElementType/configurableSubType), by also
 * trying the dragged pin's own type/subType as that node's configuration before checking for a
 * match. Used when a wire is dropped in empty space to decide which node types the search menu
 * offers (see AppShell.tsx's onWireDroppedInEmptySpace). */
export function findDragCompatibleNodeDefs(pin: PinTypeShape, pinDirection: "input" | "output"): NodeDef[] {
  const wantDirection = pinDirection === "output" ? "input" : "output";
  return allNodeDefs().filter((def) => candidateConfigs(def, pin).some((config) => pinsFor(def, config).some((p) => p.direction === wantDirection && isPinTypeCompatible(p, pin))));
}

/** The first candidate config (if any) that makes `def` compatible with `pin`, along with which
 * of its resulting pins actually matches — lets the caller both seed the new instance's
 * configurable type(s) to match and know which pin id to wire the dragged connection to. */
export function resolveDragMatch(def: NodeDef, pin: PinTypeShape, wantDirection: "input" | "output"): { config: DragConfig; matchPin: PinDef } | null {
  for (const config of candidateConfigs(def, pin)) {
    const matchPin = pinsFor(def, config).find((p) => p.direction === wantDirection && isPinTypeCompatible(p, pin));
    if (matchPin) return { config, matchPin };
  }
  return null;
}
