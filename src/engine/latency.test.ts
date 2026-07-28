import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import { connectPins, createFunctionDef, createNodeInstance } from "./graphMutations";
import { isFunctionLatent, isNodeLatent } from "./latency";
import { getNodeDef } from "./registry";
import { createEmptyGraph, type Graph } from "./types";

beforeAll(() => {
  registerBuiltins();
});

function addBuiltinNode(graph: Graph, type: string, id: string, position = { x: 0, y: 0 }) {
  const def = getNodeDef(type);
  const node = createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

describe("isNodeLatent — plain nodes", () => {
  it("is false for an ordinary pure node", () => {
    const graph = createEmptyGraph("g", "root");
    const node = addBuiltinNode(graph, "math.add", "add");
    expect(isNodeLatent(node, graph, graph)).toBe(false);
  });

  it("is true for Delay, Send Email (mock), and HTTP Request", () => {
    const graph = createEmptyGraph("g", "root");
    const delay = addBuiltinNode(graph, "flow.delay", "delay");
    const email = addBuiltinNode(graph, "action.sendEmailMock", "email");
    const httpReq = addBuiltinNode(graph, "http.request", "http");
    expect(isNodeLatent(delay, graph, graph)).toBe(true);
    expect(isNodeLatent(email, graph, graph)).toBe(true);
    expect(isNodeLatent(httpReq, graph, graph)).toBe(true);
  });

  it("does NOT mark a node merely sequenced before a latent one — only the latent node itself is latent", () => {
    const graph = createEmptyGraph("g", "root");
    const print1 = addBuiltinNode(graph, "debug.print", "print1");
    const delay = addBuiltinNode(graph, "flow.delay", "delay");
    connectPins(graph, [], [], { fromNode: "print1", fromPin: "exec-out", toNode: "delay", toPin: "exec-in" });
    expect(isNodeLatent(print1, graph, graph)).toBe(false);
    expect(isNodeLatent(delay, graph, graph)).toBe(true);
  });
});

describe("isNodeLatent — For Loop", () => {
  it("is false when the loop body has no latent node", () => {
    const graph = createEmptyGraph("g", "root");
    const loop = addBuiltinNode(graph, "flow.forLoop", "loop");
    addBuiltinNode(graph, "debug.print", "print");
    connectPins(graph, [], [], { fromNode: "loop", fromPin: "loop-body", toNode: "print", toPin: "exec-in" });
    expect(isNodeLatent(loop, graph, graph)).toBe(false);
  });

  it("is true when the loop body contains a latent node, even indirectly through another node", () => {
    const graph = createEmptyGraph("g", "root");
    const loop = addBuiltinNode(graph, "flow.forLoop", "loop");
    addBuiltinNode(graph, "debug.print", "print");
    addBuiltinNode(graph, "flow.delay", "delay");
    connectPins(graph, [], [], { fromNode: "loop", fromPin: "loop-body", toNode: "print", toPin: "exec-in" });
    connectPins(graph, [], [], { fromNode: "print", fromPin: "exec-out", toNode: "delay", toPin: "exec-in" });
    expect(isNodeLatent(loop, graph, graph)).toBe(true);
  });

  it("is false when a latent node exists in the graph but is NOT reachable from loop-body", () => {
    const graph = createEmptyGraph("g", "root");
    const loop = addBuiltinNode(graph, "flow.forLoop", "loop");
    addBuiltinNode(graph, "flow.delay", "unrelatedDelay"); // never wired to anything
    expect(isNodeLatent(loop, graph, graph)).toBe(false);
  });
});

describe("isNodeLatent — Sequence", () => {
  it("is false when none of its Then branches contain a latent node", () => {
    const graph = createEmptyGraph("g", "root");
    const seq = addBuiltinNode(graph, "flow.sequence", "seq");
    addBuiltinNode(graph, "debug.print", "printA");
    addBuiltinNode(graph, "debug.print", "printB");
    connectPins(graph, [], [], { fromNode: "seq", fromPin: "then-0", toNode: "printA", toPin: "exec-in" });
    connectPins(graph, [], [], { fromNode: "seq", fromPin: "then-1", toNode: "printB", toPin: "exec-in" });
    expect(isNodeLatent(seq, graph, graph)).toBe(false);
  });

  it("is true when ANY of its Then branches contains a latent node", () => {
    const graph = createEmptyGraph("g", "root");
    const seq = addBuiltinNode(graph, "flow.sequence", "seq");
    addBuiltinNode(graph, "debug.print", "printA");
    addBuiltinNode(graph, "flow.delay", "delay");
    connectPins(graph, [], [], { fromNode: "seq", fromPin: "then-0", toNode: "printA", toPin: "exec-in" });
    connectPins(graph, [], [], { fromNode: "seq", fromPin: "then-1", toNode: "delay", toPin: "exec-in" });
    expect(isNodeLatent(seq, graph, graph)).toBe(true);
  });
});

describe("isNodeLatent — Array/Set/Map For Each", () => {
  it("Array For Each is latent when its body contains a latent node", () => {
    const graph = createEmptyGraph("g", "root");
    const forEachDef = getNodeDef("array.forEach");
    const forEach = createNodeInstance("array.forEach", { x: 0, y: 0 }, forEachDef.pins, "forEach");
    graph.nodes.push(forEach);
    addBuiltinNode(graph, "flow.delay", "delay");
    connectPins(graph, [], [], { fromNode: "forEach", fromPin: "loop-body", toNode: "delay", toPin: "exec-in" });
    expect(isNodeLatent(forEach, graph, graph)).toBe(true);
  });

  it("Set For Each and Map For Each are not latent with an empty/non-latent body", () => {
    const graph = createEmptyGraph("g", "root");
    const setDef = getNodeDef("set.forEach");
    const mapDef = getNodeDef("map.forEach");
    const setForEach = createNodeInstance("set.forEach", { x: 0, y: 0 }, setDef.pins, "setForEach");
    const mapForEach = createNodeInstance("map.forEach", { x: 0, y: 0 }, mapDef.pins, "mapForEach");
    graph.nodes.push(setForEach, mapForEach);
    expect(isNodeLatent(setForEach, graph, graph)).toBe(false);
    expect(isNodeLatent(mapForEach, graph, graph)).toBe(false);
  });
});

describe("isFunctionLatent / Call Function propagation", () => {
  it("a function with no latent nodes is not latent, and neither is a Call Function node targeting it", () => {
    const rootGraph = createEmptyGraph("g", "root");
    const fn = createFunctionDef("Plain");
    rootGraph.functions.push(fn);
    addBuiltinNode(fn.body, "debug.print", "print");
    expect(isFunctionLatent(fn, rootGraph)).toBe(false);

    const callDef = getNodeDef("function.call");
    const callNode = createNodeInstance("function.call", { x: 0, y: 0 }, callDef.deriveFunctionPins!(fn), "call", undefined, fn.id);
    rootGraph.nodes.push(callNode);
    expect(isNodeLatent(callNode, rootGraph, rootGraph)).toBe(false);
  });

  it("a function containing a latent node is latent, and so is every Call Function node targeting it", () => {
    const rootGraph = createEmptyGraph("g", "root");
    const fn = createFunctionDef("SendsEmail");
    rootGraph.functions.push(fn);
    addBuiltinNode(fn.body, "action.sendEmailMock", "email");
    expect(isFunctionLatent(fn, rootGraph)).toBe(true);

    const callDef = getNodeDef("function.call");
    const callNode = createNodeInstance("function.call", { x: 0, y: 0 }, callDef.deriveFunctionPins!(fn), "call", undefined, fn.id);
    rootGraph.nodes.push(callNode);
    expect(isNodeLatent(callNode, rootGraph, rootGraph)).toBe(true);
  });

  it("a For Loop whose body calls a latent function is itself latent (composed propagation)", () => {
    const rootGraph = createEmptyGraph("g", "root");
    const fn = createFunctionDef("SendsEmail");
    rootGraph.functions.push(fn);
    addBuiltinNode(fn.body, "action.sendEmailMock", "email");

    const loop = addBuiltinNode(rootGraph, "flow.forLoop", "loop");
    const callDef = getNodeDef("function.call");
    const callNode = createNodeInstance("function.call", { x: 0, y: 0 }, callDef.deriveFunctionPins!(fn), "call", undefined, fn.id);
    rootGraph.nodes.push(callNode);
    connectPins(rootGraph, [], rootGraph.functions, { fromNode: "loop", fromPin: "loop-body", toNode: "call", toPin: "exec-in" });

    expect(isNodeLatent(loop, rootGraph, rootGraph)).toBe(true);
  });

  it("does not infinite-loop on a self-recursive function and resolves to non-latent", () => {
    const rootGraph = createEmptyGraph("g", "root");
    const fn = createFunctionDef("Recursive");
    rootGraph.functions.push(fn);
    const callDef = getNodeDef("function.call");
    const selfCall = createNodeInstance("function.call", { x: 0, y: 0 }, callDef.deriveFunctionPins!(fn), "selfCall", undefined, fn.id);
    fn.body.nodes.push(selfCall);

    expect(isFunctionLatent(fn, rootGraph)).toBe(false);
  });
});
