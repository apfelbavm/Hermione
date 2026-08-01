import { registerNode } from "../engine/registry";
import { csvToObjects, extractTabularRows, jsonValueToXml, objectsToCsv } from "./dataFormatHelpers";
import { i18n } from "@i18n";

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
      const rows = await csvToObjects(String(inputs.csv ?? ""), String(inputs.delimiter ?? ","));
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

registerNode({
  type: "csv.toXml",
  label: i18n.nodes.csv.toXml.label,
  description: i18n.nodes.csv.toXml.description,
  group: "Conversion",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "csv", label: i18n.nodes.__shared.pin_csv, type: "string", direction: "input", defaultValue: "" },
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
      const rows = await csvToObjects(String(inputs.csv ?? ""), String(inputs.delimiter ?? ","));
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
