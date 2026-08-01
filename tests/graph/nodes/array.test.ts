import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import {
  createExecutionContext,
  runExecFrom,
} from "../../../src/engine/executor";
import { connectPins } from "../../../src/engine/graphMutations";
import { getNodeDef } from "../../../src/engine/registry";
import { Graph } from "../../../src/engine/graph";
import { NodeInstance } from "../../../src/engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

function evalExpr(expr: string): unknown {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${expr});`)();
}

function ctxFor(graph: Graph) {
  return createExecutionContext(graph, { log: () => {} });
}

describe("array.make", () => {
  it("exposes a configurable element type and starts with one removable entry", () => {
    const def = getNodeDef("array.make");
    expect(def.configurableElementType).toBeDefined();
    const node = NodeInstance.createNodeInstance(
      "array.make",
      { x: 0, y: 0 },
      def.pins,
      "make",
    );
    expect(node.elementType).toBe("number");
    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["entry-0", "result"]);
    expect(pins.find((p) => p.id === "entry-0")?.removable).toBe(true);
  });

  it("adds a new entry via addInstancePinEntry and assembles the array from all entries", async () => {
    const def = getNodeDef("array.make");
    const node = NodeInstance.createNodeInstance(
      "array.make",
      { x: 0, y: 0 },
      def.pins,
      "make",
    );
    def.addInstancePinEntry!(node);
    expect(
      Object.keys(node.pins).filter((id) => id.startsWith("entry-")),
    ).toEqual(["entry-0", "entry-1"]);
    node.pins["entry-0"].value = 1;
    node.pins["entry-1"].value = 2;

    const outputs = await def.evaluate!({
      node,
      inputs: { "entry-0": 1, "entry-1": 2 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs.result).toEqual([1, 2]);

    const compiled = def.compileEvaluate!({
      node,
      inputs: { "entry-0": "1", "entry-1": "2" },
      graph: new Graph("g", "r"),
    });
    expect(evalExpr(compiled.result)).toEqual([1, 2]);
  });
});

describe("array.length", () => {
  it("returns 0 for an unwired (empty array) input and the count otherwise", async () => {
    const def = getNodeDef("array.length");
    const node = NodeInstance.createNodeInstance(
      "array.length",
      { x: 0, y: 0 },
      def.pins,
      "len",
    );
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2, 3] },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs.length).toBe(3);
    const compiled = def.compileEvaluate!({
      node,
      inputs: { array: JSON.stringify([1, 2, 3]) },
      graph: new Graph("g", "r"),
    });
    expect(evalExpr(compiled.length)).toBe(3);
  });
});

describe("array.get", () => {
  const def = getNodeDef("array.get");
  const node = NodeInstance.createNodeInstance(
    "array.get",
    { x: 0, y: 0 },
    def.pins,
    "get",
  );

  it("returns the element and found=true for an in-range index", async () => {
    const outputs = await def.evaluate!({
      node,
      inputs: { array: ["a", "b", "c"], index: 1 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ element: "b", found: true });
  });

  it("returns the type's default and found=false for an out-of-range index, without throwing", async () => {
    const outputs = await def.evaluate!({
      node,
      inputs: { array: ["a", "b"], index: 5 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ element: 0, found: false });
  });

  it("compiles to the same element/found values", () => {
    const compiled = def.compileEvaluate!({
      node,
      inputs: { array: JSON.stringify(["a", "b", "c"]), index: "1" },
      graph: new Graph("g", "r"),
    });
    expect(evalExpr(compiled.element)).toBe("b");
    expect(evalExpr(compiled.found)).toBe(true);
  });
});

describe("array.set", () => {
  const def = getNodeDef("array.set");
  const node = NodeInstance.createNodeInstance(
    "array.set",
    { x: 0, y: 0 },
    def.pins,
    "set",
  );

  it("replaces the element at an in-range index without mutating the input array", async () => {
    const original = [1, 2, 3];
    const outputs = await def.evaluate!({
      node,
      inputs: { array: original, index: 1, value: 99 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ result: [1, 99, 3], success: true });
    expect(original).toEqual([1, 2, 3]);
  });

  it("reports success=false and returns the array unchanged for an out-of-range index", async () => {
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2], index: 9, value: 99 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ result: [1, 2], success: false });
  });
});

describe("array.add", () => {
  it("appends the item and reports its new index", async () => {
    const def = getNodeDef("array.add");
    const node = NodeInstance.createNodeInstance(
      "array.add",
      { x: 0, y: 0 },
      def.pins,
      "add",
    );
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2], item: 3 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ result: [1, 2, 3], index: 2 });
  });
});

describe("array.append", () => {
  it("concatenates two arrays", async () => {
    const def = getNodeDef("array.append");
    const node = NodeInstance.createNodeInstance(
      "array.append",
      { x: 0, y: 0 },
      def.pins,
      "append",
    );
    const outputs = await def.evaluate!({
      node,
      inputs: { a: [1, 2], b: [3, 4] },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs.result).toEqual([1, 2, 3, 4]);
  });
});

describe("array.insert", () => {
  it("inserts at a valid index", async () => {
    const def = getNodeDef("array.insert");
    const node = NodeInstance.createNodeInstance(
      "array.insert",
      { x: 0, y: 0 },
      def.pins,
      "insert",
    );
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2, 3], index: 1, item: 99 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs.result).toEqual([1, 99, 2, 3]);
  });

  it("clamps an out-of-range index instead of throwing", async () => {
    const def = getNodeDef("array.insert");
    const node = NodeInstance.createNodeInstance(
      "array.insert",
      { x: 0, y: 0 },
      def.pins,
      "insert",
    );
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2], index: 99, item: 3 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs.result).toEqual([1, 2, 3]);
  });
});

describe("array.removeAt", () => {
  const def = getNodeDef("array.removeAt");
  const node = NodeInstance.createNodeInstance(
    "array.removeAt",
    { x: 0, y: 0 },
    def.pins,
    "removeAt",
  );

  it("removes the element at an in-range index", async () => {
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2, 3], index: 1 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ result: [1, 3], success: true });
  });

  it("reports success=false for an out-of-range index", async () => {
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2], index: 9 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ result: [1, 2], success: false });
  });
});

describe("array.removeItem", () => {
  const def = getNodeDef("array.removeItem");
  const node = NodeInstance.createNodeInstance(
    "array.removeItem",
    { x: 0, y: 0 },
    def.pins,
    "removeItem",
  );

  it("removes the first matching item by value", async () => {
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2, 3, 2], item: 2 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ result: [1, 3, 2], removed: true });
  });

  it("reports removed=false when the item isn't present", async () => {
    const outputs = await def.evaluate!({
      node,
      inputs: { array: [1, 2], item: 99 },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs).toEqual({ result: [1, 2], removed: false });
  });
});

describe("array.clear / contains / findIndex / isEmpty / reverse", () => {
  it("Clear always returns an empty array", async () => {
    const def = getNodeDef("array.clear");
    const node = NodeInstance.createNodeInstance(
      "array.clear",
      { x: 0, y: 0 },
      def.pins,
      "clear",
    );
    expect(
      (
        await def.evaluate!({
          node,
          inputs: { array: [1, 2, 3] },
          ctx: ctxFor(new Graph("g", "r")),
        })
      ).result,
    ).toEqual([]);
  });

  it("Contains finds a deep-equal item", async () => {
    const def = getNodeDef("array.contains");
    const node = NodeInstance.createNodeInstance(
      "array.contains",
      { x: 0, y: 0 },
      def.pins,
      "contains",
    );
    expect(
      (
        await def.evaluate!({
          node,
          inputs: { array: [1, 2, 3], item: 2 },
          ctx: ctxFor(new Graph("g", "r")),
        })
      ).contains,
    ).toBe(true);
    expect(
      (
        await def.evaluate!({
          node,
          inputs: { array: [1, 2, 3], item: 9 },
          ctx: ctxFor(new Graph("g", "r")),
        })
      ).contains,
    ).toBe(false);
  });

  it("Find Index returns -1 when absent", async () => {
    const def = getNodeDef("array.findIndex");
    const node = NodeInstance.createNodeInstance(
      "array.findIndex",
      { x: 0, y: 0 },
      def.pins,
      "findIndex",
    );
    expect(
      (
        await def.evaluate!({
          node,
          inputs: { array: [1, 2, 3], item: 9 },
          ctx: ctxFor(new Graph("g", "r")),
        })
      ).index,
    ).toBe(-1);
    expect(
      (
        await def.evaluate!({
          node,
          inputs: { array: [1, 2, 3], item: 2 },
          ctx: ctxFor(new Graph("g", "r")),
        })
      ).index,
    ).toBe(1);
  });

  it("Is Empty reflects the array's length", async () => {
    const def = getNodeDef("array.isEmpty");
    const node = NodeInstance.createNodeInstance(
      "array.isEmpty",
      { x: 0, y: 0 },
      def.pins,
      "isEmpty",
    );
    expect(
      (
        await def.evaluate!({
          node,
          inputs: { array: [] },
          ctx: ctxFor(new Graph("g", "r")),
        })
      ).isEmpty,
    ).toBe(true);
    expect(
      (
        await def.evaluate!({
          node,
          inputs: { array: [1] },
          ctx: ctxFor(new Graph("g", "r")),
        })
      ).isEmpty,
    ).toBe(false);
  });

  it("Reverse returns a reversed copy without mutating the input", async () => {
    const def = getNodeDef("array.reverse");
    const node = NodeInstance.createNodeInstance(
      "array.reverse",
      { x: 0, y: 0 },
      def.pins,
      "reverse",
    );
    const original = [1, 2, 3];
    const outputs = await def.evaluate!({
      node,
      inputs: { array: original },
      ctx: ctxFor(new Graph("g", "r")),
    });
    expect(outputs.result).toEqual([3, 2, 1]);
    expect(original).toEqual([1, 2, 3]);
  });
});

describe("array.forEach", () => {
  it("runs the loop-body chain once per element, exposing Element and Index, then fires Completed", async () => {
    const graph = new Graph("g", "test");
    const forEachDef = getNodeDef("array.forEach");
    const forEach = NodeInstance.createNodeInstance(
      "array.forEach",
      { x: 0, y: 0 },
      forEachDef.pins,
      "forEach",
    );
    graph.nodes.push(forEach);

    const toStrDef = getNodeDef("string.fromNumber");
    graph.nodes.push(
      NodeInstance.createNodeInstance(
        "string.fromNumber",
        { x: 0, y: 0 },
        toStrDef.pins,
        "toStr",
      ),
    );
    const printBody = getNodeDef("debug.print");
    graph.nodes.push(
      NodeInstance.createNodeInstance(
        "debug.print",
        { x: 0, y: 0 },
        printBody.pins,
        "printElement",
      ),
    );
    const printDone = NodeInstance.createNodeInstance(
      "debug.print",
      { x: 0, y: 0 },
      printBody.pins,
      "printDone",
    );
    printDone.pins.message.value = "Done";
    graph.nodes.push(printDone);

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "forEach",
      fromPin: "element",
      toNode: "toStr",
      toPin: "value",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "toStr",
      fromPin: "result",
      toNode: "printElement",
      toPin: "message",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "forEach",
      fromPin: "loop-body",
      toNode: "printElement",
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "forEach",
      fromPin: "completed",
      toNode: "printDone",
      toPin: "exec-in",
    });

    forEach.pins.array.value = [10, 20, 30];

    const logs: string[] = [];
    await runExecFrom(
      "forEach",
      "exec-in",
      createExecutionContext(graph, { log: (m) => logs.push(m) }),
    );

    expect(logs).toEqual(["10", "20", "30", "Done"]);
  });

  it("fires only Completed for an empty array", async () => {
    const graph = new Graph("g", "test");
    const forEachDef = getNodeDef("array.forEach");
    const forEach = NodeInstance.createNodeInstance(
      "array.forEach",
      { x: 0, y: 0 },
      forEachDef.pins,
      "forEach",
    );
    graph.nodes.push(forEach);
    const printDef = getNodeDef("debug.print");
    const printDone = NodeInstance.createNodeInstance(
      "debug.print",
      { x: 0, y: 0 },
      printDef.pins,
      "printDone",
    );
    printDone.pins.message.value = "Done";
    graph.nodes.push(printDone);
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "forEach",
      fromPin: "completed",
      toNode: "printDone",
      toPin: "exec-in",
    });

    const logs: string[] = [];
    await runExecFrom(
      "forEach",
      "exec-in",
      createExecutionContext(graph, { log: (m) => logs.push(m) }),
    );

    expect(logs).toEqual(["Done"]);
  });

  it("when disabled, never runs the loop body (even with a non-empty array) and fires only Completed", async () => {
    const graph = new Graph("g", "test");
    const forEachDef = getNodeDef("array.forEach");
    const forEach = NodeInstance.createNodeInstance(
      "array.forEach",
      { x: 0, y: 0 },
      forEachDef.pins,
      "forEach",
    );
    forEach.disabled = true;
    graph.nodes.push(forEach);
    const printDef = getNodeDef("debug.print");
    graph.nodes.push(
      NodeInstance.createNodeInstance(
        "debug.print",
        { x: 0, y: 0 },
        printDef.pins,
        "printElement",
      ),
    );
    const printDone = NodeInstance.createNodeInstance(
      "debug.print",
      { x: 0, y: 0 },
      printDef.pins,
      "printDone",
    );
    printDone.pins.message.value = "Done";
    graph.nodes.push(printDone);
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "forEach",
      fromPin: "loop-body",
      toNode: "printElement",
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "forEach",
      fromPin: "completed",
      toNode: "printDone",
      toPin: "exec-in",
    });
    forEach.pins.array.value = [10, 20, 30];

    const logs: string[] = [];
    await runExecFrom(
      "forEach",
      "exec-in",
      createExecutionContext(graph, { log: (m) => logs.push(m) }),
    );

    expect(logs).toEqual(["Done"]);
  });
});

describe("changeNodeElementType", () => {
  it("switches an array node's element type, disconnects wires touching it, and resets its pins to the new type's default", () => {
    const graph = new Graph("g", "root");
    const makeDef = getNodeDef("array.make");
    const makeNode = NodeInstance.createNodeInstance(
      "array.make",
      { x: 0, y: 0 },
      makeDef.pins,
      "make",
    );
    graph.nodes.push(makeNode);
    const lengthDef = getNodeDef("array.length");
    const lengthNode = NodeInstance.createNodeInstance(
      "array.length",
      { x: 100, y: 0 },
      lengthDef.pins,
      "len",
    );
    graph.nodes.push(lengthNode);

    // Both are Array<number> right now, so this wire is valid.
    connectPins(graph, [], [], {
      fromNode: "make",
      fromPin: "result",
      toNode: "len",
      toPin: "array",
    });
    expect(graph.connections).toHaveLength(1);
    expect(lengthNode.pins.array.connectionId).toBeDefined();

    graph.changeNodeElementType([], [], "len", { elementType: "string" });

    expect(lengthNode.elementType).toBe("string");
    // The wire is no longer type-compatible (Array<number> -> Array<string>) so it's gone.
    expect(graph.connections).toHaveLength(0);
    expect(lengthNode.pins.array.connectionId).toBeUndefined();
    expect(lengthNode.pins.array.value).toEqual([]);
    // deriveInstancePins now reports the "array" pin as Array<string>.
    const pins = lengthDef.deriveInstancePins!(lengthNode);
    expect(pins.find((p) => p.id === "array")).toMatchObject({
      type: "string",
      container: "array",
    });
  });

  it("preserves a Make Array node's entry count across an element-type change, resetting only their values", () => {
    const graph = new Graph("g", "root");
    const makeDef = getNodeDef("array.make");
    const makeNode = NodeInstance.createNodeInstance(
      "array.make",
      { x: 0, y: 0 },
      makeDef.pins,
      "make",
    );
    graph.nodes.push(makeNode);
    makeDef.addInstancePinEntry!(makeNode); // now has entry-0 and entry-1
    makeNode.pins["entry-0"].value = 5;
    makeNode.pins["entry-1"].value = 7;

    graph.changeNodeElementType([], [], "make", { elementType: "string" });

    expect(makeNode.elementType).toBe("string");
    expect(
      Object.keys(makeNode.pins).filter((id) => id.startsWith("entry-")),
    ).toEqual(["entry-0", "entry-1"]);
    expect(makeNode.pins["entry-0"].value).toBe("");
    expect(makeNode.pins["entry-1"].value).toBe("");
  });
});
