import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { connectPins } from "../../../src/graph/engine/graphMutations";
import { registerNode } from "../../../src/graph/engine/registry";
import { rootContext } from "../../../src/graph/ai/context";
import { getRuntimeErrors, getRuntimeState, runGraph, traceExecution } from "../../../src/graph/ai/execution";
import { addBuiltinNode, buildTestGraph } from "./helpers";

beforeAll(() => {
  registerBuiltins();
  registerNode({
    type: "test.throw",
    label: "Test Throw",
    description: "Always throws — test fixture only.",
    group: "Test",
    pins: [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      { id: "exec-out", label: "", type: "exec", direction: "output" },
    ],
    execute: () => {
      throw new Error("boom");
    },
  });
});

describe("execution (graph.run / runtime debugging)", () => {
  it("runs a graph successfully and reports node outputs", async () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
    const print = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    print.pins.message.value = "hello";
    connectPins(graph, [], [], { fromNode: start.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });

    const result = await runGraph(rootContext(graph));
    expect(result.status).toBe("completed");
    expect(result.errors).toEqual([]);
  });

  it("reports no matching event-trigger node as a warning, not an error", async () => {
    const graph = buildTestGraph();
    addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    const result = await runGraph(rootContext(graph));
    expect(result.status).toBe("completed");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("captures a node's thrown error as a structured runtime error and exposes it via get_runtime_errors/get_runtime_state", async () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
    const thrower = addBuiltinNode(graph, "test.throw", { x: 0, y: 0 }, "thrower-1");
    connectPins(graph, [], [], { fromNode: start.id, fromPin: "exec-out", toNode: thrower.id, toPin: "exec-in" });

    const result = await runGraph(rootContext(graph));
    expect(result.status).toBe("error");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].nodeId).toBe("thrower-1");
    expect(result.errors[0].message).toContain("boom");

    expect(getRuntimeErrors(result.executionId)).toHaveLength(1);
    const state = getRuntimeState("thrower-1", result.executionId);
    expect(state?.status).toBe("error");

    const trace = traceExecution(result.executionId);
    expect(trace[trace.length - 1]).toBe("ERROR");
    expect(trace).toContain("thrower-1");
  });
});
