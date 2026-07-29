import { registerNode } from "../engine/registry";
import {
  XML_BUILDER_IMPORT_LINE,
  XML_BUILD_OPTIONS_LITERAL,
  XML_IMPORT_LINE,
  XML_PARSE_OPTIONS_LITERAL,
  extractTabularRows,
  jsonValueToXml,
  objectsToCsv,
  xmlToJsonValue,
} from "./dataFormatHelpers";

registerNode({
  type: "xml.toJson",
  label: "XML to JSON",
  group: "XML",
  pins: [
    { id: "xml", label: "XML", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "json", label: "JSON", type: "object", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { json: xmlToJsonValue(String(inputs.xml ?? "")), success: true };
    } catch {
      return { json: null, success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    // Both output expressions independently re-run the same try/parse IIFE — duplicated work, but
    // the same tradeoff array.ts's own multi-output pure nodes already accept, since compileEvaluate
    // has no way to compute a shared intermediate once and hand it to two output-pin expressions.
    const attempt =
      `(() => { try { const __v = XMLValidator.validate(${inputs.xml}); if (__v !== true) throw new Error(__v.err.msg); ` +
      `return { json: new XMLParser(${XML_PARSE_OPTIONS_LITERAL}).parse(${inputs.xml}), success: true }; } ` +
      `catch { return { json: null, success: false }; } })()`;
    return { json: `${attempt}.json`, success: `${attempt}.success` };
  },
  compileImports: [XML_IMPORT_LINE],
});

registerNode({
  type: "xml.fromJson",
  label: "JSON to XML",
  group: "XML",
  pins: [
    { id: "json", label: "JSON", type: "object", direction: "input", defaultValue: null },
    { id: "xml", label: "XML", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { xml: jsonValueToXml(inputs.json), success: true };
    } catch {
      return { xml: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    const attempt =
      `(() => { try { return { xml: new XMLBuilder(${XML_BUILD_OPTIONS_LITERAL}).build(${inputs.json}), success: true }; } ` +
      `catch { return { xml: "", success: false }; } })()`;
    return { xml: `${attempt}.xml`, success: `${attempt}.success` };
  },
  compileImports: [XML_BUILDER_IMPORT_LINE],
});

registerNode({
  type: "xml.toCsv",
  label: "XML to CSV",
  group: "XML",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "xml", label: "XML", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "delimiter", label: "Delimiter", type: "string", direction: "input", defaultValue: "," },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "csv", label: "CSV", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  // Latent (exec, not pure): converting to CSV means writing out potentially thousands of rows via
  // PapaParse's objectsToCsv (see dataFormatHelpers.ts), slow enough for a large file to visibly
  // freeze the tab if run synchronously — being "latent" here is purely a UI signal (the clock
  // icon), since PapaParse itself doesn't yield mid-call. Compiler support (compileExecute) is
  // intentionally out of scope for now, same call already made for http.request/the OAuth2 nodes —
  // this node has data outputs beyond a single result, which no exec node compiles yet.
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
