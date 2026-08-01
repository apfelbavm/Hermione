import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { getNodeDef } from "../../../src/graph/engine/registry";
import { transpileScript } from "../../../src/graph/engine/transpile";
import type { CodeScriptDef, ExecutionContext } from "../../../src/graph/engine/types";
import { NodeInstance } from "../../../src/graph/engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

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

async function runCompiled(node: Partial<NodeInstance>, inputs: Record<string, string>, scripts: CodeScriptDef[]) {
  const def = getNodeDef("code.run");
  const logs: string[] = [];
  const statements = def.compileExecute!({
    node: node as NodeInstance,
    inputs,
    graph: { scripts } as any,
    compileFrom: () => [],
  });
  const fn = new AsyncFunction("rt", statements.join("\n"));
  await fn({ log: (m: string) => logs.push(m) });
  return logs;
}

/** Sibling of runCompiled that ALSO evaluates compileExecuteOutputs' expressions against the same
 * scope compileExecute's statements ran in — exactly how a real downstream node's own compiled
 * compileEvaluate expression gets embedded (see codegen.ts) — by appending a `return { ... }`
 * built from those expressions before invoking the generated function. */
async function runCompiledWithOutputs(node: Partial<NodeInstance>, inputs: Record<string, string>, scripts: CodeScriptDef[]) {
  const def = getNodeDef("code.run");
  const graph = { scripts } as any;
  const statements = def.compileExecute!({
    node: node as NodeInstance,
    inputs,
    graph,
    compileFrom: () => [],
  });
  const outputExprs = def.compileExecuteOutputs!({
    node: node as NodeInstance,
    graph,
  });
  const returnExpr = `{ ${Object.entries(outputExprs)
    .map(([id, expr]) => `${JSON.stringify(id)}: ${expr}`)
    .join(", ")} }`;
  const fn = new AsyncFunction("rt", [...statements, `return ${returnExpr};`].join("\n"));
  const outputs = await fn({ log: () => {} });
  return outputs as Record<string, unknown>;
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

  it("logs a caught error instead of throwing out of the exec chain", async () => {
    const script = await makeScript(`function run(log) { throw new Error("boom"); }`);
    const { result, logs } = await executeNode({ scriptId: script.id }, {}, [script]);
    expect(logs).toEqual(["Error: boom"]);
    expect(result.nextExec).toBe("exec-out");
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

    it("falls back to each output's own default value when run() omits that key, returns nothing, or throws", async () => {
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
      const { result: throwsResult } = await executeNode({ scriptId: throws.id }, {}, [throws]);
      expect(throwsResult.outputs).toEqual({
        "pin-a": 42,
        "pin-b": "fallback",
      });
    });

    it("compiled output maps run()'s return value the same way, including the default-value fallback", async () => {
      const outputsSig: CodeScriptDef["outputs"] = [
        { id: "pin-a", name: "a", type: "number", defaultValue: 42 },
        { id: "pin-b", name: "b", type: "string", defaultValue: "fallback" },
      ];
      const script = await makeScript(`function run() { return { a: 9 }; }`, [], outputsSig);
      const outputs = await runCompiledWithOutputs({ id: "node-1", scriptId: script.id }, {}, [script]);
      expect(outputs).toEqual({ "pin-a": 9, "pin-b": "fallback" });
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

      const asyncCompiled = await runCompiledWithOutputs({ id: "node-1", scriptId: withAsync.id }, { "pin-greeting": '"hi"' }, [withAsync]);
      const plainCompiled = await runCompiledWithOutputs({ id: "node-2", scriptId: withoutAsync.id }, { "pin-greeting": '"hi"' }, [withoutAsync]);
      expect(asyncCompiled).toEqual({ "pin-result": "from async: hi" });
      expect(plainCompiled).toEqual({ "pin-result": "from plain: hi" });
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

  describe("compileExecute", () => {
    it("compiles to statements that run to the same result as execute()", async () => {
      const script = await makeScript(`function run(log: (m: string) => void, inputs: { greeting: string }) { log(inputs.greeting + "!"); }`, [
        {
          id: "pin-greeting",
          name: "greeting",
          type: "string",
          defaultValue: "",
        },
      ]);
      const logs = await runCompiled({ id: "node-1", scriptId: script.id }, { "pin-greeting": JSON.stringify("Hi") }, [script]);
      expect(logs).toEqual(["Hi!"]);
    });

    it("catches a thrown error in compiled output the same way execute() does", async () => {
      const script = await makeScript(`function run(log) { throw new Error("compiled boom"); }`);
      const logs = await runCompiled({ id: "node-1", scriptId: script.id }, {}, [script]);
      expect(logs).toEqual(["Error: compiled boom"]);
    });

    it("throws a clear compile error when no script is bound", () => {
      const def = getNodeDef("code.run");
      expect(() =>
        def.compileExecute!({
          node: {} as NodeInstance,
          inputs: {},
          graph: { scripts: [] } as any,
          compileFrom: () => [],
        }),
      ).toThrow(/no script assigned/);
    });

    it("throws a clear compile error when the bound script has never been saved", () => {
      const def = getNodeDef("code.run");
      const unsaved: CodeScriptDef = {
        id: "s3",
        name: "Unsaved",
        source: "function run(){}",
        compiledJs: "",
        inputs: [],
        outputs: [],
      };
      expect(() =>
        def.compileExecute!({
          node: { scriptId: "s3" } as NodeInstance,
          inputs: {},
          graph: { scripts: [unsaved] } as any,
          compileFrom: () => [],
        }),
      ).toThrow(/never been saved/);
    });
  });
});
