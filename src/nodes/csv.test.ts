import * as fastXmlParser from "fast-xml-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { getNodeDef } from "../engine/registry";

beforeAll(() => {
  registerBuiltins();
});

function evaluateNode(type: string, inputs: Record<string, unknown>) {
  const def = getNodeDef(type);
  return def.evaluate!({ node: {} as any, inputs, ctx: {} as any }) as Record<string, unknown>;
}

function runCompiled(type: string, inputs: Record<string, string>) {
  const def = getNodeDef(type);
  const compiled = def.compileEvaluate!({ node: {} as any, inputs, graph: {} as any });
  const helperSource = Object.values(def.compileHelpers ?? {}).join("\n");
  const outputEntries = Object.entries(compiled)
    .map(([pin, expr]) => `${JSON.stringify(pin)}: ${expr}`)
    .join(", ");
  const importedNames = (def.compileImports ?? []).map((line) => {
    const match = line.match(/\{\s*([^}]+)\s*\}/);
    return match ? match[1].split(",").map((n) => n.trim()) : [];
  }).flat();
  const fn = new Function(...importedNames, `${helperSource}\nreturn { ${outputEntries} };`);
  const bindings = fastXmlParser as unknown as Record<string, unknown>;
  return fn(...importedNames.map((name) => bindings[name])) as Record<string, unknown>;
}

describe("csv.toJson", () => {
  it("converts CSV rows into an array of objects keyed by the header row", () => {
    const result = evaluateNode("csv.toJson", { csv: "name,age\nAlice,30\nBob,25" });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.json as string)).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]);
  });

  it("handles quoted fields containing commas, quotes, and newlines", () => {
    const csv = 'name,note\n"Doe, Jane","she said ""hi""\nline two"';
    const result = evaluateNode("csv.toJson", { csv });
    expect(JSON.parse(result.json as string)).toEqual([{ name: "Doe, Jane", note: 'she said "hi"\nline two' }]);
  });

  it("ignores a single trailing newline", () => {
    const result = evaluateNode("csv.toJson", { csv: "a,b\n1,2\n" });
    expect(JSON.parse(result.json as string)).toEqual([{ a: "1", b: "2" }]);
  });

  it("returns an empty array for empty input", () => {
    const result = evaluateNode("csv.toJson", { csv: "" });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.json as string)).toEqual([]);
  });

  it("compileEvaluate produces an expression that runs to the same result as evaluate()", () => {
    const result = runCompiled("csv.toJson", { csv: '"a,b\\n1,2"' });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.json as string)).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("json.toCsv", () => {
  it("converts an array of flat objects into a CSV string with a header row", () => {
    const result = evaluateNode("json.toCsv", { json: JSON.stringify([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]) });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("name,age\r\nAlice,30\r\nBob,25");
  });

  it("quotes a field containing a comma", () => {
    const result = evaluateNode("json.toCsv", { json: JSON.stringify([{ name: "Doe, Jane" }]) });
    expect(result.csv).toBe('name\r\n"Doe, Jane"');
  });

  it("unions keys across objects, filling missing ones with an empty field", () => {
    const result = evaluateNode("json.toCsv", { json: JSON.stringify([{ a: 1 }, { a: 2, b: 3 }]) });
    expect(result.csv).toBe("a,b\r\n1,\r\n2,3");
  });

  it("reports success: false for a non-array JSON value instead of throwing", () => {
    const result = evaluateNode("json.toCsv", { json: '{"a":1}' });
    expect(result.success).toBe(false);
    expect(result.csv).toBe("");
  });

  it("reports success: false for invalid JSON instead of throwing", () => {
    const result = evaluateNode("json.toCsv", { json: "not json" });
    expect(result.success).toBe(false);
  });

  it("compileEvaluate produces an expression that runs to the same result as evaluate()", () => {
    const result = runCompiled("json.toCsv", { json: JSON.stringify(JSON.stringify([{ a: 1 }])) });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("a\r\n1");
  });
});

describe("csv.toXml", () => {
  it("wraps CSV rows under the default rows/row tags", () => {
    const result = evaluateNode("csv.toXml", { csv: "name,age\nAlice,30", rootTag: "", rowTag: "" });
    expect(result.success).toBe(true);
    expect(result.xml).toBe("<rows><row><name>Alice</name><age>30</age></row></rows>");
  });

  it("honors custom root/row tags", () => {
    const result = evaluateNode("csv.toXml", { csv: "name\nAlice\nBob", rootTag: "people", rowTag: "person" });
    expect(result.xml).toBe("<people><person><name>Alice</name></person><person><name>Bob</name></person></people>");
  });

  it("round-trips through xml.toCsv back to equivalent rows", () => {
    const csvIn = "name,age\r\nAlice,30\r\nBob,25";
    const toXml = evaluateNode("csv.toXml", { csv: csvIn, rootTag: "", rowTag: "" });
    const backToCsv = getNodeDef("xml.toCsv").evaluate!({
      node: {} as any,
      inputs: { xml: toXml.xml },
      ctx: {} as any,
    }) as Record<string, unknown>;
    expect(backToCsv.success).toBe(true);
    expect(backToCsv.csv).toBe(csvIn);
  });

  it("compileEvaluate produces an expression that runs to the same result as evaluate()", () => {
    const result = runCompiled("csv.toXml", { csv: '"name\\nAlice"', rootTag: '""', rowTag: '""' });
    expect(result.success).toBe(true);
    expect(result.xml).toBe("<rows><row><name>Alice</name></row></rows>");
  });
});
