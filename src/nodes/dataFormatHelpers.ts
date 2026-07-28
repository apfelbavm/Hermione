import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";

// Shared building blocks for the XML/JSON/CSV conversion nodes (xml.ts, csv.ts). Kept in their own
// leaf module, with no dependency on either node file, specifically so xml.ts and csv.ts can each
// depend on this module without depending on EACH OTHER — a real two-way import cycle between them
// would make several of their top-level registerNode() calls (which read compileHelpers/
// compileImports strings eagerly, not inside a closure) fragile to whichever file happened to load
// first.

// XML <-> JSON, backed by fast-xml-parser rather than a hand-rolled parser: it's plain JS (no
// DOMParser/browser-only API), so it runs identically in the browser interpreter and in a compiled
// graph's plain-Node output, and it's dramatically more spec-compliant (entities, CDATA, encodings,
// real well-formedness checking via XMLValidator) than anything worth hand-maintaining here. The
// tradeoff, surfaced via NodeDef.compileImports: a compiled graph using these nodes needs
// `fast-xml-parser` installed alongside it — no longer a fully dependency-free .mjs, the same call
// already made for the SAML node's xmldsigjs dependency.
//
// Conversion convention (documented, not a spec): attributes become "@name" keys, text alongside
// child elements (if any) becomes "#text", repeated sibling elements with the same tag name become
// an array, and the whole result is wrapped under the root element's own tag name. Every value is
// kept as a raw string (parseTagValue/parseAttributeValue: false) rather than fast-xml-parser's
// default numeric/boolean coercion, since XML has no notion of a leaf's type and silently guessing
// one (is "007" a number?) is more likely to surprise than help.
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

export const XML_PARSE_OPTIONS_LITERAL = JSON.stringify(XML_PARSE_OPTIONS);
export const XML_BUILD_OPTIONS_LITERAL = JSON.stringify(XML_BUILD_OPTIONS);
export const XML_IMPORT_LINE = 'import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";';
export const XML_BUILD_IMPORT_LINE = 'import { XMLBuilder } from "fast-xml-parser";';

export function xmlToJsonValue(xml: string): unknown {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(validation.err.msg);
  return new XMLParser(XML_PARSE_OPTIONS).parse(xml);
}

export function jsonValueToXml(value: unknown): string {
  return new XMLBuilder(XML_BUILD_OPTIONS).build(value);
}

// CSV <-> JSON — hand-rolled (RFC 4180-ish: comma-separated, double-quote-escaped fields that may
// embed commas/quotes/newlines, first row is the header row) rather than pulling in a library,
// since unlike XML this format is small and unambiguous enough to maintain directly. Written ONCE
// as a plain-JS source string rather than twice — a real TS implementation for the interpreter plus
// a matching string for the compiler — so the interpreter and compiled output can't drift apart
// (same reasoning as the original hand-rolled XML parser this replaced, and flow.ts's
// DELAY_HELPER_SOURCE for its own tiny helper). `new Function` derives the actual callables from
// this SAME string once at module load for the interpreter's own use.
export const CSV_HELPER_SOURCE = `
function csvToRows(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = csv.length;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < len) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { pushField(); i++; continue; }
    if (ch === "\\r") { i++; continue; }
    if (ch === "\\n") { pushRow(); i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  // A trailing newline produces one bogus fully-empty row — drop it rather than surfacing it as data.
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }
  return rows;
}

function csvToObjects(csv) {
  const rows = csvToRows(csv);
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ""; });
    return obj;
  });
}

function csvField(value) {
  const s = String(value);
  return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function objectsToCsv(objects) {
  if (!Array.isArray(objects)) throw new Error("Expected a JSON array of objects");
  const headers = [];
  const seen = new Set();
  objects.forEach((obj) => {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new Error("Expected each array entry to be a flat object");
    }
    Object.keys(obj).forEach((key) => {
      if (!seen.has(key)) { seen.add(key); headers.push(key); }
    });
  });
  const lines = [headers.map(csvField).join(",")];
  objects.forEach((obj) => {
    lines.push(headers.map((h) => csvField(obj[h] !== undefined ? obj[h] : "")).join(","));
  });
  return lines.join("\\r\\n");
}
`;

const csvHelperFns: {
  csvToObjects: (csv: string) => Record<string, string>[];
  objectsToCsv: (objects: unknown[]) => string;
} = new Function(`${CSV_HELPER_SOURCE}\nreturn { csvToObjects, objectsToCsv };`)();

export const csvToObjects = csvHelperFns.csvToObjects;
export const objectsToCsv = csvHelperFns.objectsToCsv;

// XML to CSV bridge — looks for something CSV-shaped inside a parsed (xmlToJsonValue) result: a
// repeated element (already an array under xmlToJsonValue's convention) whose entries are each a
// flat record of attributes/text-only child elements (so every entry has the same "columns"), or,
// failing that, a single flat record (one row). Deliberately out of scope: a repeated element
// containing only bare text (e.g. <items><item>a</item></items>) has no column name to hang a
// header on, so it's rejected rather than guessed at; attributes on the wrapping/root element
// itself aren't carried into row data.
export const XML_ROWS_HELPER_SOURCE = `
function extractXmlRows(parsedRoot) {
  const isFlatRow = (v) =>
    typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

  const asRows = (v) => {
    if (!Array.isArray(v)) return null;
    if (!v.every(isFlatRow)) throw new Error("Expected every repeated XML element to be a flat record of attributes/text children");
    return v;
  };

  const rootValue = Object.values(parsedRoot)[0];
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
  throw new Error("Could not find a repeated element or flat record in the XML to convert to CSV rows");
}
`;

export const extractXmlRows: (parsedRoot: unknown) => Record<string, string>[] = new Function(
  `${XML_ROWS_HELPER_SOURCE}\nreturn extractXmlRows;`,
)();
