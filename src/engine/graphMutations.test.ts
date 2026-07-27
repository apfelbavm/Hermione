import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import { canPlaceNodeType, createNodeInstance } from "./graphMutations";
import { getNodeDef } from "./registry";
import { createEmptyGraph } from "./types";

beforeAll(() => {
  registerBuiltins();
});

describe("canPlaceNodeType", () => {
  it("always allows a non-event node type, root or function body, regardless of what's already there", () => {
    const graph = createEmptyGraph("g", "root");
    expect(canPlaceNodeType("math.add", graph, false)).toBe(true);
    expect(canPlaceNodeType("math.add", graph, true)).toBe(true);
  });

  it("blocks any event node type inside a function body", () => {
    const graph = createEmptyGraph("g", "body");
    expect(canPlaceNodeType("event.start", graph, true)).toBe(false);
    expect(canPlaceNodeType("event.interval", graph, true)).toBe(false);
    expect(canPlaceNodeType("event.run", graph, true)).toBe(false);
  });

  it("allows an event node type in the root graph if no instance of it exists yet", () => {
    const graph = createEmptyGraph("g", "root");
    expect(canPlaceNodeType("event.run", graph, false)).toBe(true);
  });

  it("blocks a second instance of the same event type in the same graph", () => {
    const graph = createEmptyGraph("g", "root");
    const def = getNodeDef("event.run");
    graph.nodes.push(createNodeInstance("event.run", { x: 0, y: 0 }, def.pins));

    expect(canPlaceNodeType("event.run", graph, false)).toBe(false);
  });

  it("still allows a DIFFERENT event type even if one event type is already present", () => {
    const graph = createEmptyGraph("g", "root");
    const runDef = getNodeDef("event.run");
    graph.nodes.push(createNodeInstance("event.run", { x: 0, y: 0 }, runDef.pins));

    expect(canPlaceNodeType("event.start", graph, false)).toBe(true);
  });
});
