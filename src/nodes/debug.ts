import { XMLParser, XMLValidator } from "fast-xml-parser";
import XMLBuilder from "fast-xml-builder";
import * as Papa from "papaparse";
import { registerNode } from "../engine/registry";
import { NodeColorCategory } from "../engine/types";
import type { LogFormat } from "../engine/types";
import { XML_BUILDER_IMPORT_LINE, XML_IMPORT_LINE, XML_PARSE_OPTIONS_LITERAL, XML_PRETTY_BUILD_OPTIONS_LITERAL } from "./dataFormatHelpers";

registerNode({
  type: "debug.print",
  label: "Print",
  description: "Logs a text message to the console for debugging.",
  group: "Debug",
  colorCategory: NodeColorCategory.Debug,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "message", label: "Message", type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: ({ inputs, ctx }) => {
    ctx.log(String(inputs.message ?? ""));
    return { nextExec: "exec-out" };
  },
  compileExecute: ({ inputs, compileFrom }) => [`rt.log(String(${inputs.message}));`, ...compileFrom("exec-out")],
});

const FORMATS = ["text", "json", "xml", "csv"];

// Pretty-prints Message before logging it, according to a chosen mimetype-ish Format, rather than
// always dumping a single raw (often single-line, hard-to-read) string — e.g. a JSON blob gets
// real indentation, an XML blob gets its elements laid out one per line, a CSV blob gets its
// columns aligned into a readable table. Written ONCE as a plain-JS source string, derived via
// `new Function` for the interpreter's own use and embedded verbatim as this node's compileHelpers
// entry for the compiled path — so there's exactly one implementation, not two hand-kept copies
// that could drift (same reasoning as xml.ts/dataFormatHelpers.ts). Both fast-xml-parser and
// PapaParse parse a plain string synchronously, so this whole node is fully synchronous — no need
// to make it async just because the sibling conversion nodes (which parse much larger input) are.
// "text" (the default) and anything that fails to parse under its chosen format falls back to the
// original, unmodified message rather than erroring — this is a logging convenience, not a
// validating conversion node.
const FORMAT_FOR_LOG_SOURCE = `
function formatCsvTable(csv) {
  const rows = Papa.parse(csv, { delimiter: "," }).data;
  if (rows.length === 0) return csv;
  const colCount = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: colCount }, (_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  return rows.map((row) => Array.from({ length: colCount }, (_, i) => (row[i] ?? "").padEnd(widths[i])).join("  ").trimEnd()).join("\\n");
}

function formatForLog(message, format) {
  try {
    if (format === "json") return JSON.stringify(JSON.parse(message), null, 2);
    if (format === "xml") {
      const validation = XMLValidator.validate(message);
      if (validation !== true) return message;
      return new XMLBuilder(${XML_PRETTY_BUILD_OPTIONS_LITERAL}).build(new XMLParser(${XML_PARSE_OPTIONS_LITERAL}).parse(message)).trimEnd();
    }
    if (format === "csv") return formatCsvTable(message);
    return message;
  } catch {
    return message;
  }
}
`;

const formatForLog: (message: string, format: string) => string = new Function("XMLParser", "XMLValidator", "XMLBuilder", "Papa", `${FORMAT_FOR_LOG_SOURCE}\nreturn formatForLog;`)(XMLParser, XMLValidator, XMLBuilder, Papa);

registerNode({
  type: "debug.printFormatted",
  label: "Print (Formatted)",
  description: "Logs a message pretty-printed according to a chosen format.",
  group: "Debug",
  colorCategory: NodeColorCategory.Debug,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "message", label: "Message", type: "string", direction: "input", defaultValue: "" },
    { id: "format", label: "Format", type: "string", direction: "input", defaultValue: FORMATS[0], options: FORMATS },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: ({ inputs, ctx }) => {
    const format = String(inputs.format ?? FORMATS[0]) as LogFormat;
    ctx.log(formatForLog(String(inputs.message ?? ""), format), format);
    return { nextExec: "exec-out" };
  },
  compileExecute: ({ inputs, compileFrom }) => [`rt.log(formatForLog(String(${inputs.message}), String(${inputs.format})));`, ...compileFrom("exec-out")],
  compileImports: [XML_IMPORT_LINE, XML_BUILDER_IMPORT_LINE, 'import * as Papa from "papaparse";'],
  compileHelpers: { formatForLog: FORMAT_FOR_LOG_SOURCE },
});
