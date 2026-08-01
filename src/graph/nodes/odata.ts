import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_IMPORT } from "../engine/compileUtils";
import { enumOptionIds } from "../engine/enumRegistry";
import { ODATA_PAGINATION_TYPE_ENUM_TYPE } from "../enum/odata";
import { odataV2Request } from "../../server/functionLibrary";
import { i18n } from "@i18n";

const PAGINATION_TYPES = enumOptionIds(ODATA_PAGINATION_TYPE_ENUM_TYPE);

registerNode({
  type: "odata.v2Request",
  label: i18n.nodes.odata.v2Request.label,
  description: i18n.nodes.odata.v2Request.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "url", label: i18n.nodes.odata.v2Request.pin_url, type: "string", direction: "input", defaultValue: "" },
    { id: "pageSize", label: i18n.nodes.odata.v2Request.pin_page_size, type: "number", direction: "input", defaultValue: 1000, integer: true },
    { id: "paginationType", label: i18n.nodes.odata.v2Request.pin_pagination_type, type: "enum", subType: ODATA_PAGINATION_TYPE_ENUM_TYPE, direction: "input", defaultValue: PAGINATION_TYPES[0], options: PAGINATION_TYPES },
    { id: "maxPages", label: i18n.nodes.odata.v2Request.pin_max_pages, type: "number", direction: "input", defaultValue: 50, integer: true },
    { id: "headers", label: i18n.nodes.odata.v2Request.pin_headers, type: "string", direction: "input", defaultValue: "{}" },
    { id: "auth", label: i18n.nodes.__shared.pin_auth, type: "object", direction: "input", defaultValue: null },
    { id: "timeoutMs", label: i18n.nodes.__shared.pin_timeout, type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "status", label: i18n.nodes.__shared.pin_status, type: "number", direction: "output" },
    { id: "rows", label: i18n.nodes.odata.v2Request.pin_rows, type: "object", container: "array", direction: "output" },
    { id: "pageCount", label: i18n.nodes.odata.v2Request.pin_page_count, type: "number", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  // Fires exec-out exactly once, whether every page fetched cleanly or a later page failed midway
  // (in which case "rows" still holds whatever was gathered before the failure) — same single-
  // exec-out convention as http.request rather than inventing separate success/failure exec paths.
  execute: async ({ inputs }) => ({
    nextExec: "exec-out",
    outputs: await odataV2Request({
      baseUrl: String(inputs.url ?? ""),
      pageSize: Number(inputs.pageSize ?? 1000),
      paginationType: String(inputs.paginationType ?? PAGINATION_TYPES[0]),
      maxPages: Number(inputs.maxPages ?? 50),
      headersJson: String(inputs.headers ?? ""),
      auth: inputs.auth as { header?: unknown; value?: unknown } | null | undefined,
      timeoutMs: Number(inputs.timeoutMs ?? 0),
    }),
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrary.odataV2Request({ baseUrl: ${inputs.url}, pageSize: ${inputs.pageSize}, paginationType: ${inputs.paginationType}, maxPages: ${inputs.maxPages}, headersJson: ${inputs.headers}, auth: ${inputs.auth}, timeoutMs: ${inputs.timeoutMs} });`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      status: `${v}.status`,
      rows: `${v}.rows`,
      pageCount: `${v}.pageCount`,
      error: `${v}.error`,
    };
  },
  compileImports: [FUNCTION_LIBRARY_IMPORT],
});
