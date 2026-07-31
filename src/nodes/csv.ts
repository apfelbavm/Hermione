import { registerNode } from "../engine/registry";
import {
  csvToObjects,
  extractTabularRows,
  jsonValueToXml,
  objectsToCsv,
} from "./dataFormatHelpers";
import { i18n } from "@i18n";

// CSV <-> JSON, backed by PapaParse (see dataFormatHelpers.ts). Both nodes are latent (exec, not
// pure) rather than a plain data node: a large file (thousands of rows x hundreds of columns) is
// slow enough to visibly freeze the tab, and PapaParse parses a plain string fully synchronously
// (see dataFormatHelpers.ts's own comment) — so unlike the hand-rolled parser this replaced, being
// "latent" here is purely a UI signal (the clock icon), not something that actually yields mid-call.
// Compiler support (compileExecute) is intentionally out of scope for now, same call still made for
// auth.oauth2ClientCredentials — these nodes have data outputs beyond a single result, which needs
// the compiler's compileExecuteOutputs hook (see auth.oauth2Saml/http.request for the pattern once
// something actually needs these compiled).
//
// csv.toJson's "json" pin is a single object, not an Array<Object>: the rows are wrapped under a
// caller-chosen root/row tag pair, e.g. { rows: { row: [...] } } — the same convention csv.toXml
// already used to hand rows to jsonValueToXml (a bare array has no element name of its own to be
// built under). Wrapping here too, rather than emitting the raw array, is what lets this node's
// output pin (container-less "object") wire directly into other single-object JSON pins like
// xml.fromJson's "json" input — pins only connect when their container matches exactly (see
// registry.ts's isPinTypeCompatible), so an Array<Object> output could never reach a plain object
// input. json.toCsv (below) unwraps the same convention via extractTabularRows so the round trip —
// and feeding in xml.toJson's output instead — both still work.
registerNode({
  type: "csv.toJson",
  label: i18n.nodes.csv.toJson.label,
  description: i18n.nodes.csv.toJson.description,
  group: "Conversion",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "csv",
      label: i18n.nodes.__shared.pin_csv,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "delimiter",
      label: i18n.nodes.__shared.pin_delimiter,
      type: "string",
      direction: "input",
      defaultValue: ",",
    },
    {
      id: "rootTag",
      label: i18n.nodes.csv.toJson.pin_root_tag,
      type: "string",
      direction: "input",
      defaultValue: "rows",
    },
    {
      id: "rowTag",
      label: i18n.nodes.csv.toJson.pin_row_tag,
      type: "string",
      direction: "input",
      defaultValue: "row",
    },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    {
      id: "json",
      label: i18n.nodes.__shared.pin_json,
      type: "object",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    try {
      const rows = await csvToObjects(
        String(inputs.csv ?? ""),
        String(inputs.delimiter ?? ","),
      );
      const rootTag = String(inputs.rootTag ?? "").trim() || "rows";
      const rowTag = String(inputs.rowTag ?? "").trim() || "row";
      return {
        nextExec: "exec-out",
        outputs: { json: { [rootTag]: { [rowTag]: rows } }, success: true },
      };
    } catch {
      return { nextExec: "exec-out", outputs: { json: null, success: false } };
    }
  },
});

registerNode({
  type: "json.toCsv",
  label: i18n.nodes.csv.toCsv.label,
  description: i18n.nodes.csv.toCsv.description,
  group: "Conversion",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "json",
      label: i18n.nodes.__shared.pin_json,
      type: "object",
      direction: "input",
      defaultValue: null,
    },
    {
      id: "delimiter",
      label: i18n.nodes.__shared.pin_delimiter,
      type: "string",
      direction: "input",
      defaultValue: ",",
    },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    {
      id: "csv",
      label: i18n.nodes.__shared.pin_csv,
      type: "string",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    try {
      const rows = extractTabularRows(inputs.json);
      const csv = await objectsToCsv(rows, String(inputs.delimiter ?? ","));
      return { nextExec: "exec-out", outputs: { csv, success: true } };
    } catch {
      return { nextExec: "exec-out", outputs: { csv: "", success: false } };
    }
  },
});

// CSV to XML — bridges through jsonValueToXml() (see dataFormatHelpers.ts) by wrapping the parsed
// rows under a caller-chosen root/row tag pair, e.g. { rows: { row: [...] } }, since a bare array
// has no XML element name of its own to be built under. (Same wrapping csv.toJson now does, above.)
registerNode({
  type: "csv.toXml",
  label: i18n.nodes.csv.toXml.label,
  description: i18n.nodes.csv.toXml.description,
  group: "Conversion",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "csv",
      label: i18n.nodes.__shared.pin_csv,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "delimiter",
      label: i18n.nodes.__shared.pin_delimiter,
      type: "string",
      direction: "input",
      defaultValue: ",",
    },
    {
      id: "rootTag",
      label: i18n.nodes.csv.toXml.pin_root_tag,
      type: "string",
      direction: "input",
      defaultValue: "rows",
    },
    {
      id: "rowTag",
      label: i18n.nodes.csv.toXml.pin_row_tag,
      type: "string",
      direction: "input",
      defaultValue: "row",
    },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    {
      id: "xml",
      label: i18n.nodes.__shared.pin_xml,
      type: "string",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    try {
      const rows = await csvToObjects(
        String(inputs.csv ?? ""),
        String(inputs.delimiter ?? ","),
      );
      const rootTag = String(inputs.rootTag ?? "").trim() || "rows";
      const rowTag = String(inputs.rowTag ?? "").trim() || "row";
      return {
        nextExec: "exec-out",
        outputs: {
          xml: jsonValueToXml({ [rootTag]: { [rowTag]: rows } }),
          success: true,
        },
      };
    } catch {
      return { nextExec: "exec-out", outputs: { xml: "", success: false } };
    }
  },
});
