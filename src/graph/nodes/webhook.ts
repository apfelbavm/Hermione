import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_IMPORT } from "../engine/compileUtils";
import { sendWebhook } from "../../server/functionLibrary";
import { i18n } from "@i18n";

registerNode({
  type: "webhook.send",
  label: i18n.nodes.webhook.send.label,
  description: i18n.nodes.webhook.send.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "url", label: i18n.nodes.webhook.send.pin_url, type: "string", direction: "input", defaultValue: "" },
    { id: "payload", label: i18n.nodes.webhook.send.pin_payload, type: "string", direction: "input", defaultValue: "{}" },
    { id: "headers", label: i18n.nodes.webhook.send.pin_headers, type: "string", direction: "input", defaultValue: "{}" },
    { id: "secret", label: i18n.nodes.webhook.send.pin_secret, type: "string", direction: "input", defaultValue: "" },
    { id: "signatureHeader", label: i18n.nodes.webhook.send.pin_signature_header, type: "string", direction: "input", defaultValue: "X-Hermione-Signature" },
    { id: "retryCount", label: i18n.nodes.webhook.send.pin_retry_count, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "retryDelayMs", label: i18n.nodes.webhook.send.pin_retry_delay_ms, type: "number", direction: "input", defaultValue: 1000, integer: true },
    { id: "timeoutMs", label: i18n.nodes.__shared.pin_timeout, type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "status", label: i18n.nodes.__shared.pin_status, type: "number", direction: "output" },
    { id: "responseBody", label: i18n.nodes.webhook.send.pin_response_body, type: "string", direction: "output" },
    { id: "attempts", label: i18n.nodes.webhook.send.pin_attempts, type: "number", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,

  execute: async ({ inputs }) => ({
    nextExec: "exec-out",
    outputs: await sendWebhook({
      url: String(inputs.url ?? ""),
      payloadJson: String(inputs.payload ?? ""),
      headersJson: String(inputs.headers ?? ""),
      secret: String(inputs.secret ?? ""),
      signatureHeader: String(inputs.signatureHeader ?? ""),
      retryCount: Number(inputs.retryCount ?? 0),
      retryDelayMsBase: Number(inputs.retryDelayMs ?? 0),
      timeoutMs: Number(inputs.timeoutMs ?? 0),
    }),
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrary.sendWebhook({ url: ${inputs.url}, payloadJson: ${inputs.payload}, headersJson: ${inputs.headers}, secret: ${inputs.secret}, signatureHeader: ${inputs.signatureHeader}, retryCount: ${inputs.retryCount}, retryDelayMsBase: ${inputs.retryDelayMs}, timeoutMs: ${inputs.timeoutMs} });`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      status: `${v}.status`,
      responseBody: `${v}.responseBody`,
      attempts: `${v}.attempts`,
      error: `${v}.error`,
    };
  },
  compileImports: [FUNCTION_LIBRARY_IMPORT],
});
