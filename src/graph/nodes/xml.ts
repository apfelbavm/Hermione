import { registerNode } from "../../engine/registry";
import { i18n } from "@i18n";
import { XML_BUILDER_IMPORT_LINE, XML_BUILD_OPTIONS_LITERAL, XML_IMPORT_LINE, XML_PARSE_OPTIONS_LITERAL, extractTabularRows, jsonValueToXml, objectsToCsv, xmlToJsonValue } from "./dataFormatHelpers";

registerNode({
  type: "xml.toJson",
  label: i18n.nodes.xml.toJson.label,
  description: i18n.nodes.xml.toJson.description,
  group: "Conversion",
  pins: [
    { id: "xml", label: i18n.nodes.__shared.pin_xml, type: "string", direction: "input", defaultValue: "" },
    { id: "json", label: i18n.nodes.__shared.pin_json, type: "object", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { json: xmlToJsonValue(String(inputs.xml ?? "")), success: true };
    } catch {
      return { json: null, success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    const attempt = `(() => { try { const __v = XMLValidator.validate(${inputs.xml}); if (__v !== true) throw new Error(__v.err.msg); ` + `return { json: new XMLParser(${XML_PARSE_OPTIONS_LITERAL}).parse(${inputs.xml}), success: true }; } ` + `catch { return { json: null, success: false }; } })()`;
    return { json: `${attempt}.json`, success: `${attempt}.success` };
  },
  compileImports: [XML_IMPORT_LINE],
});

registerNode({
  type: "xml.fromJson",
  label: i18n.nodes.xml.fromJson.label,
  description: i18n.nodes.xml.fromJson.description,
  group: "Conversion",
  pins: [
    { id: "json", label: i18n.nodes.__shared.pin_json, type: "object", direction: "input", defaultValue: null },
    { id: "xml", label: i18n.nodes.__shared.pin_xml, type: "string", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { xml: jsonValueToXml(inputs.json), success: true };
    } catch {
      return { xml: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    const attempt = `(() => { try { return { xml: new XMLBuilder(${XML_BUILD_OPTIONS_LITERAL}).build(${inputs.json}), success: true }; } ` + `catch { return { xml: "", success: false }; } })()`;
    return { xml: `${attempt}.xml`, success: `${attempt}.success` };
  },
  compileImports: [XML_BUILDER_IMPORT_LINE],
});

registerNode({
  type: "xml.toCsv",
  label: i18n.nodes.xml.toCsv.label,
  description: i18n.nodes.xml.toCsv.description,
  group: "Conversion",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "xml", label: i18n.nodes.__shared.pin_xml, type: "string", direction: "input", defaultValue: "" },
    { id: "delimiter", label: i18n.nodes.__shared.pin_delimiter, type: "string", direction: "input", defaultValue: "," },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "csv", label: i18n.nodes.__shared.pin_csv, type: "string", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    try {
      const rows = extractTabularRows(xmlToJsonValue(String(inputs.xml ?? "")));
      const csv = await objectsToCsv(rows, String(inputs.delimiter ?? ","));
      return { nextExec: "exec-out", outputs: { csv, success: true } };
    } catch {
      return { nextExec: "exec-out", outputs: { csv: "", success: false } };
    }
  },
});
