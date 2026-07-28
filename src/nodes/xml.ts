import { registerNode } from "../engine/registry";
import {
  CSV_HELPER_SOURCE,
  XML_BUILD_OPTIONS_LITERAL,
  XML_IMPORT_LINE,
  XML_PARSE_OPTIONS_LITERAL,
  XML_ROWS_HELPER_SOURCE,
  extractXmlRows,
  jsonValueToXml,
  objectsToCsv,
  xmlToJsonValue,
} from "./dataFormatHelpers";

registerNode({
  type: "xml.toJson",
  label: "XML to JSON",
  group: "XML",
  pins: [
    { id: "xml", label: "XML", type: "string", direction: "input", defaultValue: "" },
    { id: "json", label: "JSON", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { json: JSON.stringify(xmlToJsonValue(String(inputs.xml ?? ""))), success: true };
    } catch {
      return { json: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    // Both output expressions independently re-run the same try/parse IIFE — duplicated work, but
    // the same tradeoff array.ts's own multi-output pure nodes already accept, since compileEvaluate
    // has no way to compute a shared intermediate once and hand it to two output-pin expressions.
    const attempt =
      `(() => { try { const __v = XMLValidator.validate(${inputs.xml}); if (__v !== true) throw new Error(__v.err.msg); ` +
      `return { json: JSON.stringify(new XMLParser(${XML_PARSE_OPTIONS_LITERAL}).parse(${inputs.xml})), success: true }; } ` +
      `catch { return { json: "", success: false }; } })()`;
    return { json: `${attempt}.json`, success: `${attempt}.success` };
  },
  compileImports: [XML_IMPORT_LINE],
});

registerNode({
  type: "xml.fromJson",
  label: "JSON to XML",
  group: "XML",
  pins: [
    { id: "json", label: "JSON", type: "string", direction: "input", defaultValue: "" },
    { id: "xml", label: "XML", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { xml: jsonValueToXml(JSON.parse(String(inputs.json ?? ""))), success: true };
    } catch {
      return { xml: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    const attempt =
      `(() => { try { return { xml: new XMLBuilder(${XML_BUILD_OPTIONS_LITERAL}).build(JSON.parse(String(${inputs.json}))), success: true }; } ` +
      `catch { return { xml: "", success: false }; } })()`;
    return { xml: `${attempt}.xml`, success: `${attempt}.success` };
  },
  compileImports: [XML_IMPORT_LINE],
});

registerNode({
  type: "xml.toCsv",
  label: "XML to CSV",
  group: "XML",
  pins: [
    { id: "xml", label: "XML", type: "string", direction: "input", defaultValue: "" },
    { id: "csv", label: "CSV", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      const rows = extractXmlRows(xmlToJsonValue(String(inputs.xml ?? "")));
      return { csv: objectsToCsv(rows), success: true };
    } catch {
      return { csv: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    const attempt =
      `(() => { try { const __v = XMLValidator.validate(${inputs.xml}); if (__v !== true) throw new Error(__v.err.msg); ` +
      `return { csv: objectsToCsv(extractXmlRows(new XMLParser(${XML_PARSE_OPTIONS_LITERAL}).parse(${inputs.xml}))), success: true }; } ` +
      `catch { return { csv: "", success: false }; } })()`;
    return { csv: `${attempt}.csv`, success: `${attempt}.success` };
  },
  compileImports: [XML_IMPORT_LINE],
  compileHelpers: { csvHelpers: CSV_HELPER_SOURCE, xmlCsvBridge: XML_ROWS_HELPER_SOURCE },
});
