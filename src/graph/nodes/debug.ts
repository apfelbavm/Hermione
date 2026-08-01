import { XMLParser, XMLValidator } from "fast-xml-parser";
import XMLBuilder from "fast-xml-builder";
import * as Papa from "papaparse";
import { registerNode } from "../../engine/registry";
import { NodeColorCategory } from "../../engine/types";
import type { LogFormat } from "../../engine/types";
import { XML_BUILDER_IMPORT_LINE, XML_IMPORT_LINE, XML_PARSE_OPTIONS_LITERAL, XML_PRETTY_BUILD_OPTIONS_LITERAL } from "./dataFormatHelpers";
import { i18n } from "@i18n";

registerNode({
  type: "debug.print",
  label: i18n.nodes.debug.print.label,
  description: i18n.nodes.debug.print.description,
  group: "Debug",
  colorCategory: NodeColorCategory.Debug,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "message", label: i18n.nodes.debug.print.pin_message, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: ({ inputs, ctx }) => {
    ctx.log(String(inputs.message ?? ""));
    return { nextExec: "exec-out" };
  },
  compileExecute: ({ inputs, compileFrom }) => [`rt.log(String(${inputs.message}));`, ...compileFrom("exec-out")],
});

const FORMATS = ["json", "xml", "csv"];

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
  label: i18n.nodes.debug.printFormatted.label,
  description: i18n.nodes.debug.printFormatted.description,
  group: "Debug",
  colorCategory: NodeColorCategory.Debug,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "message", label: i18n.nodes.debug.printFormatted.pin_message, type: "string", direction: "input", defaultValue: "" },
    { id: "format", label: i18n.nodes.debug.printFormatted.pin_format, type: "string", direction: "input", defaultValue: FORMATS[0], options: FORMATS },
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
