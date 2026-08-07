import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { getNodeDef } from "@hermione/graph/engine/registry";
import * as functionLibrary from "@hermione/core/server/functionLibrary";

beforeAll(() => {
  registerBuiltins();
});

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

async function print(message: string, format: string): Promise<string> {
  const execute = getNodeDef("debug.printFormatted").execute!;
  const logs: string[] = [];
  const ctx = { log: (m: string) => logs.push(m) } as any;
  await execute({ node: {} as any, inputs: { message, format }, ctx });
  return logs[0];
}

/** Runs the exact generated wiring (see debug.ts's compileExecute) against the real functionLibrary
 * module — proves the compiled call site (`functionLibrary.formatForLog(...)`) actually matches the
 * real exported function, not a hand re-created stand-in. */
async function runCompiledPrint(message: string, format: string): Promise<string> {
  const def = getNodeDef("debug.printFormatted");
  const logs: string[] = [];
  const statements = def.compileExecute!({
    node: {} as any,
    inputs: {
      message: JSON.stringify(message),
      format: JSON.stringify(format),
    },
    graph: {} as any,
    compileFrom: () => [],
  });
  const fn = new AsyncFunction("functionLibrary", statements.join("\n"));
  await fn.call({ log: (m: string) => logs.push(m) }, functionLibrary);
  return logs[0];
}

describe("debug.printFormatted", () => {
  it("logs the message unchanged for format: text", async () => {
    expect(await print("hello world", "text")).toBe("hello world");
  });

  it("pretty-prints valid JSON with 2-space indentation", async () => {
    expect(await print('{"a":1,"b":[2,3]}', "json")).toBe(JSON.stringify({ a: 1, b: [2, 3] }, null, 2));
  });

  it("falls back to the raw message for invalid JSON instead of throwing", async () => {
    expect(await print("not json", "json")).toBe("not json");
  });

  it("pretty-prints valid XML with one element per line", async () => {
    const result = await print("<root><a>1</a><b>2</b></root>", "xml");
    expect(result).toBe("<root>\n  <a>1</a>\n  <b>2</b>\n</root>");
  });

  it("falls back to the raw message for malformed XML instead of throwing", async () => {
    expect(await print("<a><b></a>", "xml")).toBe("<a><b></a>");
  });

  it("aligns CSV columns into a readable table", async () => {
    const result = await print("name,age\nAlice,30\nBobby,7", "csv");
    expect(result).toBe("name   age\nAlice  30\nBobby  7");
  });

  it("falls back to the raw message for an unrecognized format", async () => {
    expect(await print("hello", "yaml")).toBe("hello");
  });

  it("compileExecute logs the same formatted output as execute() for each format", async () => {
    expect(await runCompiledPrint("hello", "text")).toBe("hello");
    expect(await runCompiledPrint('{"a":1}', "json")).toBe(JSON.stringify({ a: 1 }, null, 2));
    expect(await runCompiledPrint("<a>1</a>", "xml")).toBe("<a>1</a>");
    expect(await runCompiledPrint("a,b\n1,2", "csv")).toBe("a  b\n1  2");
  });
});
