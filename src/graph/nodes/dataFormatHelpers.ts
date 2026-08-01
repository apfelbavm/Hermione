import { XMLParser, XMLValidator } from "fast-xml-parser";
import XMLBuilder from "fast-xml-builder";
import * as Papa from "papaparse";

export const XML_PARSE_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
} as const;

export const XML_BUILD_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  format: false,
} as const;

export const XML_PRETTY_BUILD_OPTIONS = {
  ...XML_BUILD_OPTIONS,
  format: true,
  indentBy: "  ",
} as const;

export const XML_PARSE_OPTIONS_LITERAL = JSON.stringify(XML_PARSE_OPTIONS);
export const XML_BUILD_OPTIONS_LITERAL = JSON.stringify(XML_BUILD_OPTIONS);
export const XML_PRETTY_BUILD_OPTIONS_LITERAL = JSON.stringify(
  XML_PRETTY_BUILD_OPTIONS,
);
export const XML_IMPORT_LINE =
  'import { XMLParser, XMLValidator } from "fast-xml-parser";';
export const XML_BUILDER_IMPORT_LINE =
  'import XMLBuilder from "fast-xml-builder";';

export function xmlToJsonValue(xml: string): unknown {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(validation.err.msg);
  return new XMLParser(XML_PARSE_OPTIONS).parse(xml);
}

export function jsonValueToXml(value: unknown): string {
  return new XMLBuilder(XML_BUILD_OPTIONS).build(value);
}

export async function csvToObjects(
  csv: string,
  delimiter = ",",
): Promise<Record<string, string>[]> {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    delimiter: (delimiter && delimiter[0]) || ",",
    skipEmptyLines: true,
  });
  return result.data;
}

export async function objectsToCsv(
  objects: unknown[],
  delimiter = ",",
): Promise<string> {
  if (!Array.isArray(objects))
    throw new Error("Expected a JSON array of objects");
  const fields: string[] = [];
  const seen = new Set<string>();
  for (const obj of objects) {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new Error("Expected each array entry to be a flat object");
    }
    for (const key of Object.keys(obj)) {
      if (!seen.has(key)) {
        seen.add(key);
        fields.push(key);
      }
    }
  }
  return Papa.unparse(
    { fields, data: objects as Record<string, unknown>[] },
    { delimiter: (delimiter && delimiter[0]) || "," },
  );
}

export function extractTabularRows(
  parsedRoot: unknown,
): Record<string, unknown>[] {
  const isFlatRow = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every((x) => x === null || typeof x !== "object");

  const asRows = (v: unknown): Record<string, unknown>[] | null => {
    if (!Array.isArray(v)) return null;
    if (!v.every(isFlatRow))
      throw new Error(
        "Expected every repeated element to be a flat record of scalar columns",
      );
    return v;
  };

  const rootValue = Object.values(parsedRoot as Record<string, unknown>)[0];
  if (isFlatRow(rootValue)) return [rootValue];
  const direct = asRows(rootValue);
  if (direct) return direct;
  if (typeof rootValue === "object" && rootValue !== null) {
    const arrayValues = Object.values(rootValue).filter(Array.isArray);
    if (arrayValues.length === 1) {
      const rows = asRows(arrayValues[0]);
      if (rows) return rows;
    }
  }
  throw new Error(
    "Could not find a repeated element or flat record to convert to CSV rows",
  );
}
