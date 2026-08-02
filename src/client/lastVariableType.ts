/** Client-only "last variable type" memory — remembers the type/subType/container/key type the
 * user last explicitly set on a variable/input/output (global, local, or function/script I/O) via
 * its type/container/key-type dropdowns, so the next one created defaults to it instead of always
 * defaulting to a plain "number". Deliberately NOT updated by element-type dropdowns on container
 * nodes (e.g. "for each") — those configure a node, not a variable. Uses sessionStorage rather than
 * localStorage since this is meant to reset per browser session, not persist indefinitely. */

import type { PinContainer, PinType } from "../graph/engine/types";

const STORAGE_KEY = "hermione:lastVariableType";
const DEFAULT_TYPE: PinType = "number";
const DEFAULT_CONTAINER: PinContainer = "single";
const VALID_TYPES: PinType[] = ["exec", "number", "boolean", "string", "object", "date", "enum", "struct"];
const VALID_CONTAINERS: PinContainer[] = ["single", "array", "set", "map"];

export interface LastVariableType {
  type: PinType;
  subType?: string;
  container: PinContainer;
  /** Only meaningful when container === "map". */
  keyType?: PinType;
}

export function getLastVariableType(): LastVariableType {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return { type: DEFAULT_TYPE, container: DEFAULT_CONTAINER };
  try {
    const parsed = JSON.parse(raw) as { type?: string; subType?: string; container?: string; keyType?: string };
    const type = (VALID_TYPES as string[]).includes(parsed.type ?? "") ? (parsed.type as PinType) : DEFAULT_TYPE;
    const container = (VALID_CONTAINERS as string[]).includes(parsed.container ?? "") ? (parsed.container as PinContainer) : DEFAULT_CONTAINER;
    const keyType = (VALID_TYPES as string[]).includes(parsed.keyType ?? "") ? (parsed.keyType as PinType) : undefined;
    return { type, subType: parsed.subType, container, keyType };
  } catch {
    return { type: DEFAULT_TYPE, container: DEFAULT_CONTAINER };
  }
}

export function setLastVariableType(entry: { type: PinType; subType?: string; container?: PinContainer; keyType?: PinType }): void {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      type: entry.type,
      subType: entry.subType,
      container: entry.container ?? DEFAULT_CONTAINER,
      keyType: entry.keyType,
    }),
  );
}
