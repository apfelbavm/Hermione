import type { NodeDef, PinType } from "./types";

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

export function isPinTypeCompatible(a: PinType, b: PinType): boolean {
  return a === b;
}

/** Node defs with at least one pin of the opposite direction compatible with the given pin type. */
export function findCompatibleNodeDefs(
  pinType: PinType,
  pinDirection: "input" | "output",
): NodeDef[] {
  const wantDirection = pinDirection === "output" ? "input" : "output";
  return allNodeDefs().filter((def) =>
    def.pins.some(
      (p) => p.direction === wantDirection && isPinTypeCompatible(p.type, pinType),
    ),
  );
}

/** The first segment of a dot-separated group path, e.g. "Math" for "Math.Comparison" — used
 * wherever a nested subgroup should still behave like its parent (header color, filtering). */
export function topLevelGroup(group: string): string {
  return group.split(".")[0] ?? group;
}
