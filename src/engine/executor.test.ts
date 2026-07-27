import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import { createExecutionContext, runExecFrom } from "./executor";
import { createNodeInstance, connectPins } from "./graphMutations";
import { getNodeDef } from "./registry";
import { createEmptyGraph, type Graph } from "./types";

function addBuiltinNode(graph: Graph, type: string, position = { x: 0, y: 0 }, id?: string) {
  const def = getNodeDef(type);
  const node = createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

beforeAll(() => {
  registerBuiltins();
});

describe("executor", () => {
  it("walks Start -> Print and logs the message", async () => {
    const graph = createEmptyGraph("g1", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "print");
    print.pins.message.value = "hello world";

    connectPins(graph, { fromNode: start.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom(start.id, "exec-out", ctx);

    expect(logs).toEqual(["hello world"]);
  });

  it("Branch follows the true exec pin when condition is true", async () => {
    const graph = createEmptyGraph("g2", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const branch = addBuiltinNode(graph, "flow.branch", { x: 100, y: 0 }, "branch");
    const printTrue = addBuiltinNode(graph, "debug.print", { x: 200, y: -50 }, "printTrue");
    const printFalse = addBuiltinNode(graph, "debug.print", { x: 200, y: 50 }, "printFalse");
    branch.pins.condition.value = true;
    printTrue.pins.message.value = "took true branch";
    printFalse.pins.message.value = "took false branch";

    connectPins(graph, { fromNode: start.id, fromPin: "exec-out", toNode: branch.id, toPin: "exec-in" });
    connectPins(graph, { fromNode: branch.id, fromPin: "true", toNode: printTrue.id, toPin: "exec-in" });
    connectPins(graph, { fromNode: branch.id, fromPin: "false", toNode: printFalse.id, toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom(start.id, "exec-out", ctx);

    expect(logs).toEqual(["took true branch"]);
  });

  it("pulls a chain of pure data nodes (Add -> Compare) into a Branch decision", async () => {
    const graph = createEmptyGraph("g3", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const add = addBuiltinNode(graph, "math.add", { x: 0, y: 100 }, "add");
    const compare = addBuiltinNode(graph, "math.compare", { x: 100, y: 100 }, "compare");
    const branch = addBuiltinNode(graph, "flow.branch", { x: 200, y: 0 }, "branch");
    const printTrue = addBuiltinNode(graph, "debug.print", { x: 300, y: -50 }, "printTrue");

    add.pins.a.value = 2;
    add.pins.b.value = 3;
    compare.pins.b.value = 4; // add.result (5) > 4 -> true
    printTrue.pins.message.value = "5 is greater than 4";

    connectPins(graph, { fromNode: add.id, fromPin: "result", toNode: compare.id, toPin: "a" });
    connectPins(graph, { fromNode: compare.id, fromPin: "result", toNode: branch.id, toPin: "condition" });
    connectPins(graph, { fromNode: start.id, fromPin: "exec-out", toNode: branch.id, toPin: "exec-in" });
    connectPins(graph, { fromNode: branch.id, fromPin: "true", toNode: printTrue.id, toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom(start.id, "exec-out", ctx);

    expect(logs).toEqual(["5 is greater than 4"]);
  });

  it("Set Variable then Get Variable round-trips a value through ctx.variableValues", async () => {
    const graph = createEmptyGraph("g5", "test");
    const variable = { id: "var1", name: "Greeting", type: "string" as const, defaultValue: "" };
    graph.variables.push(variable);

    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");

    const setDef = getNodeDef("variable.set");
    const setNode = createNodeInstance("variable.set", { x: 100, y: 0 }, setDef.derivePins!(variable), "set", variable.id);
    setNode.pins.value.value = "hello from variable";
    graph.nodes.push(setNode);

    const getDef = getNodeDef("variable.get");
    const getNode = createNodeInstance("variable.get", { x: 200, y: 0 }, getDef.derivePins!(variable), "get", variable.id);
    graph.nodes.push(getNode);

    const print = addBuiltinNode(graph, "debug.print", { x: 300, y: 0 }, "print");

    connectPins(graph, { fromNode: start.id, fromPin: "exec-out", toNode: setNode.id, toPin: "exec-in" });
    connectPins(graph, { fromNode: setNode.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });
    connectPins(graph, { fromNode: getNode.id, fromPin: "value", toNode: print.id, toPin: "message" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom(start.id, "exec-out", ctx);

    expect(logs).toEqual(["hello from variable"]);
    expect(ctx.variableValues.get(variable.id)).toBe("hello from variable");
  });

  it("awaits async nodes in order: Delay -> Send Email (mock) -> Print", async () => {
    const graph = createEmptyGraph("g6", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const delay = addBuiltinNode(graph, "flow.delay", { x: 100, y: 0 }, "delay");
    const sendEmail = addBuiltinNode(graph, "action.sendEmailMock", { x: 200, y: 0 }, "sendEmail");
    const print = addBuiltinNode(graph, "debug.print", { x: 300, y: 0 }, "print");

    delay.pins.duration.value = 5; // keep the test fast; behavior doesn't depend on the exact duration
    sendEmail.pins.to.value = "candidate@example.com";
    sendEmail.pins.subject.value = "Interview Invitation";
    print.pins.message.value = "done";

    connectPins(graph, { fromNode: start.id, fromPin: "exec-out", toNode: delay.id, toPin: "exec-in" });
    connectPins(graph, { fromNode: delay.id, fromPin: "exec-out", toNode: sendEmail.id, toPin: "exec-in" });
    connectPins(graph, { fromNode: sendEmail.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom(start.id, "exec-out", ctx);

    // Order matters: the email log must land before Print's "done", proving the executor
    // awaited both async execute() calls in sequence rather than racing them.
    expect(logs).toEqual(['📧 Sent to candidate@example.com: "Interview Invitation"', "done"]);
  });

  it("connectPins rejects incompatible pin types", () => {
    const graph = createEmptyGraph("g4", "test");
    const add = addBuiltinNode(graph, "math.add", { x: 0, y: 0 }, "add");
    const branch = addBuiltinNode(graph, "flow.branch", { x: 100, y: 0 }, "branch");

    expect(() =>
      connectPins(graph, { fromNode: add.id, fromPin: "result", toNode: branch.id, toPin: "exec-in" }),
    ).toThrow();
  });
});
