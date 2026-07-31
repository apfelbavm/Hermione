import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../src/nodes";
import { connectPins } from "../../src/engine/graphMutations";
import { getNodeDef } from "../../src/engine/registry";
import { compileGraph } from "../../src/compiler/codegen";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";

function addBuiltinNode(graph: Graph, type: string, position = { x: 0, y: 0 }, id?: string) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

beforeAll(() => {
  registerBuiltins();
});

/** Same idea as codegen.test.ts's loadCompiled, but rooted under the project directory (a direct
 * child of it) rather than the OS temp dir — so Node's bare-specifier resolution, which walks up
 * ancestor node_modules folders from the importing file's own directory, finds this project's
 * node_modules and can actually resolve `import ... from "fast-xml-parser"` in the generated code.
 * The OS temp dir codegen.test.ts uses has no such ancestry, which is fine for every OTHER node
 * (none of them needed compileImports before this), but wouldn't work for a node like xml.toJson. */
async function loadCompiledWithRealImports(code: string): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(process.cwd(), ".hermione-compiled-import-test-"));
  try {
    const file = join(dir, "graph.compiled.mjs");
    writeFileSync(file, code, "utf8");
    const url = `${pathToFileURL(file).href}?t=${Date.now()}-${Math.random()}`;
    return await import(/* @vite-ignore */ url);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("compileGraph — compileImports", () => {
  it("dedupes a compileImports line shared by two node instances into a single import statement", () => {
    const graph = new Graph("g", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "print");
    const xml1 = addBuiltinNode(graph, "xml.toJson", { x: 0, y: 100 }, "xml1");
    const xml2 = addBuiltinNode(graph, "xml.toJson", { x: 0, y: 200 }, "xml2");
    const fromJson = addBuiltinNode(graph, "xml.fromJson", { x: 200, y: 100 }, "fromJson");
    xml1.pins.xml.value = "<a>1</a>";
    xml2.pins.xml.value = "<b>2</b>";

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: xml1.id, fromPin: "json", toNode: fromJson.id, toPin: "json" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: fromJson.id, fromPin: "xml", toNode: print.id, toPin: "message" });

    const { code } = compileGraph(graph);
    const importLines = code.split("\n").filter((line) => line.includes('from "fast-xml-parser"'));
    expect(importLines).toHaveLength(1);
  });

  it("compiled output actually runs under plain Node with fast-xml-parser resolved from node_modules", async () => {
    const graph = new Graph("g2", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const print = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "print");
    const xmlNode = addBuiltinNode(graph, "xml.toJson", { x: 0, y: 100 }, "xmlNode");
    const fromJson = addBuiltinNode(graph, "xml.fromJson", { x: 100, y: 100 }, "fromJson");
    xmlNode.pins.xml.value = '<user id="1">Alice</user>';

    connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: xmlNode.id, fromPin: "json", toNode: fromJson.id, toPin: "json" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: fromJson.id, fromPin: "xml", toNode: print.id, toPin: "message" });

    const { code, manifest } = compileGraph(graph);
    expect(code).toContain('from "fast-xml-parser"');

    const compiled = await loadCompiledWithRealImports(code);
    const createInitialState = compiled.createInitialState as () => Record<string, unknown>;
    const trigger = compiled[manifest.triggers[0].functionName] as (rt: unknown) => Promise<void>;

    const logs: string[] = [];
    await trigger({ state: createInitialState(), log: (m: string) => logs.push(m) });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toBe('<user id="1">Alice</user>');
  });
});
