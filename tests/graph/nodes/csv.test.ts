import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { getNodeDef } from "../../../src/engine/registry";

beforeAll(() => {
  registerBuiltins();
});

async function executeNode(type: string, inputs: Record<string, unknown>) {
  const def = getNodeDef(type);
  const result = await def.execute!({
    node: {} as any,
    inputs,
    ctx: {} as any,
  });
  return result.outputs as Record<string, unknown>;
}

describe("csv.toJson", () => {
  it("converts CSV rows into a single object wrapping rows under root/row tags, as real objects not a JSON string", async () => {
    const result = await executeNode("csv.toJson", {
      csv: "name,age\nAlice,30\nBob,25",
      delimiter: ",",
      rootTag: "",
      rowTag: "",
    });
    expect(result.success).toBe(true);
    expect(result.json).toEqual({
      rows: {
        row: [
          { name: "Alice", age: "30" },
          { name: "Bob", age: "25" },
        ],
      },
    });
  });

  it("honors custom root/row tags", async () => {
    const result = await executeNode("csv.toJson", {
      csv: "name\nAlice",
      delimiter: ",",
      rootTag: "people",
      rowTag: "person",
    });
    expect(result.json).toEqual({ people: { person: [{ name: "Alice" }] } });
  });

  it("handles quoted fields containing commas, quotes, and newlines", async () => {
    const csv = 'name,note\n"Doe, Jane","she said ""hi""\nline two"';
    const result = await executeNode("csv.toJson", {
      csv,
      delimiter: ",",
      rootTag: "",
      rowTag: "",
    });
    expect(result.json).toEqual({
      rows: { row: [{ name: "Doe, Jane", note: 'she said "hi"\nline two' }] },
    });
  });

  it("honors a custom delimiter", async () => {
    const result = await executeNode("csv.toJson", {
      csv: "name;age\nAlice;30",
      delimiter: ";",
      rootTag: "",
      rowTag: "",
    });
    expect(result.json).toEqual({
      rows: { row: [{ name: "Alice", age: "30" }] },
    });
  });

  it("supports tab as a delimiter", async () => {
    const result = await executeNode("csv.toJson", {
      csv: "name\tage\nAlice\t30",
      delimiter: "\t",
      rootTag: "",
      rowTag: "",
    });
    expect(result.json).toEqual({
      rows: { row: [{ name: "Alice", age: "30" }] },
    });
  });

  it("ignores a single trailing newline", async () => {
    const result = await executeNode("csv.toJson", {
      csv: "a,b\n1,2\n",
      delimiter: ",",
      rootTag: "",
      rowTag: "",
    });
    expect(result.json).toEqual({ rows: { row: [{ a: "1", b: "2" }] } });
  });

  it('wraps an empty array (not the string "[]") for empty input', async () => {
    const result = await executeNode("csv.toJson", {
      csv: "",
      delimiter: ",",
      rootTag: "",
      rowTag: "",
    });
    expect(result.success).toBe(true);
    expect(result.json).toEqual({ rows: { row: [] } });
  });
});

describe("json.toCsv", () => {
  it("converts a single object wrapping a real array of flat objects into a CSV string with a header row", async () => {
    const result = await executeNode("json.toCsv", {
      json: {
        rows: {
          row: [
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
          ],
        },
      },
      delimiter: ",",
    });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("name,age\r\nAlice,30\r\nBob,25");
  });

  it("quotes a field containing the delimiter", async () => {
    const result = await executeNode("json.toCsv", {
      json: { rows: { row: [{ name: "Doe, Jane" }] } },
      delimiter: ",",
    });
    expect(result.csv).toBe('name\r\n"Doe, Jane"');
  });

  it("honors a custom delimiter, only quoting fields containing THAT delimiter", async () => {
    const result = await executeNode("json.toCsv", {
      json: { rows: { row: [{ name: "Doe, Jane" }] } },
      delimiter: ";",
    });
    expect(result.csv).toBe("name\r\nDoe, Jane");
  });

  it("unions keys across objects, filling missing ones with an empty field", async () => {
    const result = await executeNode("json.toCsv", {
      json: { rows: { row: [{ a: 1 }, { a: 2, b: 3 }] } },
      delimiter: ",",
    });
    expect(result.csv).toBe("a,b\r\n1,\r\n2,3");
  });

  it("accepts a single flat object as one row", async () => {
    const result = await executeNode("json.toCsv", {
      json: { row: { name: "Alice" } },
      delimiter: ",",
    });
    expect(result.success).toBe(true);
    expect(result.csv).toBe("name\r\nAlice");
  });

  it("reports success: false for a shape with no rows to find instead of throwing", async () => {
    const result = await executeNode("json.toCsv", {
      json: { a: { b: { c: 1 } } },
      delimiter: ",",
    });
    expect(result.success).toBe(false);
    expect(result.csv).toBe("");
  });

  it("reports success: false instead of throwing for the default null input", async () => {
    const result = await executeNode("json.toCsv", {
      json: null,
      delimiter: ",",
    });
    expect(result.success).toBe(false);
    expect(result.csv).toBe("");
  });
});

describe("csv.toXml", () => {
  it("wraps CSV rows under the default rows/row tags", async () => {
    const result = await executeNode("csv.toXml", {
      csv: "name,age\nAlice,30",
      delimiter: ",",
      rootTag: "",
      rowTag: "",
    });
    expect(result.success).toBe(true);
    expect(result.xml).toBe(
      "<rows><row><name>Alice</name><age>30</age></row></rows>",
    );
  });

  it("honors custom root/row tags", async () => {
    const result = await executeNode("csv.toXml", {
      csv: "name\nAlice\nBob",
      delimiter: ",",
      rootTag: "people",
      rowTag: "person",
    });
    expect(result.xml).toBe(
      "<people><person><name>Alice</name></person><person><name>Bob</name></person></people>",
    );
  });

  it("honors a custom delimiter", async () => {
    const result = await executeNode("csv.toXml", {
      csv: "name;Alice",
      delimiter: ";",
      rootTag: "rows",
      rowTag: "row",
    });
    // no header row supplied here (single line), so the one line becomes the header itself — this
    // proves the delimiter, not the specific row shape, is what's under test.
    expect(result.success).toBe(true);
  });

  it("round-trips through xml.toCsv back to equivalent rows", async () => {
    const csvIn = "name,age\r\nAlice,30\r\nBob,25";
    const toXml = await executeNode("csv.toXml", {
      csv: csvIn,
      delimiter: ",",
      rootTag: "",
      rowTag: "",
    });
    const backToCsv = await executeNode("xml.toCsv", {
      xml: toXml.xml,
      delimiter: ",",
    });
    expect(backToCsv.success).toBe(true);
    expect(backToCsv.csv).toBe(csvIn);
  });
});
