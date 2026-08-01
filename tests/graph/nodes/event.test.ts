import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { getNodeDef } from "../../../src/graph/engine/registry";
import { NodeInstance } from "../../../src/graph/engine/nodeInstance";

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
    expect(node.resolvePinDefs([], []).some((p) => p.id === "intervalMs")).toBe(false);
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

describe("event.request", () => {
  it("has no static pins — its own request fields are derived per-instance", () => {
    const def = getNodeDef("event.request");
    expect(def.pins).toEqual([]);
    expect(def.editableOutputs).toBe(true);
  });

  it("adds a request field via addInstancePinEntry, as both a real pin and an outputEntries entry", () => {
    const def = getNodeDef("event.request");
    const node = NodeInstance.createNodeInstance("event.request", { x: 0, y: 0 }, def.pins, "req");
    expect(node.outputEntries).toEqual([]);

    def.addInstancePinEntry!(node);
    expect(node.outputEntries).toHaveLength(1);
    const [entry] = node.outputEntries!;
    expect(entry.name).toBe("Param_1");
    expect(entry.type).toBe("string");
    expect(node.pins[entry.id]).toBeDefined();

    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["exec-out", entry.id]);
    expect(pins[1].direction).toBe("output");
  });

  it("execute() reports each declared field's own default value (no real request while Simulating)", async () => {
    const def = getNodeDef("event.request");
    const node = NodeInstance.createNodeInstance("event.request", { x: 0, y: 0 }, def.pins, "req");
    def.addInstancePinEntry!(node);
    const [entry] = node.outputEntries!;
    entry.defaultValue = "fallback";

    const result = await def.execute!({ node, inputs: {}, ctx: {} as never });
    expect(result.nextExec).toBe("exec-out");
    expect(result.outputs).toEqual({ [entry.id]: "fallback" });
  });

  it("describeInstance reports declared fields by name, in order, for the compiled manifest/hooks route", () => {
    const def = getNodeDef("event.request");
    const node = NodeInstance.createNodeInstance("event.request", { x: 0, y: 0 }, def.pins, "req");
    def.addInstancePinEntry!(node);
    def.addInstancePinEntry!(node);
    const [first, second] = node.outputEntries!;
    first.name = "userId";
    second.name = "amount";
    second.type = "number";
    second.defaultValue = 0;

    expect(def.eventTrigger!.kind).toBe("request");
    expect(def.eventTrigger!.describeInstance!(node)).toEqual({
      params: [
        { name: "userId", type: "string", defaultValue: "" },
        { name: "amount", type: "number", defaultValue: 0 },
      ],
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
