import { XMLParser, XMLValidator } from "fast-xml-parser";
import XMLBuilder from "fast-xml-builder";
import * as Papa from "papaparse";
import { XML_PARSE_OPTIONS, XML_PRETTY_BUILD_OPTIONS } from "@hermione/graph/nodes/dataFormatHelpers";

function formatCsvTable(csv: string): string {
  const rows = (Papa.parse<string[]>(csv, { delimiter: "," }).data ?? []) as string[][];
  if (rows.length === 0) return csv;
  const colCount = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: colCount }, (_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  return rows
    .map((row) =>
      Array.from({ length: colCount }, (_, i) => (row[i] ?? "").padEnd(widths[i]))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/** Compile-time counterpart of debug.print's plain rt.log(message) — reformats the message per the
 * node's own Format pin (json/xml/csv/text) before logging, falling back to the raw message if it
 * doesn't actually parse as that format. */
export function formatForLog(message: string, format: string): string {
  try {
    if (format === "json") return JSON.stringify(JSON.parse(message), null, 2);
    if (format === "xml") {
      const validation = XMLValidator.validate(message);
      if (validation !== true) return message;
      return new XMLBuilder(XML_PRETTY_BUILD_OPTIONS).build(new XMLParser(XML_PARSE_OPTIONS).parse(message)).trimEnd();
    }
    if (format === "csv") return formatCsvTable(message);
    return message;
  } catch {
    return message;
  }
}
