import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { createExecutionContext, runExecFrom } from "../../../src/graph/engine/executor";
import { connectPins } from "../../../src/graph/engine/graphMutations";
import { getNodeDef } from "../../../src/graph/engine/registry";
import { compileGraph } from "../../../src/graph/compiler/codegen";
import { deployedScriptPath, writeDeployedScriptFile, deleteDeployedScriptFile } from "../../../src/server/deployedScriptFile";
import { Graph } from "../../../src/graph/engine/graph";
import { NodeInstance } from "../../../src/graph/engine/nodeInstance";

function addBuiltinNode(graph: Graph, type: string, position = { x: 0, y: 0 }, id?: string) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** The compiled (standalone) path for auth.oauth2Saml has no Credential Vault to query — it reads
 * a named credential's fields from env vars instead (see nodes/oauth2Saml.ts's credentialFromEnv).
 * "TestCred" sanitizes to this exact prefix; stubs the 6 env vars a test's compiled output reads. */
const SAML_ENV_PREFIX = "HERMIONE_CRED_TESTCRED";
function stubSamlCredentialEnv(): void {
  vi.stubEnv(`${SAML_ENV_PREFIX}_IDP_URL`, "https://idp.example.com/oauth/idp");
  vi.stubEnv(`${SAML_ENV_PREFIX}_TOKEN_SERVICE_URL`, "https://idp.example.com/oauth/token");
  vi.stubEnv(`${SAML_ENV_PREFIX}_CLIENT_ID`, "client-1");
  vi.stubEnv(`${SAML_ENV_PREFIX}_USER_ID`, "user-1");
  vi.stubEnv(`${SAML_ENV_PREFIX}_COMPANY_ID`, "company-1");
  vi.stubEnv(`${SAML_ENV_PREFIX}_PRIVATE_KEY`, "pk");
}

/** The interpreter path (unlike the compiled path above) resolves "TestCred" via
 * ExecutionContext.getCredential instead of env vars — same 6 field values either way. */
function samlCredentialLookup(name: string) {
  if (name !== "TestCred") return undefined;
  return {
    id: "cred-1",
    name: "TestCred",
    type: "oauth2SamlBearer" as const,
    data: {
      idpUrl: "https://idp.example.com/oauth/idp",
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "client-1",
      userId: "user-1",
      companyId: "company-1",
      privateKey: "pk",
    },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

/** Writes compiled source to the SAME location a real deploy uses (data/deployed-scripts/<flowId>.mjs
 * — see server/deployedScriptFile.ts) rather than an arbitrary temp directory: a node's compileImports
 * may now be a real relative import into this repo's own src/ tree (e.g. FUNCTION_LIBRARY_IMPORT),
 * which only resolves correctly from that fixed location. Cache-busted so repeat compiles in one test
 * run don't hit a stale module; cleaned up afterward via deleteDeployedScriptFile. */
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

describe("compileGraph", () => {
  it("compiled output logs identically to the interpreter for Start -> Add -> Compare -> Branch -> Print", async () => {
    const graph = new Graph("g1", "test");
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

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: add.id,
      fromPin: "result",
      toNode: compare.id,
      toPin: "a",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: compare.id,
      fromPin: "result",
      toNode: branch.id,
      toPin: "condition",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: branch.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: branch.id,
      fromPin: "true",
      toNode: printTrue.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: branch.id,
      fromPin: "false",
      toNode: printFalse.id,
      toPin: "exec-in",
    });

    const interpreterLogs: string[] = [];
    await runExecFrom(start.id, "exec-out", createExecutionContext(graph, { log: (m) => interpreterLogs.push(m) }));

    const { code, manifest } = compileGraph(graph);
    expect(manifest.triggers).toHaveLength(1);
    expect(manifest.triggers[0].kind).toBe("manual");

    const compiled = await loadCompiled(code);
    const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const compiledLogs: string[] = [];
    await trigger({
      state: eventInitialize(),
      log: (m: string) => compiledLogs.push(m),
    });

    expect(compiledLogs).toEqual(interpreterLogs);
    expect(compiledLogs).toEqual(["5 is greater than 4"]);
  });

  it("compiled output reads variable state live across Set -> Get -> Set -> Get, matching the interpreter", async () => {
    const graph = new Graph("g3", "test");
    const variable = {
      id: "x",
      name: "X",
      type: "string" as const,
      defaultValue: "",
    };
    graph.variables.push(variable);

    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const setDef = getNodeDef("variable.set");
    const getDef = getNodeDef("variable.get");

    const set1 = NodeInstance.createNodeInstance("variable.set", { x: 0, y: 0 }, setDef.derivePins!(variable), "set1", variable.id);
    set1.pins.value.value = "1";
    graph.nodes.push(set1);
    const getNode = NodeInstance.createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "get", variable.id);
    graph.nodes.push(getNode);
    const print1 = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print1");
    const set2 = NodeInstance.createNodeInstance("variable.set", { x: 0, y: 0 }, setDef.derivePins!(variable), "set2", variable.id);
    set2.pins.value.value = "2";
    graph.nodes.push(set2);
    const print2 = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print2");

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: set1.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: set1.id,
      fromPin: "exec-out",
      toNode: print1.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: getNode.id,
      fromPin: "value",
      toNode: print1.id,
      toPin: "message",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: print1.id,
      fromPin: "exec-out",
      toNode: set2.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: set2.id,
      fromPin: "exec-out",
      toNode: print2.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: getNode.id,
      fromPin: "value",
      toNode: print2.id,
      toPin: "message",
    });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({
      state: eventInitialize(),
      log: (m: string) => logs.push(m),
    });

    expect(logs).toEqual(["1", "2"]);
  });

  it("runs a shared continuation exactly once per branch when Branch's true/false paths converge on it", async () => {
    const graph = new Graph("g3b", "test");
    const variable = {
      id: "cond",
      name: "Cond",
      type: "boolean" as const,
      defaultValue: false,
    };
    graph.variables.push(variable);

    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const branch = addBuiltinNode(graph, "flow.branch", { x: 100, y: 0 }, "branch");
    const getDef = getNodeDef("variable.get");
    const getCond = NodeInstance.createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "getCond", variable.id);
    graph.nodes.push(getCond);
    const shared = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "shared");
    shared.pins.message.value = "reached shared";

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: branch.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: getCond.id,
      fromPin: "value",
      toNode: branch.id,
      toPin: "condition",
    });
    // Both branches converge on the same downstream node — proves the compiler's per-branch
    // inlining doesn't double-run the shared tail (it's nested inside mutually exclusive
    // if/else arms in the generated code, so exactly one copy executes per call).
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: branch.id,
      fromPin: "true",
      toNode: shared.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: branch.id,
      fromPin: "false",
      toNode: shared.id,
      toPin: "exec-in",
    });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    for (const condValue of [true, false]) {
      const state = eventInitialize() as Record<string, unknown>;
      state["cond"] = condValue;
      const logs: string[] = [];
      await trigger({ state, log: (m: string) => logs.push(m) });
      expect(logs).toEqual(["reached shared"]);
    }
  });

  it("throws when an event root's exec-out fans out to multiple wires", () => {
    const graph = new Graph("g4", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print1 = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "print1");
    const print2 = addBuiltinNode(graph, "debug.print", { x: 100, y: 100 }, "print2");

    // Built directly: connectPins itself now enforces "one wire per exec output" (the second
    // call would just replace the first), so this shape can't arise through normal editor use —
    // this simulates a hand-edited/corrupted save file, same rationale as the cyclic-wire test.
    graph.connections.push(
      {
        id: "c1",
        fromNode: start.id,
        fromPin: "exec-out",
        toNode: print1.id,
        toPin: "exec-in",
      },
      {
        id: "c2",
        fromNode: start.id,
        fromPin: "exec-out",
        toNode: print2.id,
        toPin: "exec-in",
      },
    );

    expect(() => compileGraph(graph)).toThrow(/parallel exec fan-out/);
  });

  it("throws when a non-root node's exec-out fans out to multiple wires", () => {
    const graph = new Graph("g5", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const branchStart = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "branchStart");
    const print1 = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "print1");
    const print2 = addBuiltinNode(graph, "debug.print", { x: 200, y: 100 }, "print2");

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: branchStart.id,
      toPin: "exec-in",
    });
    graph.connections.push(
      {
        id: "c1",
        fromNode: branchStart.id,
        fromPin: "exec-out",
        toNode: print1.id,
        toPin: "exec-in",
      },
      {
        id: "c2",
        fromNode: branchStart.id,
        fromPin: "exec-out",
        toNode: print2.id,
        toPin: "exec-in",
      },
    );

    expect(() => compileGraph(graph)).toThrow(/parallel exec fan-out/);
  });

  it("throws on a cyclic exec wire", () => {
    const graph = new Graph("g6", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print1 = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "print1");
    const print2 = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "print2");

    // Built directly, bypassing connectPins' single-incoming-wire rule: a cycle that's still
    // reachable from an entry point can't actually be drawn through the editor's normal wire
    // flow (the closing wire would just overwrite the entry wire on that input pin). This
    // simulates a hand-edited/corrupted save file, which is exactly what the guard is for.
    graph.connections.push(
      {
        id: "c1",
        fromNode: start.id,
        fromPin: "exec-out",
        toNode: print1.id,
        toPin: "exec-in",
      },
      {
        id: "c2",
        fromNode: print1.id,
        fromPin: "exec-out",
        toNode: print2.id,
        toPin: "exec-in",
      },
      {
        id: "c3",
        fromNode: print2.id,
        fromPin: "exec-out",
        toNode: print1.id,
        toPin: "exec-in",
      },
    );

    expect(() => compileGraph(graph)).toThrow(/[Cc]yclic exec flow/);
  });

  it("a disabled node compiles to nothing, but the chain still continues past it — matching the interpreter", async () => {
    const graph = new Graph("g12", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print1 = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "print1");
    const print2 = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "print2");
    print1.pins.message.value = "first";
    print2.pins.message.value = "second";
    print1.disabled = true;

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: print1.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: print1.id,
      fromPin: "exec-out",
      toNode: print2.id,
      toPin: "exec-in",
    });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({
      state: eventInitialize(),
      log: (m: string) => logs.push(m),
    });

    expect(logs).toEqual(["second"]); // print1 (disabled) is skipped, but print2 downstream still runs
  });

  it("a disabled loop node compiles straight to 'completed', never splicing in its loop-body chain", async () => {
    const graph = new Graph("g13", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const loop = addBuiltinNode(graph, "flow.forLoop", { x: 100, y: 0 }, "loop");
    const printBody = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "printBody");
    const printDone = addBuiltinNode(graph, "debug.print", { x: 200, y: 100 }, "printDone");
    printBody.pins.message.value = "body";
    printDone.pins.message.value = "done";
    loop.pins.start.value = 0;
    loop.pins.end.value = 3;
    loop.disabled = true;

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: loop.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: loop.id,
      fromPin: "loop-body",
      toNode: printBody.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: loop.id,
      fromPin: "completed",
      toNode: printDone.id,
      toPin: "exec-in",
    });

    // Even though flow.forLoop itself has no compileExecute, a DISABLED node never needs one — it
    // only splices in the compiled chain for its disabledNextExec pin(s) (see codegen.ts).
    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({
      state: eventInitialize(),
      log: (m: string) => logs.push(m),
    });

    expect(logs).toEqual(["done"]); // loop-body's "body" print never runs, not even once
  });

  it("compiles Parallel's branches into concurrent async IIFEs — a faster branch logs before a slower one, then completed fires once both finish", async () => {
    const graph = new Graph("g14", "test");
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

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: par.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: par.id,
      fromPin: "branch-0",
      toNode: slowDelay.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: slowDelay.id,
      fromPin: "exec-out",
      toNode: printSlow.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: par.id,
      fromPin: "branch-1",
      toNode: fastDelay.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: fastDelay.id,
      fromPin: "exec-out",
      toNode: printFast.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: par.id,
      fromPin: "completed",
      toNode: printDone.id,
      toPin: "exec-in",
    });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({
      state: eventInitialize(),
      log: (m: string) => logs.push(m),
    });

    expect(logs).toEqual(["fast", "slow", "Done"]);
  });

  it("a disabled Parallel node compiles straight to 'completed', never running any branch", async () => {
    const graph = new Graph("g15", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const par = addBuiltinNode(graph, "flow.parallel", { x: 100, y: 0 }, "par");
    const printA = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "printA");
    const printB = addBuiltinNode(graph, "debug.print", { x: 200, y: 100 }, "printB");
    const printDone = addBuiltinNode(graph, "debug.print", { x: 300, y: 50 }, "printDone");
    printA.pins.message.value = "A";
    printB.pins.message.value = "B";
    printDone.pins.message.value = "Done";
    par.disabled = true;

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: par.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: par.id,
      fromPin: "branch-0",
      toNode: printA.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: par.id,
      fromPin: "branch-1",
      toNode: printB.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: par.id,
      fromPin: "completed",
      toNode: printDone.id,
      toPin: "exec-in",
    });

    const { code, manifest } = compileGraph(graph);
    const compiled = await loadCompiled(code);
    const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({
      state: eventInitialize(),
      log: (m: string) => logs.push(m),
    });

    expect(logs).toEqual(["Done"]);
  });

  describe("auth.oauth2Saml (compileExecuteOutputs — a latent exec node's data outputs read by downstream nodes)", () => {
    function buildSamlGraph() {
      const graph = new Graph("g16", "test");
      const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
      const saml = addBuiltinNode(graph, "auth.oauth2Saml", { x: 100, y: 0 }, "saml");
      const branch = addBuiltinNode(graph, "flow.branch", { x: 200, y: 0 }, "branch");
      const printTrue = addBuiltinNode(graph, "debug.print", { x: 300, y: -50 }, "printTrue");
      const printFalse = addBuiltinNode(graph, "debug.print", { x: 300, y: 50 }, "printFalse");

      saml.pins.credentialName.value = "TestCred";

      connectPins(graph, graph.variables, graph.functions, {
        fromNode: start.id,
        fromPin: "exec-out",
        toNode: saml.id,
        toPin: "exec-in",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: saml.id,
        fromPin: "exec-out",
        toNode: branch.id,
        toPin: "exec-in",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: saml.id,
        fromPin: "success",
        toNode: branch.id,
        toPin: "condition",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: branch.id,
        fromPin: "true",
        toNode: printTrue.id,
        toPin: "exec-in",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: branch.id,
        fromPin: "false",
        toNode: printFalse.id,
        toPin: "exec-in",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: saml.id,
        fromPin: "accessToken",
        toNode: printTrue.id,
        toPin: "message",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: saml.id,
        fromPin: "error",
        toNode: printFalse.id,
        toPin: "message",
      });

      return graph;
    }

    async function runCompiledSaml(graph: Graph): Promise<string[]> {
      const { code, manifest } = compileGraph(graph);
      const compiled = await loadCompiled(code);
      const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
      const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

      const logs: string[] = [];
      await trigger({
        state: eventInitialize(),
        log: (m: string) => logs.push(m),
      });
      return logs;
    }

    it("compiles without throwing and reads accessToken (a data output beyond a single result) into the Branch's true path", async () => {
      const graph = buildSamlGraph();
      stubSamlCredentialEnv();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url === "https://idp.example.com/oauth/idp") return new Response("signed-assertion", { status: 200 });
          return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );

      expect(await runCompiledSaml(graph)).toEqual(["tok-1"]);
    });

    it("reads the error output into the Branch's false path when the token exchange fails", async () => {
      const graph = buildSamlGraph();
      stubSamlCredentialEnv();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url === "https://idp.example.com/oauth/idp") return new Response("signed-assertion", { status: 200 });
          return new Response("invalid_grant", { status: 401 });
        }),
      );

      expect(await runCompiledSaml(graph)).toEqual(["invalid_grant"]);
    });

    it("compiled output matches the interpreter's own execute() for the same graph and mocked fetch", async () => {
      const graph = buildSamlGraph();
      stubSamlCredentialEnv();
      const fetchMock = vi.fn(async (url: string) => {
        if (url === "https://idp.example.com/oauth/idp") return new Response("signed-assertion", { status: 200 });
        return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const interpreterLogs: string[] = [];
      await runExecFrom("start", "exec-out", createExecutionContext(graph, { log: (m) => interpreterLogs.push(m), getCredential: samlCredentialLookup }));

      const compiledLogs = await runCompiledSaml(graph);
      expect(compiledLogs).toEqual(interpreterLogs);
      expect(compiledLogs).toEqual(["tok-1"]);
    });
  });

  describe("http.request (compileExecuteOutputs)", () => {
    it("compiles without throwing and reads status/responseBody into downstream Print nodes", async () => {
      const graph = new Graph("g17", "test");
      const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
      const req = addBuiltinNode(graph, "http.request", { x: 100, y: 0 }, "req");
      const printBody = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "printBody");

      req.pins.url.value = "https://api.example.com/thing";
      req.pins.method.value = "GET";

      connectPins(graph, graph.variables, graph.functions, {
        fromNode: start.id,
        fromPin: "exec-out",
        toNode: req.id,
        toPin: "exec-in",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: req.id,
        fromPin: "exec-out",
        toNode: printBody.id,
        toPin: "exec-in",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: req.id,
        fromPin: "responseBody",
        toNode: printBody.id,
        toPin: "message",
      });

      const { code, manifest } = compileGraph(graph);
      const compiled = await loadCompiled(code);
      const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
      const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("hello from the API", { status: 200 })),
      );

      const logs: string[] = [];
      await trigger({
        state: eventInitialize(),
        log: (m: string) => logs.push(m),
      });
      expect(logs).toEqual(["hello from the API"]);
    });

    it("compiles the full pipeline this feature exists for: auth.oauth2Saml's Auth output wired straight into http.request's Auth input", async () => {
      const graph = new Graph("g18", "test");
      const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
      const saml = addBuiltinNode(graph, "auth.oauth2Saml", { x: 100, y: 0 }, "saml");
      const req = addBuiltinNode(graph, "http.request", { x: 200, y: 0 }, "req");
      const printBody = addBuiltinNode(graph, "debug.print", { x: 300, y: 0 }, "printBody");

      saml.pins.credentialName.value = "TestCred";
      stubSamlCredentialEnv();
      req.pins.url.value = "https://api.example.com/protected";
      req.pins.method.value = "GET";

      connectPins(graph, graph.variables, graph.functions, {
        fromNode: start.id,
        fromPin: "exec-out",
        toNode: saml.id,
        toPin: "exec-in",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: saml.id,
        fromPin: "exec-out",
        toNode: req.id,
        toPin: "exec-in",
      });
      // The one thing the user should ever have to do: wire Auth straight across, untouched.
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: saml.id,
        fromPin: "auth",
        toNode: req.id,
        toPin: "auth",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: req.id,
        fromPin: "exec-out",
        toNode: printBody.id,
        toPin: "exec-in",
      });
      connectPins(graph, graph.variables, graph.functions, {
        fromNode: req.id,
        fromPin: "responseBody",
        toNode: printBody.id,
        toPin: "message",
      });

      const { code, manifest } = compileGraph(graph);
      const compiled = await loadCompiled(code);
      const eventInitialize = compiled.eventInitialize as () => Record<string, unknown>;
      const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

      let capturedAuthHeader: string | null = null;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url === "https://idp.example.com/oauth/idp") return new Response("signed-assertion", { status: 200 });
          if (url === "https://idp.example.com/oauth/token") {
            return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          capturedAuthHeader = new Headers(init?.headers).get("authorization");
          return new Response("protected data", { status: 200 });
        }),
      );

      const logs: string[] = [];
      await trigger({
        state: eventInitialize(),
        log: (m: string) => logs.push(m),
      });

      expect(capturedAuthHeader).toBe("Bearer tok-1");
      expect(logs).toEqual(["protected data"]);
    });
  });
});
