import { registerNode } from "../engine/registry";
import { CSV_HELPER_SOURCE, XML_BUILD_OPTIONS_LITERAL, XML_BUILD_IMPORT_LINE, csvToObjects, jsonValueToXml, objectsToCsv } from "./dataFormatHelpers";

registerNode({
  type: "csv.toJson",
  label: "CSV to JSON",
  group: "CSV",
  pins: [
    { id: "csv", label: "CSV", type: "string", direction: "input", defaultValue: "" },
    { id: "json", label: "JSON", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { json: JSON.stringify(csvToObjects(String(inputs.csv ?? ""))), success: true };
    } catch {
      return { json: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    const attempt = `(() => { try { return { json: JSON.stringify(csvToObjects(String(${inputs.csv}))), success: true }; } catch { return { json: "", success: false }; } })()`;
    return { json: `${attempt}.json`, success: `${attempt}.success` };
  },
  compileHelpers: { csvHelpers: CSV_HELPER_SOURCE },
});

registerNode({
  type: "json.toCsv",
  label: "JSON to CSV",
  group: "CSV",
  pins: [
    { id: "json", label: "JSON", type: "string", direction: "input", defaultValue: "[]" },
    { id: "csv", label: "CSV", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { csv: objectsToCsv(JSON.parse(String(inputs.json ?? "[]"))), success: true };
    } catch {
      return { csv: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    const attempt = `(() => { try { return { csv: objectsToCsv(JSON.parse(String(${inputs.json}))), success: true }; } catch { return { csv: "", success: false }; } })()`;
    return { csv: `${attempt}.csv`, success: `${attempt}.success` };
  },
  compileHelpers: { csvHelpers: CSV_HELPER_SOURCE },
});

// CSV to XML — bridges through jsonValueToXml() (see dataFormatHelpers.ts) by wrapping the parsed
// rows under a caller-chosen root/row tag pair, e.g. { rows: { row: [...] } }, since a bare array
// has no XML element name of its own to be built under.
registerNode({
  type: "csv.toXml",
  label: "CSV to XML",
  group: "CSV",
  pins: [
    { id: "csv", label: "CSV", type: "string", direction: "input", defaultValue: "" },
    { id: "rootTag", label: "Root Tag", type: "string", direction: "input", defaultValue: "rows" },
    { id: "rowTag", label: "Row Tag", type: "string", direction: "input", defaultValue: "row" },
    { id: "xml", label: "XML", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      const rows = csvToObjects(String(inputs.csv ?? ""));
      const rootTag = String(inputs.rootTag ?? "").trim() || "rows";
      const rowTag = String(inputs.rowTag ?? "").trim() || "row";
      return { xml: jsonValueToXml({ [rootTag]: { [rowTag]: rows } }), success: true };
    } catch {
      return { xml: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    const attempt =
      `(() => { try { const __rootTag = String(${inputs.rootTag}).trim() || "rows"; const __rowTag = String(${inputs.rowTag}).trim() || "row"; ` +
      `return { xml: new XMLBuilder(${XML_BUILD_OPTIONS_LITERAL}).build({ [__rootTag]: { [__rowTag]: csvToObjects(String(${inputs.csv})) } }), success: true }; } ` +
      `catch { return { xml: "", success: false }; } })()`;
    return { xml: `${attempt}.xml`, success: `${attempt}.success` };
  },
  compileImports: [XML_BUILD_IMPORT_LINE],
  compileHelpers: { csvHelpers: CSV_HELPER_SOURCE },
});
