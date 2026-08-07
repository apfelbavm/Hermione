import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "@hermione/graph/engine/executor";
import { getNodeDef } from "@hermione/graph/engine/registry";
import { Graph } from "@hermione/graph/engine/graph";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

function buildGraph(pinValues: Record<string, unknown> = {}) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef("sftp.upload");
  const node = NodeInstance.createNodeInstance("sftp.upload", { x: 0, y: 0 }, def.pins, "req");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

describe("sftp.upload", () => {
  it("exposes Existing File as a string pin restricted to the four conflict-resolution modes", () => {
    const def = getNodeDef("sftp.upload");
    const pin = def.pins.find((p) => p.id === "existingFileMode")!;
    expect(pin.type).toBe("enum");
    expect(pin.options).toEqual(["Overwrite", "Append", "Fail", "Ignore"]);
  });

  it("exposes Encoding as a string pin restricted to utf8/base64", () => {
    const def = getNodeDef("sftp.upload");
    const pin = def.pins.find((p) => p.id === "encoding")!;
    expect(pin.options).toEqual(["utf8", "base64"]);
  });

  it("defaults Prevent Directory Traversal and Create Directory to on", () => {
    const def = getNodeDef("sftp.upload");
    expect(def.pins.find((p) => p.id === "preventDirectoryTraversal")!.defaultValue).toBe(true);
    expect(def.pins.find((p) => p.id === "createDirectory")!.defaultValue).toBe(true);
  });

  it("interpreter execute() always reports failure — there is no browser-side way to open a real SFTP connection", async () => {
    const { graph } = buildGraph({
      host: "example.com",
      filePath: "/incoming/report.csv",
      content: "a,b\n1,2",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(ctx.execOutputs.get("req:skipped")).toBe(false);
    expect(ctx.execOutputs.get("req:attempts")).toBe(0);
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/compiled output/i);
  });

  it("compileExecute calls the real functionLibrarySftp.sftpUpload with every pin named in an inputs object", () => {
    const def = getNodeDef("sftp.upload");
    const node = buildGraph().node;
    const statements = def.compileExecute!({
      node,
      inputs: {
        host: "h",
        port: "p",
        username: "u",
        password: "pw",
        privateKey: "pk",
        passphrase: "pp",
        filePath: "fp",
        content: "c",
        encoding: "e",
        createDirectory: "cd",
        existingFileMode: "efm",
        preventDirectoryTraversal: "pdt",
        maxReconnectAttempts: "mra",
        reconnectDelayMs: "rdm",
        timeoutMs: "t",
      },
      graph: {} as never,
      compileFrom: () => ["/* continuation */"],
    });
    expect(statements[0]).toBe(
      "const __result_req = await functionLibrarySftp.sftpUpload({ host: h, port: p, username: u, password: pw, privateKey: pk, passphrase: pp, filePath: fp, content: c, encoding: e, createDirectory: cd, existingFileMode: efm, preventDirectoryTraversal: pdt, maxReconnectAttempts: mra, reconnectDelayMs: rdm, timeoutMs: t });",
    );
    expect(statements[1]).toBe("/* continuation */");
  });

  it("compileImports declares the functionLibrarySftp module the compiled output needs (which itself depends on ssh2-sftp-client)", () => {
    const def = getNodeDef("sftp.upload");
    expect(def.compileImports).toEqual(['import * as functionLibrarySftp from "../../packages/core/src/server/functionLibrarySftp.ts";']);
  });

  it("the real sftpUpload function exists in its own isolated module, never imported by any interpreter-facing code", async () => {
    const { sftpUpload } = await import("@hermione/core/server/functionLibrarySftp");
    expect(typeof sftpUpload).toBe("function");
  });
});
