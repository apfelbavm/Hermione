import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { getNodeDef } from "../../src/engine/registry";
import { NodeInstance } from "../../src/engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

describe("event nodes have no user-settable name — the node type/label says how they're triggered", () => {
  it("On Start has no 'name' pin", () => {
    const def = getNodeDef("event.start");
    expect(def.pins.some((p) => p.id === "name")).toBe(false);
  });

  it("On Run has no 'name' pin", () => {
    const def = getNodeDef("event.run");
    expect(def.pins.some((p) => p.id === "name")).toBe(false);
  });
});

describe("On Interval's intervalMs is a Details-panel property, never a wireable pin", () => {
  it("is absent from both the static pins list and resolvePinDefs", () => {
    const def = getNodeDef("event.interval");
    expect(def.pins.some((p) => p.id === "intervalMs")).toBe(false);
    expect(def.pins.some((p) => p.id === "name")).toBe(false);

    const node = NodeInstance.createNodeInstance("event.interval", { x: 0, y: 0 }, def.pins);
    expect(node.resolvePinDefs([], []).some((p) => p.id === "intervalMs")).toBe(
      false,
    );
  });

  it("is declared as a detailProperty with the expected default", () => {
    const def = getNodeDef("event.interval");
    expect(def.detailProperties).toEqual([
      {
        id: "intervalMs",
        label: "Interval (ms)",
        type: "number",
        direction: "input",
        defaultValue: 5000,
      },
    ]);
  });

  it("still gets seeded onto the instance's pins record at creation, for storage/persistence", () => {
    const def = getNodeDef("event.interval");
    const node = NodeInstance.createNodeInstance("event.interval", { x: 0, y: 0 }, def.pins);
    expect(node.pins.intervalMs).toEqual({ value: 5000 });
  });

  it("describeInstance still reads the live value for the compiled manifest", () => {
    const def = getNodeDef("event.interval");
    const node = NodeInstance.createNodeInstance("event.interval", { x: 0, y: 0 }, def.pins);
    node.pins.intervalMs!.value = 9000;
    expect(def.eventTrigger!.describeInstance!(node)).toEqual({
      intervalMs: 9000,
    });
  });
});

describe("event.run", () => {
  it("is a distinct manual-run trigger kind", () => {
    const def = getNodeDef("event.run");
    expect(def.eventTrigger?.kind).toBe("run");
  });

  it("executes straight through to exec-out", async () => {
    const def = getNodeDef("event.run");
    const result = await def.execute!({
      node: {} as never,
      inputs: {},
      ctx: {} as never,
    });
    expect(result).toEqual({ nextExec: "exec-out" });
  });
});
