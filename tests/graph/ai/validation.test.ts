import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { connectPins } from "@hermione/graph/engine/graphMutations";
import { rootContext } from "@hermione/graph/ai/context";
import { validateGraph } from "@hermione/graph/ai/validation";
import { addBuiltinNode, buildTestGraph } from "./helpers";

beforeAll(() => {
  registerBuiltins();
});

describe("validation", () => {
  it("reports a valid empty graph as valid", () => {
    const graph = buildTestGraph();
    expect(validateGraph(rootContext(graph)).valid).toBe(true);
  });

  it("flags a missing required property", () => {
    const graph = buildTestGraph();
    addBuiltinNode(graph, "string.fromJson", { x: 0, y: 0 }, "json-1");
    const result = validateGraph(rootContext(graph));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_REQUIRED_PROPERTY" && e.nodeId === "json-1")).toBe(true);
  });

  it("warns about duplicate event-trigger node types", () => {
    const graph = buildTestGraph();
    addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
    addBuiltinNode(graph, "event.start", { x: 0, y: 100 }, "start-2");
    const result = validateGraph(rootContext(graph));
    expect(result.warnings.some((w) => w.code === "DUPLICATE_EVENT_TRIGGER")).toBe(true);
  });

  it("detects a data-pin cycle", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "math.add", { x: 0, y: 0 }, "add-a");
    const b = addBuiltinNode(graph, "math.add", { x: 0, y: 0 }, "add-b");
    connectPins(graph, [], [], { fromNode: a.id, fromPin: "result", toNode: b.id, toPin: "a" });
    connectPins(graph, [], [], { fromNode: b.id, fromPin: "result", toNode: a.id, toPin: "a" });
    const result = validateGraph(rootContext(graph));
    expect(result.errors.some((e) => e.code === "DATA_CYCLE")).toBe(true);
  });

  it("is valid once a required property is filled in and wiring is well-typed", () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
    const print = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    connectPins(graph, [], [], { fromNode: start.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });
    expect(validateGraph(rootContext(graph)).valid).toBe(true);
  });

  it("flags an empty array as missing on a pin marked required despite its [] default (e.g. sendMail's 'to')", () => {
    const graph = buildTestGraph();
    addBuiltinNode(graph, "microsoft365.sendMail", { x: 0, y: 0 }, "mail-1");
    const result = validateGraph(rootContext(graph));
    expect(result.errors.some((e) => e.code === "MISSING_REQUIRED_PROPERTY" && e.nodeId === "mail-1" && e.port === "to")).toBe(true);
  });
});
