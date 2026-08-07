import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { describeNodeType, findNodeTypes, getNodeTypeMetadata, searchNodeTypes } from "@hermione/graph/ai/metadataAdapter";
import { getNodeDef } from "@hermione/graph/engine/registry";

beforeAll(() => {
  registerBuiltins();
});

describe("metadataAdapter", () => {
  it("adapts a NodeDef's ports without duplicating the registry's own data", () => {
    const meta = describeNodeType(getNodeDef("math.add"));
    expect(meta.type).toBe("math.add");
    expect(meta.category).toBe("Math");
    const aPort = meta.ports.find((p) => p.id === "a")!;
    expect(aPort.direction).toBe("input");
    expect(aPort.type).toBe("number");
    expect(aPort.required).toBe(false); // has a literal defaultValue (0)
    expect(aPort.allowsMultipleConnections).toBe(false); // data input
    const resultPort = meta.ports.find((p) => p.id === "result")!;
    expect(resultPort.allowsMultipleConnections).toBe(true); // data output can fan out
  });

  it("marks exec ports as required and multi-connectable only on the input side", () => {
    const meta = describeNodeType(getNodeDef("debug.print"));
    const execIn = meta.ports.find((p) => p.id === "exec-in")!;
    expect(execIn.required).toBe(true);
    expect(execIn.allowsMultipleConnections).toBe(true);
    const execOut = meta.ports.find((p) => p.id === "exec-out")!;
    expect(execOut.required).toBe(false);
    expect(execOut.allowsMultipleConnections).toBe(false);
  });

  it("flags event-trigger node types", () => {
    const meta = getNodeTypeMetadata("event.start")!;
    expect(meta.isEventTrigger).toBe(true);
    expect(meta.eventKind).toBe("manual");
  });

  it("filters node types by category and free-text search", () => {
    const mathTypes = findNodeTypes({ category: "Math" });
    expect(mathTypes.every((m) => m.category === "Math")).toBe(true);
    expect(mathTypes.some((m) => m.type === "math.add")).toBe(true);
  });

  it("searches node types by natural-language-ish query and ranks the best match first", () => {
    const results = searchNodeTypes("JSON text conversion");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((m) => m.type === "string.fromJson")).toBe(true);
  });
});
