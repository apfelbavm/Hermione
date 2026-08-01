/** Client-only "last variable type" memory — remembers the type the user last explicitly changed
 * a variable/input/output (global, local, or function/script I/O) to, via its type dropdown, so the
 * next one created defaults to it instead of always defaulting to "number". Deliberately NOT
 * updated by element-type dropdowns on container nodes (e.g. "for each") — those configure a node,
 * not a variable. Uses sessionStorage rather than localStorage since this is meant to reset per
 * browser session, not persist indefinitely. */

import type { PinType } from "../graph/engine/types";

const STORAGE_KEY = "hermione:lastVariableType";
const DEFAULT_TYPE: PinType = "number";
const VALID_TYPES: PinType[] = ["exec", "number", "boolean", "string", "object", "date", "enum"];

export function getLastVariableType(): PinType {
  const value = sessionStorage.getItem(STORAGE_KEY);
  return (VALID_TYPES as string[]).includes(value ?? "") ? (value as PinType) : DEFAULT_TYPE;
}

export function setLastVariableType(type: PinType): void {
  sessionStorage.setItem(STORAGE_KEY, type);
}
