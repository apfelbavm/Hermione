import { registerNode } from "../engine/registry";
import { csvToObjects, jsonValueToXml, objectsToCsv } from "./dataFormatHelpers";

// CSV <-> JSON, backed by PapaParse (see dataFormatHelpers.ts). Both nodes are latent (exec, not
// pure) rather than a plain data node: a large file (thousands of rows x hundreds of columns) is
// slow enough to visibly freeze the tab, and PapaParse parses a plain string fully synchronously
// (see dataFormatHelpers.ts's own comment) — so unlike the hand-rolled parser this replaced, being
// "latent" here is purely a UI signal (the clock icon), not something that actually yields mid-call.
// Compiler support (compileExecute) is intentionally out of scope for now, same call already made
// for http.request/the OAuth2 nodes — these nodes have data outputs beyond a single result, which
// no exec node compiles yet.
registerNode({
  type: "csv.toJson",
  label: "CSV to JSON",
  group: "CSV",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "csv", label: "CSV", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "delimiter", label: "Delimiter", type: "string", direction: "input", defaultValue: "," },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "json", label: "JSON", type: "object", container: "array", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    try {
      const json = await csvToObjects(String(inputs.csv ?? ""), String(inputs.delimiter ?? ","));
      return { nextExec: "exec-out", outputs: { json, success: true } };
    } catch {
      return { nextExec: "exec-out", outputs: { json: [], success: false } };
    }
  },
});

registerNode({
  type: "json.toCsv",
  label: "JSON to CSV",
  group: "CSV",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "json", label: "JSON", type: "object", container: "array", direction: "input", defaultValue: [] },
    { id: "delimiter", label: "Delimiter", type: "string", direction: "input", defaultValue: "," },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "csv", label: "CSV", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    try {
      const csv = await objectsToCsv(inputs.json as unknown[], String(inputs.delimiter ?? ","));
      return { nextExec: "exec-out", outputs: { csv, success: true } };
    } catch {
      return { nextExec: "exec-out", outputs: { csv: "", success: false } };
    }
  },
});

// CSV to XML — bridges through jsonValueToXml() (see dataFormatHelpers.ts) by wrapping the parsed
// rows under a caller-chosen root/row tag pair, e.g. { rows: { row: [...] } }, since a bare array
// has no XML element name of its own to be built under.
registerNode({
  type: "csv.toXml",
  label: "CSV to XML",
  group: "CSV",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "csv", label: "CSV", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "delimiter", label: "Delimiter", type: "string", direction: "input", defaultValue: "," },
    { id: "rootTag", label: "Root Tag", type: "string", direction: "input", defaultValue: "rows" },
    { id: "rowTag", label: "Row Tag", type: "string", direction: "input", defaultValue: "row" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "xml", label: "XML", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    try {
      const rows = await csvToObjects(String(inputs.csv ?? ""), String(inputs.delimiter ?? ","));
      const rootTag = String(inputs.rootTag ?? "").trim() || "rows";
      const rowTag = String(inputs.rowTag ?? "").trim() || "row";
      return { nextExec: "exec-out", outputs: { xml: jsonValueToXml({ [rootTag]: { [rowTag]: rows } }), success: true } };
    } catch {
      return { nextExec: "exec-out", outputs: { xml: "", success: false } };
    }
  },
});
