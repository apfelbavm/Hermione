import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import { createExecutionContext, runExecFrom } from "../engine/executor";
import { connectPins, createNodeInstance } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import { createEmptyGraph, type Graph } from "../engine/types";
import { compileGraph } from "./codegen";

function addBuiltinNode(graph: Graph, type: string, position = { x: 0, y: 0 }, id?: string) {
  const def = getNodeDef(type);
  const node = createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

beforeAll(() => {
  registerBuiltins();
});

/** Writes compiled source to a temp file and dynamically imports it — cache-busted so repeat compiles in one test run don't hit a stale module. */
async function loadCompiled(code: string): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), "hermione-compiled-"));
  const file = join(dir, "graph.compiled.js");
  writeFileSync(file, code, "utf8");
  const url = `${pathToFileURL(file).href}?t=${Date.now()}-${Math.random()}`;
  return import(/* @vite-ignore */ url);
}

describe("compileGraph", () => {
  it("compiled output logs identically to the interpreter for Start -> Add -> Compare -> Branch -> Print", async () => {
    const graph = createEmptyGraph("g1", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const add = addBuiltinNode(graph, "math.add", { x: 0, y: 100 }, "add");
    const compare = addBuiltinNode(graph, "math.greaterThan", { x: 100, y: 100 }, "compare");
    const branch = addBuiltinNode(graph, "flow.branch", { x: 200, y: 0 }, "branch");
    const printTrue = addBuiltinNode(graph, "debug.print", { x: 300, y: -50 }, "printTrue");
    const printFalse = addBuiltinNode(graph, "debug.print", { x: 300, y: 50 }, "printFalse");

    add.pins.a.value = 2;
    add.pins.b.value = 3;
    compare.pins.b.value = 4;
    printTrue.pins.message.value = "5 is greater than 4";
    printFalse.pins.message.value = "not greater";

    connectPins(graph, graph.variables, graph.functions, { fromNode: add.id, fromPin: "result", toNode: compare.id, toPin: "a" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: compare.id, fromPin: "result", toNode: branch.id, toPin: "condition" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: branch.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: branch.id, fromPin: "true", toNode: printTrue.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: branch.id, fromPin: "false", toNode: printFalse.id, toPin: "exec-in" });

    const interpreterLogs: string[] = [];
    await runExecFrom(
      start.id,
      "exec-out",
      createExecutionContext(graph, { log: (m) => interpreterLogs.push(m) }),
    );

    const { code, manifest } = compileGraph(graph);
    expect(manifest.triggers).toHaveLength(1);
    expect(manifest.triggers[0].kind).toBe("manual");

    const compiled = await loadCompiled(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const compiledLogs: string[] = [];
    await trigger({ state: createInitialState(), log: (m: string) => compiledLogs.push(m) });

    expect(compiledLogs).toEqual(interpreterLogs);
    expect(compiledLogs).toEqual(["5 is greater than 4"]);
  });

  it("compiled output preserves async ordering for Delay -> Send Email (mock) -> Print", async () => {
    const graph = createEmptyGraph("g2", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const delay = addBuiltinNode(graph, "flow.delay", { x: 100, y: 0 }, "delay");
    const sendEmail = addBuiltinNode(graph, "action.sendEmailMock", { x: 200, y: 0 }, "sendEmail");
    const print = addBuiltinNode(graph, "debug.print", { x: 300, y: 0 }, "print");

    delay.pins.duration.value = 5;
    sendEmail.pins.to.value = "candidate@example.com";
    sendEmail.pins.subject.value = "Interview Invitation";
    print.pins.message.value = "done";

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: delay.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: delay.id, fromPin: "exec-out", toNode: sendEmail.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: sendEmail.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({ state: createInitialState(), log: (m: string) => logs.push(m) });

    expect(logs).toEqual(['📧 Sent to candidate@example.com: "Interview Invitation"', "done"]);
  });

  it("compiled output reads variable state live across Set -> Get -> Set -> Get, matching the interpreter", async () => {
    const graph = createEmptyGraph("g3", "test");
    const variable = { id: "x", name: "X", type: "string" as const, defaultValue: "" };
    graph.variables.push(variable);

    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const setDef = getNodeDef("variable.set");
    const getDef = getNodeDef("variable.get");

    const set1 = createNodeInstance("variable.set", { x: 0, y: 0 }, setDef.derivePins!(variable), "set1", variable.id);
    set1.pins.value.value = "1";
    graph.nodes.push(set1);
    const getNode = createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "get", variable.id);
    graph.nodes.push(getNode);
    const print1 = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print1");
    const set2 = createNodeInstance("variable.set", { x: 0, y: 0 }, setDef.derivePins!(variable), "set2", variable.id);
    set2.pins.value.value = "2";
    graph.nodes.push(set2);
    const print2 = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print2");

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: set1.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: set1.id, fromPin: "exec-out", toNode: print1.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: getNode.id, fromPin: "value", toNode: print1.id, toPin: "message" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: print1.id, fromPin: "exec-out", toNode: set2.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: set2.id, fromPin: "exec-out", toNode: print2.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: getNode.id, fromPin: "value", toNode: print2.id, toPin: "message" });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({ state: createInitialState(), log: (m: string) => logs.push(m) });

    expect(logs).toEqual(["1", "2"]);
  });

  it("runs a shared continuation exactly once per branch when Branch's true/false paths converge on it", async () => {
    const graph = createEmptyGraph("g3b", "test");
    const variable = { id: "cond", name: "Cond", type: "boolean" as const, defaultValue: false };
    graph.variables.push(variable);

    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const branch = addBuiltinNode(graph, "flow.branch", { x: 100, y: 0 }, "branch");
    const getDef = getNodeDef("variable.get");
    const getCond = createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "getCond", variable.id);
    graph.nodes.push(getCond);
    const shared = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "shared");
    shared.pins.message.value = "reached shared";

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: branch.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: getCond.id, fromPin: "value", toNode: branch.id, toPin: "condition" });
    // Both branches converge on the same downstream node — proves the compiler's per-branch
    // inlining doesn't double-run the shared tail (it's nested inside mutually exclusive
    // if/else arms in the generated code, so exactly one copy executes per call).
    connectPins(graph, graph.variables, graph.functions, { fromNode: branch.id, fromPin: "true", toNode: shared.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: branch.id, fromPin: "false", toNode: shared.id, toPin: "exec-in" });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    for (const condValue of [true, false]) {
      const state = createInitialState() as Record<string, unknown>;
      state["cond"] = condValue;
      const logs: string[] = [];
      await trigger({ state, log: (m: string) => logs.push(m) });
      expect(logs).toEqual(["reached shared"]);
    }
  });

  it("throws when an event root's exec-out fans out to multiple wires", () => {
    const graph = createEmptyGraph("g4", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print1 = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "print1");
    const print2 = addBuiltinNode(graph, "debug.print", { x: 100, y: 100 }, "print2");

    // Built directly: connectPins itself now enforces "one wire per exec output" (the second
    // call would just replace the first), so this shape can't arise through normal editor use —
    // this simulates a hand-edited/corrupted save file, same rationale as the cyclic-wire test.
    graph.connections.push(
      { id: "c1", fromNode: start.id, fromPin: "exec-out", toNode: print1.id, toPin: "exec-in" },
      { id: "c2", fromNode: start.id, fromPin: "exec-out", toNode: print2.id, toPin: "exec-in" },
    );

    expect(() => compileGraph(graph)).toThrow(/parallel exec fan-out/);
  });

  it("throws when a non-root node's exec-out fans out to multiple wires", () => {
    const graph = createEmptyGraph("g5", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const branchStart = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "branchStart");
    const print1 = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "print1");
    const print2 = addBuiltinNode(graph, "debug.print", { x: 200, y: 100 }, "print2");

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: branchStart.id, toPin: "exec-in" });
    graph.connections.push(
      { id: "c1", fromNode: branchStart.id, fromPin: "exec-out", toNode: print1.id, toPin: "exec-in" },
      { id: "c2", fromNode: branchStart.id, fromPin: "exec-out", toNode: print2.id, toPin: "exec-in" },
    );

    expect(() => compileGraph(graph)).toThrow(/parallel exec fan-out/);
  });

  it("throws on a cyclic exec wire", () => {
    const graph = createEmptyGraph("g6", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print1 = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "print1");
    const print2 = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "print2");

    // Built directly, bypassing connectPins' single-incoming-wire rule: a cycle that's still
    // reachable from an entry point can't actually be drawn through the editor's normal wire
    // flow (the closing wire would just overwrite the entry wire on that input pin). This
    // simulates a hand-edited/corrupted save file, which is exactly what the guard is for.
    graph.connections.push(
      { id: "c1", fromNode: start.id, fromPin: "exec-out", toNode: print1.id, toPin: "exec-in" },
      { id: "c2", fromNode: print1.id, fromPin: "exec-out", toNode: print2.id, toPin: "exec-in" },
      { id: "c3", fromNode: print2.id, fromPin: "exec-out", toNode: print1.id, toPin: "exec-in" },
    );

    expect(() => compileGraph(graph)).toThrow(/[Cc]yclic exec flow/);
  });

  it("a disabled node compiles to nothing, but the chain still continues past it — matching the interpreter", async () => {
    const graph = createEmptyGraph("g12", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print1 = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "print1");
    const print2 = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "print2");
    print1.pins.message.value = "first";
    print2.pins.message.value = "second";
    print1.disabled = true;

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: print1.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: print1.id, fromPin: "exec-out", toNode: print2.id, toPin: "exec-in" });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({ state: createInitialState(), log: (m: string) => logs.push(m) });

    expect(logs).toEqual(["second"]); // print1 (disabled) is skipped, but print2 downstream still runs
  });

  it("a disabled loop node compiles straight to 'completed', never splicing in its loop-body chain", async () => {
    const graph = createEmptyGraph("g13", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const loop = addBuiltinNode(graph, "flow.forLoop", { x: 100, y: 0 }, "loop");
    const printBody = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "printBody");
    const printDone = addBuiltinNode(graph, "debug.print", { x: 200, y: 100 }, "printDone");
    printBody.pins.message.value = "body";
    printDone.pins.message.value = "done";
    loop.pins.start.value = 0;
    loop.pins.end.value = 3;
    loop.disabled = true;

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: loop.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: loop.id, fromPin: "loop-body", toNode: printBody.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: loop.id, fromPin: "completed", toNode: printDone.id, toPin: "exec-in" });

    // Even though flow.forLoop itself has no compileExecute, a DISABLED node never needs one — it
    // only splices in the compiled chain for its disabledNextExec pin(s) (see codegen.ts).
    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({ state: createInitialState(), log: (m: string) => logs.push(m) });

    expect(logs).toEqual(["done"]); // loop-body's "body" print never runs, not even once
  });

  it("compiles Parallel's branches into concurrent async IIFEs — a faster branch logs before a slower one, then completed fires once both finish", async () => {
    const graph = createEmptyGraph("g14", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const par = addBuiltinNode(graph, "flow.parallel", { x: 100, y: 0 }, "par");
    const slowDelay = addBuiltinNode(graph, "flow.delay", { x: 200, y: 0 }, "slowDelay");
    const fastDelay = addBuiltinNode(graph, "flow.delay", { x: 200, y: 100 }, "fastDelay");
    const printSlow = addBuiltinNode(graph, "debug.print", { x: 300, y: 0 }, "printSlow");
    const printFast = addBuiltinNode(graph, "debug.print", { x: 300, y: 100 }, "printFast");
    const printDone = addBuiltinNode(graph, "debug.print", { x: 400, y: 50 }, "printDone");
    slowDelay.pins.duration.value = 20;
    fastDelay.pins.duration.value = 5;
    printSlow.pins.message.value = "slow";
    printFast.pins.message.value = "fast";
    printDone.pins.message.value = "Done";

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: par.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: par.id, fromPin: "branch-0", toNode: slowDelay.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: slowDelay.id, fromPin: "exec-out", toNode: printSlow.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: par.id, fromPin: "branch-1", toNode: fastDelay.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: fastDelay.id, fromPin: "exec-out", toNode: printFast.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: par.id, fromPin: "completed", toNode: printDone.id, toPin: "exec-in" });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({ state: createInitialState(), log: (m: string) => logs.push(m) });

    expect(logs).toEqual(["fast", "slow", "Done"]);
  });

  it("a disabled Parallel node compiles straight to 'completed', never running any branch", async () => {
    const graph = createEmptyGraph("g15", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const par = addBuiltinNode(graph, "flow.parallel", { x: 100, y: 0 }, "par");
    const printA = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "printA");
    const printB = addBuiltinNode(graph, "debug.print", { x: 200, y: 100 }, "printB");
    const printDone = addBuiltinNode(graph, "debug.print", { x: 300, y: 50 }, "printDone");
    printA.pins.message.value = "A";
    printB.pins.message.value = "B";
    printDone.pins.message.value = "Done";
    par.disabled = true;

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: par.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: par.id, fromPin: "branch-0", toNode: printA.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: par.id, fromPin: "branch-1", toNode: printB.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: par.id, fromPin: "completed", toNode: printDone.id, toPin: "exec-in" });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({ state: createInitialState(), log: (m: string) => logs.push(m) });

    expect(logs).toEqual(["Done"]);
  });
});
