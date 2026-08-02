import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLastVariableType, setLastVariableType } from "../../src/client/lastVariableType";

// No jsdom in this project's vitest config (node environment) — sessionStorage isn't a real
// global, so a minimal in-memory stand-in is enough to exercise the module's own read/write logic.
function fakeSessionStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", fakeSessionStorage());
});

describe("lastVariableType", () => {
  it("defaults to a plain single number when nothing has been remembered yet", () => {
    expect(getLastVariableType()).toEqual({ type: "number", container: "single" });
  });

  it("round-trips type, subType, container, and keyType together", () => {
    setLastVariableType({ type: "struct", subType: "Player", container: "map", keyType: "string" });
    expect(getLastVariableType()).toEqual({ type: "struct", subType: "Player", container: "map", keyType: "string" });
  });

  it("defaults container to single when not given", () => {
    setLastVariableType({ type: "boolean" });
    expect(getLastVariableType()).toEqual({ type: "boolean", container: "single" });
  });

  it("falls back to defaults for a corrupted or invalid stored value", () => {
    sessionStorage.setItem("hermione:lastVariableType", "not json");
    expect(getLastVariableType()).toEqual({ type: "number", container: "single" });

    sessionStorage.setItem("hermione:lastVariableType", JSON.stringify({ type: "not-a-real-type", container: "not-a-real-container" }));
    expect(getLastVariableType()).toEqual({ type: "number", container: "single" });
  });

  it("remembers a container change independently of the last type change", () => {
    setLastVariableType({ type: "string", container: "single" });
    setLastVariableType({ type: "string", container: "array" });
    expect(getLastVariableType()).toEqual({ type: "string", container: "array" });
  });
});
