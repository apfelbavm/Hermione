import type { NodeDef, PinContainer, PinType } from "./types";

const registry = new Map<string, NodeDef>();

export function registerNode(def: NodeDef): void {
  if (registry.has(def.type)) {
    throw new Error(`Node type "${def.type}" is already registered`);
  }
  registry.set(def.type, def);
}

export function getNodeDef(type: string): NodeDef {
  const def = registry.get(type);
  if (!def) throw new Error(`Unknown node type "${type}"`);
  return def;
}

export function tryGetNodeDef(type: string): NodeDef | undefined {
  return registry.get(type);
}

export function allNodeDefs(): NodeDef[] {
  return [...registry.values()];
}

export function clearRegistry(): void {
  registry.clear();
}

export interface PinTypeShape {
  type: PinType;
  container?: PinContainer;
  keyType?: PinType;
}

/** Two pins can wire together only if their container matches ("single" is the implicit default),
 * their element type matches, and — for a "map" container — their key type also matches. A
 * container pin never silently connects to a differently-shaped one (no Array<Number> ->
 * Set<Number>, no Map<string,X> -> Map<number,X>); the user would need an explicit conversion node
 * (e.g. Set To Array) for that. "enum" is never compatible with anything, including another enum
 * pin — see PinType's own doc comment for why. */
export function isPinTypeCompatible(a: PinTypeShape, b: PinTypeShape): boolean {
  if (a.type === "enum" || b.type === "enum") return false;
  const containerA = a.container ?? "single";
  const containerB = b.container ?? "single";
  if (containerA !== containerB) return false;
  if (a.type !== b.type) return false;
  if (containerA === "map" && a.keyType !== b.keyType) return false;
  return true;
}

/** Node defs with at least one pin of the opposite direction compatible with the given pin shape. */
export function findCompatibleNodeDefs(pin: PinTypeShape, pinDirection: "input" | "output"): NodeDef[] {
  const wantDirection = pinDirection === "output" ? "input" : "output";
  return allNodeDefs().filter((def) => def.pins.some((p) => p.direction === wantDirection && isPinTypeCompatible(p, pin)));
}

/** The first segment of a dot-separated group path, e.g. "Math" for "Math.Comparison" — used
 * wherever a nested subgroup should still behave like its parent (header color, filtering). */
export function topLevelGroup(group: string): string {
  return group.split(".")[0] ?? group;
}
