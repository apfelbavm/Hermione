import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { createExecutionContext, runExecFrom } from "../../src/engine/executor";
import { getNodeDef } from "../../src/engine/registry";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";

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
    expect(pin.type).toBe("string");
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
    const { graph } = buildGraph({ host: "example.com", filePath: "/incoming/report.csv", content: "a,b\n1,2" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(ctx.execOutputs.get("req:skipped")).toBe(false);
    expect(ctx.execOutputs.get("req:attempts")).toBe(0);
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/compiled output/i);
  });

  it("compileExecute references the compiled-only helper by name with every pin in order", () => {
    const def = getNodeDef("sftp.upload");
    const node = buildGraph().node;
    const statements = def.compileExecute!({
      node,
      inputs: {
        host: "h", port: "p", username: "u", password: "pw", privateKey: "pk", passphrase: "pp",
        filePath: "fp", content: "c", encoding: "e", createDirectory: "cd", existingFileMode: "efm",
        preventDirectoryTraversal: "pdt", maxReconnectAttempts: "mra", reconnectDelayMs: "rdm", timeoutMs: "t",
      },
      graph: {} as never,
      compileFrom: () => ["/* continuation */"],
    });
    expect(statements[0]).toBe(
      "const __result_req = await sftpUploadExecute(h, p, u, pw, pk, pp, fp, c, e, cd, efm, pdt, mra, rdm, t);",
    );
    expect(statements[1]).toBe("/* continuation */");
  });

  it("compileImports declares the ssh2-sftp-client package the compiled output needs", () => {
    const def = getNodeDef("sftp.upload");
    expect(def.compileImports).toEqual(['import SftpClient from "ssh2-sftp-client";']);
  });

  it("the compileHelpers source is syntactically valid and exports a function (never actually invoked here)", () => {
    const def = getNodeDef("sftp.upload");
    const source = def.compileHelpers!.sftpUploadExecute;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(`${source}\nreturn sftpUploadExecute;`)();
    expect(typeof fn).toBe("function");
  });
});
