export interface EnumValueDef {
  id: string;
  label: string;
}

export interface EnumTypeDef {
  id: string;
  label: string;
  category?: string;
  values: EnumValueDef[];
}

const registry = new Map<string, EnumTypeDef>();

export function registerEnumType(def: EnumTypeDef): void {
  if (registry.has(def.id)) {
    throw new Error(`Enum type "${def.id}" is already registered`);
  }
  registry.set(def.id, def);
}

export function getEnumTypeDef(id: string): EnumTypeDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown enum type "${id}"`);
  return def;
}

export function tryGetEnumTypeDef(id: string): EnumTypeDef | undefined {
  return registry.get(id);
}

export function allEnumTypeDefs(): EnumTypeDef[] {
  return [...registry.values()];
}
