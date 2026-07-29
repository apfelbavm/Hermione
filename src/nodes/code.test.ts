import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { getNodeDef } from "../engine/registry";
import { transpileScript } from "../engine/transpile";
import type { CodeScriptDef, ExecutionContext, NodeInstance } from "../engine/types";

beforeAll(() => {
  registerBuiltins();
});

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** Builds a real CodeScriptDef the way scriptEditor.ts's Save button would — source in, compiledJs
 * out via the actual transpile step, not a hand-written plain-JS fixture — so these tests exercise
 * the whole TypeScript -> JS -> executed pipeline, not just the executor in isolation. */
async function makeScript(source: string, inputs: CodeScriptDef["inputs"] = []): Promise<CodeScriptDef> {
  const { success, outputJs, errors } = await transpileScript(source);
  if (!success) throw new Error(`test fixture script failed to transpile: ${errors.join("; ")}`);
  return { id: "script-1", name: "Test Script", source, compiledJs: outputJs, inputs };
}

async function executeNode(node: Partial<NodeInstance>, inputs: Record<string, unknown>, scripts: CodeScriptDef[]) {
  const def = getNodeDef("code.run");
  const logs: string[] = [];
  const ctx = { log: (m: string) => logs.push(m), rootGraph: { scripts } } as unknown as ExecutionContext;
  const result = await def.execute!({ node: node as NodeInstance, inputs, ctx });
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

describe("code.run", () => {
  it("calls run(log, inputs) with real TypeScript, typed inputs keyed by name (not pin id)", async () => {
    const script = await makeScript(
      `function run(log: (msg: string) => void, inputs: { name: string; age: number }) {
        log("Hello " + inputs.name + ", age " + inputs.age);
      }`,
      [{ id: "pin-name", name: "name", type: "string", defaultValue: "" }, { id: "pin-age", name: "age", type: "number", defaultValue: 0 }],
    );
    const { logs } = await executeNode({ scriptId: script.id }, { "pin-name": "Alice", "pin-age": 30 }, [script]);
    expect(logs).toEqual(["Hello Alice, age 30"]);
  });

  it("supports plain JavaScript (no type annotations) identically", async () => {
    const script = await makeScript(`function run(log, inputs) { log("plain js: " + inputs.x); }`, [
      { id: "pin-x", name: "x", type: "number", defaultValue: 0 },
    ]);
    const { logs } = await executeNode({ scriptId: script.id }, { "pin-x": 7 }, [script]);
    expect(logs).toEqual(["plain js: 7"]);
  });

  it("awaits an async run() before continuing the exec chain", async () => {
    const script = await makeScript(`async function run(log, inputs) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      log("done: " + inputs.n);
    }`, [{ id: "pin-n", name: "n", type: "number", defaultValue: 0 }]);
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

    const unsaved: CodeScriptDef = { id: "s2", name: "Unsaved", source: "function run(){}", compiledJs: "", inputs: [] };
    const { result: unsavedResult } = await executeNode({ scriptId: "s2" }, {}, [unsaved]);
    expect(unsavedResult.nextExec).toBe("exec-out");
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
      const script = await makeScript(
        `function run(log: (m: string) => void, inputs: { greeting: string }) { log(inputs.greeting + "!"); }`,
        [{ id: "pin-greeting", name: "greeting", type: "string", defaultValue: "" }],
      );
      const logs = await runCompiled({ scriptId: script.id }, { "pin-greeting": JSON.stringify("Hi") }, [script]);
      expect(logs).toEqual(["Hi!"]);
    });

    it("catches a thrown error in compiled output the same way execute() does", async () => {
      const script = await makeScript(`function run(log) { throw new Error("compiled boom"); }`);
      const logs = await runCompiled({ scriptId: script.id }, {}, [script]);
      expect(logs).toEqual(["Error: compiled boom"]);
    });

    it("throws a clear compile error when no script is bound", () => {
      const def = getNodeDef("code.run");
      expect(() =>
        def.compileExecute!({ node: {} as NodeInstance, inputs: {}, graph: { scripts: [] } as any, compileFrom: () => [] }),
      ).toThrow(/no script assigned/);
    });

    it("throws a clear compile error when the bound script has never been saved", () => {
      const def = getNodeDef("code.run");
      const unsaved: CodeScriptDef = { id: "s3", name: "Unsaved", source: "function run(){}", compiledJs: "", inputs: [] };
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
