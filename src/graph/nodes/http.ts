import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_IMPORT } from "../engine/compileUtils";
import { enumOptionIds } from "../engine/enumRegistry";
import { HTTP_METHOD_ENUM_TYPE } from "../enum/common";
import { httpRequest } from "../../server/functionLibrary";
import { i18n } from "@i18n";

registerNode({
  type: "http.request",
  label: i18n.nodes.http.request.label,
  description: i18n.nodes.http.request.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "method", label: i18n.nodes.http.request.pin_method, type: "enum", subType: HTTP_METHOD_ENUM_TYPE, direction: "input", defaultValue: "GET", options: enumOptionIds(HTTP_METHOD_ENUM_TYPE) },
    { id: "url", label: i18n.nodes.http.request.pin_url, type: "string", direction: "input", defaultValue: "" },
    { id: "headers", label: i18n.nodes.http.request.pin_headers, type: "string", direction: "input", defaultValue: "{}" },
    { id: "auth", label: i18n.nodes.__shared.pin_auth, type: "object", direction: "input", defaultValue: null },
    { id: "body", label: i18n.nodes.http.request.pin_body, type: "string", direction: "input", defaultValue: "" },
    { id: "timeoutMs", label: i18n.nodes.__shared.pin_timeout, type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "status", label: i18n.nodes.__shared.pin_status, type: "number", direction: "output" },
    { id: "responseBody", label: i18n.nodes.http.request.pin_response_body, type: "string", direction: "output" },
    { id: "responseHeaders", label: i18n.nodes.http.request.pin_response_headers, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,

  execute: async ({ inputs }) => ({
    nextExec: "exec-out",
    outputs: await httpRequest({
      url: String(inputs.url ?? ""),
      method: String(inputs.method ?? "GET"),
      headersJson: String(inputs.headers ?? ""),
      auth: inputs.auth as { header?: unknown; value?: unknown } | null | undefined,
      body: String(inputs.body ?? ""),
      timeoutMs: Number(inputs.timeoutMs ?? 0),
    }),
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrary.httpRequest({ url: ${inputs.url}, method: ${inputs.method}, headersJson: ${inputs.headers}, auth: ${inputs.auth}, body: ${inputs.body}, timeoutMs: ${inputs.timeoutMs} });`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      status: `${v}.status`,
      responseBody: `${v}.responseBody`,
      responseHeaders: `${v}.responseHeaders`,
      error: `${v}.error`,
    };
  },
  compileImports: [FUNCTION_LIBRARY_IMPORT],
});
