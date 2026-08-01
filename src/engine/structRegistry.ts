import type { PinDef } from "./types";

/** One field of a struct type — same shape a normal PinDef uses (so Make/Break Struct can splice
 * these straight into deriveInstancePins, just adding `direction`), minus direction since a field's
 * direction flips between Make (input) and Break (output). */
export type StructFieldDef = Omit<PinDef, "direction">;

export interface StructTypeDef {
  id: string;
  label: string;
  fields: StructFieldDef[];
}

const registry = new Map<string, StructTypeDef>();

export function registerStructType(def: StructTypeDef): void {
  if (registry.has(def.id)) {
    throw new Error(`Struct type "${def.id}" is already registered`);
  }
  registry.set(def.id, def);
}

export function getStructTypeDef(id: string): StructTypeDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown struct type "${id}"`);
  return def;
}

export function tryGetStructTypeDef(id: string): StructTypeDef | undefined {
  return registry.get(id);
}

export function allStructTypeDefs(): StructTypeDef[] {
  return [...registry.values()];
}

/** The all-fields-defaulted object a struct pin/variable resolves to before anything's plugged
 * into (or entered on) it — one key per field, each seeded from that field's own `defaultValue`. */
export function defaultStructValue(def: StructTypeDef): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const field of def.fields) value[field.id] = field.defaultValue;
  return value;
}
