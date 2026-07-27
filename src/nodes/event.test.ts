import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { getNodeDef } from "../engine/registry";

beforeAll(() => {
  registerBuiltins();
});

describe("event nodes have no user-settable name — the node type/label says how they're triggered", () => {
  it("On Start has no 'name' pin", () => {
    const def = getNodeDef("event.start");
    expect(def.pins.some((p) => p.id === "name")).toBe(false);
  });

  it("On Interval has no 'name' pin (but keeps its interval config)", () => {
    const def = getNodeDef("event.interval");
    expect(def.pins.some((p) => p.id === "name")).toBe(false);
    expect(def.pins.some((p) => p.id === "intervalMs")).toBe(true);
  });

  it("On Run has no 'name' pin", () => {
    const def = getNodeDef("event.run");
    expect(def.pins.some((p) => p.id === "name")).toBe(false);
  });
});

describe("event.run", () => {
  it("is a distinct manual-run trigger kind", () => {
    const def = getNodeDef("event.run");
    expect(def.eventTrigger?.kind).toBe("run");
  });

  it("executes straight through to exec-out", async () => {
    const def = getNodeDef("event.run");
    const result = await def.execute!({ node: {} as never, inputs: {}, ctx: {} as never });
    expect(result).toEqual({ nextExec: "exec-out" });
  });
});
