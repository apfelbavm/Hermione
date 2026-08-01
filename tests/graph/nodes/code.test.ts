import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { getNodeDef } from "../../../src/graph/engine/registry";
import { transpileScript } from "../../../src/graph/engine/transpile";
import type { CodeScriptDef, ExecutionContext } from "../../../src/graph/engine/types";
import { NodeInstance } from "../../../src/graph/engine/nodeInstance";
import { Graph } from "../../../src/graph/engine/graph";
import { connectPins } from "../../../src/graph/engine/graphMutations";
import { compileGraph } from "../../../src/graph/compiler/codegen";
import { deployedScriptPath, writeDeployedScriptFile, deleteDeployedScriptFile } from "../../../src/server/deployedScriptFile";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

beforeAll(() => {
  registerBuiltins();
});

/** Builds a real CodeScriptDef the way scriptEditor.ts's Save button would — source in, compiledJs
 * out via the actual transpile step, not a hand-written plain-JS fixture — so these tests exercise
 * the whole TypeScript -> JS -> executed pipeline, not just the executor in isolation. */
async function makeScript(source: string, inputs: CodeScriptDef["inputs"] = [], outputs: CodeScriptDef["outputs"] = []): Promise<CodeScriptDef> {
  const { success, outputJs, errors } = await transpileScript(source);
  if (!success) throw new Error(`test fixture script failed to transpile: ${errors.join("; ")}`);
  return {
    id: "script-1",
    name: "Test Script",
    source,
    compiledJs: outputJs,
    inputs,
    outputs,
  };
}

async function executeNode(node: Partial<NodeInstance>, inputs: Record<string, unknown>, scripts: CodeScriptDef[]) {
  const def = getNodeDef("code.run");
  const logs: string[] = [];
  const ctx = {
    log: (m: string) => logs.push(m),
    rootGraph: { scripts },
  } as unknown as ExecutionContext;
  const result = await def.execute!({
    node: node as NodeInstance,
    inputs,
    ctx,
  });
  return { result, logs };
}

/** Writes compiled source to the same location a real deploy uses (see server/deployedScriptFile.ts)
 * and imports it back — cache-busted so repeat compiles in one test run don't hit a stale module. */
async function loadCompiled(code: string): Promise<Record<string, unknown>> {
  const flowId = `test-${randomUUID()}`;
  writeDeployedScriptFile(flowId, code);
  try {
    const url = `${pathToFileURL(deployedScriptPath(flowId)).href}?t=${Date.now()}-${Math.random()}`;
    return await import(/* @vite-ignore */ url);
  } finally {
    deleteDeployedScriptFile(flowId);
  }
}

function instantiate(compiled: Record<string, unknown>, log: (message: string) => void): Record<string, unknown> {
  const CompiledFlow = compiled.CompiledFlow as new (log: (message: string) => void) => Record<string, unknown>;
  return new CompiledFlow(log);
}

function invokeTrigger(instance: Record<string, unknown>, functionName: string): Promise<void> {
  return (instance[functionName] as () => Promise<void>).call(instance);
}

/** Compiles a graph with a single Start -> code.run (bound to `script`) node, runs it, and returns
 * everything logged along the way — code.run's compile-time behavior is now special-cased directly
 * in compiler/codegen.ts (mirroring function.call), so it's only exercisable through a real
 * compileGraph() pass rather than by calling NodeDef fields directly. */
async function runCompiled(script: CodeScriptDef, pinValues: Record<string, unknown> = {}): Promise<string[]> {
  const graph = new Graph("g1", "test");
  graph.scripts.push(script);
  const startDef = getNodeDef("event.start");
  const start = NodeInstance.createNodeInstance("event.start", { x: 0, y: 0 }, startDef.pins, "start");
  graph.nodes.push(start);

  const codeDef = getNodeDef("code.run");
  const codeNode = NodeInstance.createNodeInstance("code.run", { x: 100, y: 0 }, codeDef.deriveScriptPins!(script), "code1", undefined, undefined, script.id);
  graph.nodes.push(codeNode);
  for (const [pinId, value] of Object.entries(pinValues)) {
    codeNode.pins[pinId].value = value;
  }

  connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: codeNode.id, toPin: "exec-in" }, graph.scripts);

  const { code, manifest } = compileGraph(graph);
  const compiled = await loadCompiled(code);
  const logs: string[] = [];
  const instance = instantiate(compiled, (m) => logs.push(m));
  await invokeTrigger(instance, manifest.triggers[0].functionName);
  return logs;
}

/** Sibling of runCompiled that also chains a debug.print node per script output (each output must
 * be string-typed so it wires directly into print's message pin) so compiled output handling
 * (destructuring at the call site — see compileFrom's code.run branch in codegen.ts) gets
 * exercised the same way a real downstream node would consume it, not just the exec-side logging.
 * Returns one logged line per output, in declared order. */
async function runCompiledWithOutputs(script: CodeScriptDef, pinValues: Record<string, unknown> = {}): Promise<string[]> {
  const graph = new Graph("g1", "test");
  graph.scripts.push(script);
  const startDef = getNodeDef("event.start");
  const start = NodeInstance.createNodeInstance("event.start", { x: 0, y: 0 }, startDef.pins, "start");
  graph.nodes.push(start);

  const codeDef = getNodeDef("code.run");
  const codeNode = NodeInstance.createNodeInstance("code.run", { x: 100, y: 0 }, codeDef.deriveScriptPins!(script), "code1", undefined, undefined, script.id);
  graph.nodes.push(codeNode);
  for (const [pinId, value] of Object.entries(pinValues)) {
    codeNode.pins[pinId].value = value;
  }

  const printDef = getNodeDef("debug.print");
  connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: codeNode.id, toPin: "exec-in" }, graph.scripts);

  let previousExecNode = codeNode.id;
  script.outputs.forEach((output, i) => {
    const printNode = NodeInstance.createNodeInstance("debug.print", { x: 200 + i * 100, y: 0 }, printDef.pins, `print${i}`);
    graph.nodes.push(printNode);
    connectPins(graph, graph.variables, graph.functions, { fromNode: previousExecNode, fromPin: "exec-out", toNode: printNode.id, toPin: "exec-in" }, graph.scripts);
    connectPins(graph, graph.variables, graph.functions, { fromNode: codeNode.id, fromPin: output.id, toNode: printNode.id, toPin: "message" }, graph.scripts);
    previousExecNode = printNode.id;
  });

  const { code, manifest } = compileGraph(graph);
  const compiled = await loadCompiled(code);
  const logs: string[] = [];
  const instance = instantiate(compiled, (m) => logs.push(m));
  await invokeTrigger(instance, manifest.triggers[0].functionName);
  return logs;
}

describe("code.run", () => {
  it("calls run(log, inputs) with real TypeScript, typed inputs keyed by name (not pin id)", async () => {
    const script = await makeScript(
      `function run(log: (msg: string) => void, inputs: { name: string; age: number }) {
        log("Hello " + inputs.name + ", age " + inputs.age);
      }`,
      [
        { id: "pin-name", name: "name", type: "string", defaultValue: "" },
        { id: "pin-age", name: "age", type: "number", defaultValue: 0 },
      ],
    );
    const { logs } = await executeNode({ scriptId: script.id }, { "pin-name": "Alice", "pin-age": 30 }, [script]);
    expect(logs).toEqual(["Hello Alice, age 30"]);
  });

  it("supports plain JavaScript (no type annotations) identically", async () => {
    const script = await makeScript(`function run(log, inputs) { log("plain js: " + inputs.x); }`, [{ id: "pin-x", name: "x", type: "number", defaultValue: 0 }]);
    const { logs } = await executeNode({ scriptId: script.id }, { "pin-x": 7 }, [script]);
    expect(logs).toEqual(["plain js: 7"]);
  });

  it("awaits an async run() before continuing the exec chain", async () => {
    const script = await makeScript(
      `async function run(log, inputs) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      log("done: " + inputs.n);
    }`,
      [{ id: "pin-n", name: "n", type: "number", defaultValue: 0 }],
    );
    const { result, logs } = await executeNode({ scriptId: script.id }, { "pin-n": 5 }, [script]);
    expect(logs).toEqual(["done: 5"]);
    expect(result.nextExec).toBe("exec-out");
  });

  it("throws instead of swallowing a script error, so a caller (e.g. a deployed HTTP hook) can report it", async () => {
    const script = await makeScript(`function run(log) { throw new Error("boom"); }`);
    await expect(executeNode({ scriptId: script.id }, {}, [script])).rejects.toThrow("boom");
  });

  it("no-ops (continues the exec chain) when no script is bound or it's never been saved", async () => {
    const { result: noBinding } = await executeNode({}, {}, []);
    expect(noBinding.nextExec).toBe("exec-out");

    const unsaved: CodeScriptDef = {
      id: "s2",
      name: "Unsaved",
      source: "function run(){}",
      compiledJs: "",
      inputs: [],
      outputs: [],
    };
    const { result: unsavedResult } = await executeNode({ scriptId: "s2" }, {}, [unsaved]);
    expect(unsavedResult.nextExec).toBe("exec-out");
  });

  describe("outputs", () => {
    it("maps run()'s returned name-keyed object onto the matching output pins", async () => {
      const script = await makeScript(
        `function run(log, inputs) { return { doubled: inputs.n * 2, label: "ok" }; }`,
        [{ id: "pin-n", name: "n", type: "number", defaultValue: 0 }],
        [
          {
            id: "pin-doubled",
            name: "doubled",
            type: "number",
            defaultValue: -1,
          },
          { id: "pin-label", name: "label", type: "string", defaultValue: "" },
        ],
      );
      const { result } = await executeNode({ scriptId: script.id }, { "pin-n": 5 }, [script]);
      expect(result.outputs).toEqual({ "pin-doubled": 10, "pin-label": "ok" });
    });

    it("falls back to each output's own default value when run() omits that key or returns nothing (but throws out instead when run() itself throws)", async () => {
      const outputsSig: CodeScriptDef["outputs"] = [
        { id: "pin-a", name: "a", type: "number", defaultValue: 42 },
        { id: "pin-b", name: "b", type: "string", defaultValue: "fallback" },
      ];

      const partial = await makeScript(`function run() { return { a: 7 }; }`, [], outputsSig);
      const { result: partialResult } = await executeNode({ scriptId: partial.id }, {}, [partial]);
      expect(partialResult.outputs).toEqual({
        "pin-a": 7,
        "pin-b": "fallback",
      });

      const noReturn = await makeScript(`function run() { /* nothing */ }`, [], outputsSig);
      const { result: noReturnResult } = await executeNode({ scriptId: noReturn.id }, {}, [noReturn]);
      expect(noReturnResult.outputs).toEqual({
        "pin-a": 42,
        "pin-b": "fallback",
      });

      const throws = await makeScript(`function run() { throw new Error("boom"); }`, [], outputsSig);
      await expect(executeNode({ scriptId: throws.id }, {}, [throws])).rejects.toThrow("boom");
    });

    it("compiled output maps run()'s return value the same way, including the default-value fallback", async () => {
      const outputsSig: CodeScriptDef["outputs"] = [
        { id: "pin-a", name: "a", type: "string", defaultValue: "forty-two" },
        { id: "pin-b", name: "b", type: "string", defaultValue: "fallback" },
      ];
      const script = await makeScript(`function run() { return { a: "nine" }; }`, [], outputsSig);
      const logs = await runCompiledWithOutputs(script);
      expect(logs).toEqual(["nine", "fallback"]);
    });

    it("works identically whether or not the user's run() is declared async — both call sites always await the result", async () => {
      const outputsSig: CodeScriptDef["outputs"] = [{ id: "pin-result", name: "result", type: "string", defaultValue: "" }];
      const withAsync = await makeScript(
        `async function run(log, inputs) { return { result: "from async: " + inputs.greeting }; }`,
        [
          {
            id: "pin-greeting",
            name: "greeting",
            type: "string",
            defaultValue: "",
          },
        ],
        outputsSig,
      );
      const withoutAsync = await makeScript(
        `function run(log, inputs) { return { result: "from plain: " + inputs.greeting }; }`,
        [
          {
            id: "pin-greeting",
            name: "greeting",
            type: "string",
            defaultValue: "",
          },
        ],
        outputsSig,
      );

      const asyncResult = await executeNode({ scriptId: withAsync.id }, { "pin-greeting": "hi" }, [withAsync]);
      const plainResult = await executeNode({ scriptId: withoutAsync.id }, { "pin-greeting": "hi" }, [withoutAsync]);
      expect(asyncResult.result.outputs).toEqual({
        "pin-result": "from async: hi",
      });
      expect(plainResult.result.outputs).toEqual({
        "pin-result": "from plain: hi",
      });

      const asyncLogs = await runCompiledWithOutputs(withAsync, { "pin-greeting": "hi" });
      const plainLogs = await runCompiledWithOutputs(withoutAsync, { "pin-greeting": "hi" });
      expect(asyncLogs).toEqual(["from async: hi"]);
      expect(plainLogs).toEqual(["from plain: hi"]);
    });
  });

  it("gives each call a FRESH top-level scope — the parse is cached, but not script state", async () => {
    const script = await makeScript(`let calls = 0;
      function run(log) { calls += 1; log("call " + calls); }`);
    const first = await executeNode({ scriptId: script.id }, {}, [script]);
    const second = await executeNode({ scriptId: script.id }, {}, [script]);
    // If the cache reused the same `run` closure across calls (rather than just the parsed factory),
    // `calls` would persist and the second call would log "call 2" — surprising hidden state a node
    // execution shouldn't have. Both must independently see a fresh `calls = 0`.
    expect(first.logs).toEqual(["call 1"]);
    expect(second.logs).toEqual(["call 1"]);
  });

  describe("compiled", () => {
    it("compiles to statements that run to the same result as execute()", async () => {
      const script = await makeScript(`function run(log: (m: string) => void, inputs: { greeting: string }) { log(inputs.greeting + "!"); }`, [
        {
          id: "pin-greeting",
          name: "greeting",
          type: "string",
          defaultValue: "",
        },
      ]);
      const logs = await runCompiled(script, { "pin-greeting": "Hi" });
      expect(logs).toEqual(["Hi!"]);
    });

    it("throws out of the compiled trigger method the same way execute() does", async () => {
      const script = await makeScript(`function run(log) { throw new Error("compiled boom"); }`);
      await expect(runCompiled(script)).rejects.toThrow("compiled boom");
    });

    it("throws a clear compile error when no script is bound", () => {
      // A node's pins are only ever resolvable while its bound script still exists in
      // graph.scripts (see NodeInstance.resolvePinDefs) — wire it up while a placeholder script IS
      // present so connectPins can resolve real exec-in/exec-out pins, then remove that script to
      // reproduce the dangling-reference state compileGraph itself must guard against.
      const placeholder: CodeScriptDef = { id: "gone", name: "Gone", source: "function run(){}", compiledJs: "", inputs: [], outputs: [] };
      const graph = new Graph("g1", "test");
      graph.scripts.push(placeholder);
      const startDef = getNodeDef("event.start");
      const start = NodeInstance.createNodeInstance("event.start", { x: 0, y: 0 }, startDef.pins, "start");
      graph.nodes.push(start);
      const codeDef = getNodeDef("code.run");
      const codeNode = NodeInstance.createNodeInstance("code.run", { x: 100, y: 0 }, codeDef.deriveScriptPins!(placeholder), "code1", undefined, undefined, placeholder.id);
      graph.nodes.push(codeNode);
      connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: codeNode.id, toPin: "exec-in" }, graph.scripts);
      graph.scripts = [];

      expect(() => compileGraph(graph)).toThrow(/no script assigned/);
    });

    it("throws a clear compile error when the bound script has never been saved", () => {
      const unsaved: CodeScriptDef = {
        id: "s3",
        name: "Unsaved",
        source: "function run(){}",
        compiledJs: "",
        inputs: [],
        outputs: [],
      };
      const graph = new Graph("g1", "test");
      graph.scripts.push(unsaved);
      const startDef = getNodeDef("event.start");
      const start = NodeInstance.createNodeInstance("event.start", { x: 0, y: 0 }, startDef.pins, "start");
      graph.nodes.push(start);
      const codeDef = getNodeDef("code.run");
      const codeNode = NodeInstance.createNodeInstance("code.run", { x: 100, y: 0 }, codeDef.deriveScriptPins!(unsaved), "code1", undefined, undefined, unsaved.id);
      graph.nodes.push(codeNode);
      connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: codeNode.id, toPin: "exec-in" }, graph.scripts);

      expect(() => compileGraph(graph)).toThrow(/never been saved/);
    });
  });
});
