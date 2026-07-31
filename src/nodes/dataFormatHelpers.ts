import { XMLParser, XMLValidator } from "fast-xml-parser";
import XMLBuilder from "fast-xml-builder";
import * as Papa from "papaparse";

// Shared building blocks for the XML/JSON/CSV conversion nodes (xml.ts, csv.ts). Kept in their own
// leaf module, with no dependency on either node file, specifically so xml.ts and csv.ts can each
// depend on this module without depending on EACH OTHER — a real two-way import cycle between them
// would make several of their top-level registerNode() calls (which read compileHelpers/
// compileImports strings eagerly, not inside a closure) fragile to whichever file happened to load
// first.

// XML <-> JSON, backed by fast-xml-parser/fast-xml-builder rather than a hand-rolled parser: it's
// plain JS (no DOMParser/browser-only API), so it runs identically in the browser interpreter and
// in a compiled graph's plain-Node output, and it's dramatically more spec-compliant (entities,
// CDATA, encodings, real well-formedness checking via XMLValidator) than anything worth
// hand-maintaining here. The tradeoff, surfaced via NodeDef.compileImports: a compiled graph using
// these nodes needs `fast-xml-parser`/`fast-xml-builder` installed alongside it — no longer a fully
// dependency-free .mjs.
//
// XMLBuilder comes from the separate `fast-xml-builder` package, not from fast-xml-parser itself:
// fast-xml-parser's own typings mark its bundled XMLBuilder @deprecated in favor of the standalone
// package (it split out years ago and has since gained more features and speed — see fast-xml-
// parser's README "Before using this library" section). Confirmed byte-for-byte identical output
// between the two builders for every option this file actually sets (ignoreAttributes,
// attributeNamePrefix, textNodeName, format, indentBy) before switching. XMLValidator carries the
// same @deprecated marker (pointing at a sibling `fast-xml-validator` package) but is left as-is
// here — out of scope for this change, which only migrates the builder.
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

/** Same shape as XML_BUILD_OPTIONS but indented — used only for human-facing pretty-printing (see
 * debug.ts's Print (Formatted) node), never for xml.fromJson's actual conversion output, since a
 * conversion node's output is meant to be re-parsed by another tool, not read by a person. */
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

// CSV <-> JSON, backed by PapaParse rather than a hand-rolled parser — the de-facto standard CSV
// library, with far more battle-tested edge-case handling (quoting, embedded newlines, encodings,
// line-ending conventions) than anything worth hand-maintaining here, the same call already made
// for fast-xml-parser above.
//
// Note on responsiveness: PapaParse parses a plain in-memory string fully synchronously (measured
// directly — no yielding between rows even with its own `step` callback) unless `worker: true` is
// used, which relies on the browser's Worker API and wouldn't be available if these nodes are ever
// run outside the browser (e.g. embedded server-side later). So unlike the hand-rolled parser this
// replaced, this doesn't yield mid-parse for a large file — csv.toJson/json.toCsv/xml.toCsv/
// csv.toXml stay latent/exec nodes (matching http.request/the OAuth2 nodes) because a large file's
// parse/write time is itself still slow enough to warrant the clock icon, not because these
// functions internally yield the way the previous implementation did.
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
  // PapaParse's own default behavior only takes the FIRST object's keys as the header, silently
  // dropping any key a later object introduces — computing the header ourselves (in first-seen
  // order across every object) and passing it explicitly is what makes a ragged array of objects
  // round-trip correctly instead of quietly losing data.
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

// Tabular-rows bridge — looks for something CSV-shaped inside a single wrapped JSON object (either
// xmlToJsonValue's own parse of a root/row XML shape, or the identical { rootTag: { rowTag: [...] }
// } convention csv.toJson/csv.toXml build by hand): a repeated element (already an array under that
// convention) whose entries are each a flat record of scalar columns (so every entry has the same
// "columns"), or, failing that, a single flat record (one row). A "flat" value is any non-object,
// non-array leaf (string, number, boolean, null) — deliberately not string-only, even though every
// leaf xmlToJsonValue itself produces is a string (see its own comment): json.toCsv feeds this same
// function real JSON, where a column can legitimately be a number or boolean. Deliberately out of
// scope: a repeated element containing only bare values (e.g. <items><item>a</item></items>) has no
// column name to hang a header on, so it's rejected rather than guessed at; attributes on the
// wrapping/root element itself aren't carried into row data. A plain TS function (not the
// shared-source/new Function pattern above) since it's only ever called by the interpreter now —
// neither xml.toCsv nor json.toCsv has a compileExecute (see their own comments), so there's no
// compiled-path consumer to keep in sync with.
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
