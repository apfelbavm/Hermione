import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
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

/** Runs a node's compileEvaluate output for real, with the same bindings its compileImports/
 * compileHelpers would provide in an actual compiled file, proving the generated expression is
 * valid JS that produces the same result as evaluate(). */
function runCompiled(type: string, inputs: Record<string, string>) {
  const def = getNodeDef(type);
  const compiled = def.compileEvaluate!({ node: {} as any, inputs, graph: {} as any });
  const helperSource = Object.values(def.compileHelpers ?? {}).join("\n");
  const outputEntries = Object.entries(compiled)
    .map(([pin, expr]) => `${JSON.stringify(pin)}: ${expr}`)
    .join(", ");
  const fn = new Function(
    "XMLParser",
    "XMLValidator",
    "XMLBuilder",
    `${helperSource}\nreturn { ${outputEntries} };`,
  );
  return fn(XMLParser, XMLValidator, XMLBuilder) as Record<string, unknown>;
}

describe("xml.toJson", () => {
  it("converts a simple leaf element to a bare string", () => {
    const result = evaluateNode("xml.toJson", { xml: "<name>Alice</name>" });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.json as string)).toEqual({ name: "Alice" });
  });

  it("converts attributes to @-prefixed keys", () => {
    const result = evaluateNode("xml.toJson", { xml: '<user id="42" active="true">Bob</user>' });
    expect(JSON.parse(result.json as string)).toEqual({
      user: { "@id": "42", "@active": "true", "#text": "Bob" },
    });
  });

  it("converts nested child elements to a nested object", () => {
    const result = evaluateNode("xml.toJson", { xml: "<person><name>Alice</name><age>30</age></person>" });
    expect(JSON.parse(result.json as string)).toEqual({
      person: { name: "Alice", age: "30" },
    });
  });

  it("keeps numeric-looking text as a string rather than coercing it", () => {
    const result = evaluateNode("xml.toJson", { xml: "<count>007</count>" });
    expect(JSON.parse(result.json as string)).toEqual({ count: "007" });
  });

  it("groups repeated sibling elements with the same tag name into an array", () => {
    const result = evaluateNode("xml.toJson", { xml: "<items><item>a</item><item>b</item><item>c</item></items>" });
    expect(JSON.parse(result.json as string)).toEqual({
      items: { item: ["a", "b", "c"] },
    });
  });

  it("handles self-closing elements", () => {
    const result = evaluateNode("xml.toJson", { xml: '<config><flag enabled="true" /></config>' });
    expect(JSON.parse(result.json as string)).toEqual({
      config: { flag: { "@enabled": "true" } },
    });
  });

  it("decodes CDATA sections as plain text", () => {
    const result = evaluateNode("xml.toJson", { xml: "<script><![CDATA[if (a < b) { return; }]]></script>" });
    expect(JSON.parse(result.json as string)).toEqual({
      script: "if (a < b) { return; }",
    });
  });

  it("ignores comments and the XML declaration", () => {
    const result = evaluateNode("xml.toJson", {
      xml: '<?xml version="1.0"?><!-- a comment --><root><!-- inner --><a>1</a></root>',
    });
    expect(JSON.parse(result.json as string)).toEqual({ root: { a: "1" } });
  });

  it("decodes standard XML entities", () => {
    const result = evaluateNode("xml.toJson", { xml: "<msg>Tom &amp; Jerry &lt;3&gt;</msg>" });
    expect(JSON.parse(result.json as string)).toEqual({ msg: "Tom & Jerry <3>" });
  });

  it("reports success: false instead of throwing when a closing tag doesn't match", () => {
    const result = evaluateNode("xml.toJson", { xml: "<a><b></a>" });
    expect(result.success).toBe(false);
    expect(result.json).toBe("");
  });

  it("reports success: false for input with more than one root element", () => {
    const result = evaluateNode("xml.toJson", { xml: "<a>1</a><b>2</b>" });
    expect(result.success).toBe(false);
  });

  it("reports success: false for empty input", () => {
    const result = evaluateNode("xml.toJson", { xml: "" });
    expect(result.success).toBe(false);
    expect(result.json).toBe("");
  });

  it("compileEvaluate produces an expression that runs to the same result as evaluate()", () => {
    const result = runCompiled("xml.toJson", { xml: '"<a>1</a>"' });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.json as string)).toEqual({ a: "1" });
  });

  it("compileEvaluate's expression also fails gracefully on malformed XML", () => {
    const result = runCompiled("xml.toJson", { xml: '"<a><b></a>"' });
    expect(result.success).toBe(false);
  });
});

describe("xml.fromJson", () => {
  it("builds XML back out of a JSON object wrapped under its root tag", () => {
    const result = evaluateNode("xml.fromJson", { json: '{"person":{"name":"Alice","age":"30"}}' });
    expect(result.success).toBe(true);
    expect(evaluateNode("xml.toJson", { xml: result.xml as string }).json).toBe(
      JSON.stringify({ person: { name: "Alice", age: "30" } }),
    );
  });

  it("round-trips xml.toJson's own output back into equivalent XML", () => {
    const original = '<user id="42"><name>Bob</name></user>';
    const toJson = evaluateNode("xml.toJson", { xml: original });
    const fromJson = evaluateNode("xml.fromJson", { json: toJson.json as string });
    expect(fromJson.success).toBe(true);
    expect(evaluateNode("xml.toJson", { xml: fromJson.xml as string }).json).toBe(toJson.json);
  });

  it("reports success: false for invalid JSON instead of throwing", () => {
    const result = evaluateNode("xml.fromJson", { json: "not json" });
    expect(result.success).toBe(false);
    expect(result.xml).toBe("");
  });

  it("compileEvaluate produces an expression that runs to the same result as evaluate()", () => {
    const result = runCompiled("xml.fromJson", { json: '\'{"a":"1"}\'' });
    expect(result.success).toBe(true);
    expect(result.xml).toBe("<a>1</a>");
  });
});

describe("xml.toCsv", () => {
  it("converts repeated flat-record elements into CSV rows", () => {
    const xml = "<people><person><name>Alice</name><age>30</age></person><person><name>Bob</name><age>25</age></person></people>";
    const result = evaluateNode("xml.toCsv", { xml });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("name,age\r\nAlice,30\r\nBob,25");
  });

  it("treats a single flat-record root as one CSV row", () => {
    const result = evaluateNode("xml.toCsv", { xml: "<person><name>Alice</name><age>30</age></person>" });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("name,age\r\nAlice,30");
  });

  it("reports success: false when no repeated element or flat record can be found", () => {
    const result = evaluateNode("xml.toCsv", { xml: "<items><item>a</item><item>b</item></items>" });
    expect(result.success).toBe(false);
  });

  it("reports success: false on malformed XML", () => {
    const result = evaluateNode("xml.toCsv", { xml: "<a><b></a>" });
    expect(result.success).toBe(false);
  });

  it("compileEvaluate produces an expression that runs to the same result as evaluate()", () => {
    const xml = "<people><person><name>Alice</name></person><person><name>Bob</name></person></people>";
    const result = runCompiled("xml.toCsv", { xml: JSON.stringify(xml) });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("name\r\nAlice\r\nBob");
  });
});
