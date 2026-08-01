import { XMLParser, XMLValidator } from "fast-xml-parser";
import XMLBuilder from "fast-xml-builder";
import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { getNodeDef } from "../../../src/engine/registry";

beforeAll(() => {
  registerBuiltins();
});

function evaluateNode(type: string, inputs: Record<string, unknown>) {
  const def = getNodeDef(type);
  return def.evaluate!({ node: {} as any, inputs, ctx: {} as any }) as Record<
    string,
    unknown
  >;
}

async function executeNode(type: string, inputs: Record<string, unknown>) {
  const def = getNodeDef(type);
  const result = await def.execute!({
    node: {} as any,
    inputs,
    ctx: {} as any,
  });
  return result.outputs as Record<string, unknown>;
}

/** Runs a pure node's compileEvaluate output for real, with the same bindings its compileImports
 * would provide in an actual compiled file, proving the generated expression is valid JS that
 * produces the same result as evaluate(). */
function runCompiled(type: string, inputs: Record<string, string>) {
  const def = getNodeDef(type);
  const compiled = def.compileEvaluate!({
    node: {} as any,
    inputs,
    graph: {} as any,
  });
  const outputEntries = Object.entries(compiled)
    .map(([pin, expr]) => `${JSON.stringify(pin)}: ${expr}`)
    .join(", ");
  const fn = new Function(
    "XMLParser",
    "XMLValidator",
    "XMLBuilder",
    `return { ${outputEntries} };`,
  );
  return fn(XMLParser, XMLValidator, XMLBuilder) as Record<string, unknown>;
}

describe("xml.toJson", () => {
  it("converts a simple leaf element to a bare string, as a real object not a JSON string", () => {
    const result = evaluateNode("xml.toJson", { xml: "<name>Alice</name>" });
    expect(result.success).toBe(true);
    expect(result.json).toEqual({ name: "Alice" });
  });

  it("converts attributes to @-prefixed keys", () => {
    const result = evaluateNode("xml.toJson", {
      xml: '<user id="42" active="true">Bob</user>',
    });
    expect(result.json).toEqual({
      user: { "@id": "42", "@active": "true", "#text": "Bob" },
    });
  });

  it("converts nested child elements to a nested object", () => {
    const result = evaluateNode("xml.toJson", {
      xml: "<person><name>Alice</name><age>30</age></person>",
    });
    expect(result.json).toEqual({
      person: { name: "Alice", age: "30" },
    });
  });

  it("keeps numeric-looking text as a string rather than coercing it", () => {
    const result = evaluateNode("xml.toJson", { xml: "<count>007</count>" });
    expect(result.json).toEqual({ count: "007" });
  });

  it("groups repeated sibling elements with the same tag name into an array", () => {
    const result = evaluateNode("xml.toJson", {
      xml: "<items><item>a</item><item>b</item><item>c</item></items>",
    });
    expect(result.json).toEqual({
      items: { item: ["a", "b", "c"] },
    });
  });

  it("handles self-closing elements", () => {
    const result = evaluateNode("xml.toJson", {
      xml: '<config><flag enabled="true" /></config>',
    });
    expect(result.json).toEqual({
      config: { flag: { "@enabled": "true" } },
    });
  });

  it("decodes CDATA sections as plain text", () => {
    const result = evaluateNode("xml.toJson", {
      xml: "<script><![CDATA[if (a < b) { return; }]]></script>",
    });
    expect(result.json).toEqual({
      script: "if (a < b) { return; }",
    });
  });

  it("ignores comments and the XML declaration", () => {
    const result = evaluateNode("xml.toJson", {
      xml: '<?xml version="1.0"?><!-- a comment --><root><!-- inner --><a>1</a></root>',
    });
    expect(result.json).toEqual({ root: { a: "1" } });
  });

  it("decodes standard XML entities", () => {
    const result = evaluateNode("xml.toJson", {
      xml: "<msg>Tom &amp; Jerry &lt;3&gt;</msg>",
    });
    expect(result.json).toEqual({ msg: "Tom & Jerry <3>" });
  });

  it("reports success: false instead of throwing when a closing tag doesn't match", () => {
    const result = evaluateNode("xml.toJson", { xml: "<a><b></a>" });
    expect(result.success).toBe(false);
    expect(result.json).toBe(null);
  });

  it("reports success: false for input with more than one root element", () => {
    const result = evaluateNode("xml.toJson", { xml: "<a>1</a><b>2</b>" });
    expect(result.success).toBe(false);
  });

  it("reports success: false for empty input", () => {
    const result = evaluateNode("xml.toJson", { xml: "" });
    expect(result.success).toBe(false);
    expect(result.json).toBe(null);
  });

  it("compileEvaluate produces an expression that runs to the same result as evaluate()", () => {
    const result = runCompiled("xml.toJson", { xml: '"<a>1</a>"' });
    expect(result.success).toBe(true);
    expect(result.json).toEqual({ a: "1" });
  });

  it("compileEvaluate's expression also fails gracefully on malformed XML", () => {
    const result = runCompiled("xml.toJson", { xml: '"<a><b></a>"' });
    expect(result.success).toBe(false);
  });
});

describe("xml.fromJson", () => {
  it("builds XML back out of a real JSON object (not a JSON string) wrapped under its root tag", () => {
    const result = evaluateNode("xml.fromJson", {
      json: { person: { name: "Alice", age: "30" } },
    });
    expect(result.success).toBe(true);
    expect(
      evaluateNode("xml.toJson", { xml: result.xml as string }).json,
    ).toEqual({
      person: { name: "Alice", age: "30" },
    });
  });

  it("round-trips xml.toJson's own output back into equivalent XML", () => {
    const original = '<user id="42"><name>Bob</name></user>';
    const toJson = evaluateNode("xml.toJson", { xml: original });
    const fromJson = evaluateNode("xml.fromJson", { json: toJson.json });
    expect(fromJson.success).toBe(true);
    expect(
      evaluateNode("xml.toJson", { xml: fromJson.xml as string }).json,
    ).toEqual(toJson.json);
  });

  it("reports success: false for a value the builder can't handle instead of throwing", () => {
    const result = evaluateNode("xml.fromJson", { json: undefined });
    expect(result.success).toBe(false);
    expect(result.xml).toBe("");
  });

  it("compileEvaluate produces an expression that runs to the same result as evaluate()", () => {
    const result = runCompiled("xml.fromJson", { json: '({"a":"1"})' });
    expect(result.success).toBe(true);
    expect(result.xml).toBe("<a>1</a>");
  });
});

describe("xml.toCsv", () => {
  it("converts repeated flat-record elements into CSV rows", async () => {
    const xml =
      "<people><person><name>Alice</name><age>30</age></person><person><name>Bob</name><age>25</age></person></people>";
    const result = await executeNode("xml.toCsv", { xml, delimiter: "," });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("name,age\r\nAlice,30\r\nBob,25");
  });

  it("treats a single flat-record root as one CSV row", async () => {
    const result = await executeNode("xml.toCsv", {
      xml: "<person><name>Alice</name><age>30</age></person>",
      delimiter: ",",
    });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("name,age\r\nAlice,30");
  });

  it("honors a custom delimiter", async () => {
    const xml =
      "<people><person><name>Alice</name></person><person><name>Bob</name></person></people>";
    const result = await executeNode("xml.toCsv", { xml, delimiter: ";" });
    expect(result.csv).toBe("name\r\nAlice\r\nBob");
  });

  it("reports success: false when no repeated element or flat record can be found", async () => {
    const result = await executeNode("xml.toCsv", {
      xml: "<items><item>a</item><item>b</item></items>",
      delimiter: ",",
    });
    expect(result.success).toBe(false);
  });

  it("reports success: false on malformed XML", async () => {
    const result = await executeNode("xml.toCsv", {
      xml: "<a><b></a>",
      delimiter: ",",
    });
    expect(result.success).toBe(false);
  });
});
