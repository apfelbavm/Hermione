import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, SOAP_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { i18n } from "@i18n";

// Every operation below calls the exact same SoapManager static method (packages/core/src/lib/
// soapManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — SoapManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike most other providers there is no separate functionLibrarySoap.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
//
// SoapManager reaches the database directly (see its own header comment), which pulls in
// better-sqlite3 and Node builtins — fine for execute(), which only ever runs server-side, but this
// file is still statically imported client-side too (for the node-creation menu), so a plain
// top-level import here would drag that whole chain (plus the "soap" SDK itself) into the browser
// bundle. Loaded with a runtime `import()` instead, ignored by both bundlers, so it's never even
// resolved for the client build; only ever actually called server-side, where it resolves normally.
async function loadSoapManager(): Promise<typeof import("@hermione/core/lib/soapManager").SoapManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/soapManager");
  return mod.SoapManager;
}

const GROUP_NAME = "Request.SOAP";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.soap.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

registerNode({
  type: "soap.call",
  label: i18n.nodes.soap.call.label,
  description: i18n.nodes.soap.call.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "wsdlUrl", label: i18n.nodes.soap.call.pin_wsdl_url, type: "string", direction: "input", defaultValue: "" },
    { id: "operation", label: i18n.nodes.soap.call.pin_operation, type: "string", direction: "input", defaultValue: "" },
    { id: "args", label: i18n.nodes.soap.call.pin_args, type: "string", direction: "input", defaultValue: "{}" },
    { id: "endpointOverride", label: i18n.nodes.soap.call.pin_endpoint_override, type: "string", direction: "input", defaultValue: "" },
    { id: "headers", label: i18n.nodes.soap.call.pin_headers, type: "string", direction: "input", defaultValue: "{}" },
    { id: "timeoutMs", label: i18n.nodes.__shared.pin_timeout, type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "result", label: i18n.nodes.__shared.pin_result, type: "string", direction: "output" },
    { id: "rawRequest", label: i18n.nodes.soap.call.pin_raw_request, type: "string", direction: "output" },
    { id: "rawResponse", label: i18n.nodes.soap.call.pin_raw_response, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSoapManager()).call(String(inputs.credentialName ?? ""), String(inputs.wsdlUrl ?? ""), String(inputs.operation ?? ""), String(inputs.args ?? ""), String(inputs.endpointOverride ?? ""), String(inputs.headers ?? ""), Number(inputs.timeoutMs) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SoapManager.call(${inputs.credentialName}, ${inputs.wsdlUrl}, ${inputs.operation}, ${inputs.args}, ${inputs.endpointOverride}, ${inputs.headers}, ${inputs.timeoutMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      result: `${v}.result`,
      rawRequest: `${v}.rawRequest`,
      rawResponse: `${v}.rawResponse`,
      error: `${v}.error`,
    };
  },
  compileImports: [SOAP_MANAGER_IMPORT],
});

// Lists the operations/services/ports a WSDL exposes — useful for exploring an unfamiliar SOAP
// service before wiring up soap.call's Operation/Args pins. Fetching a WSDL's own metadata never
// needs a security handshake (that only applies to the operations described within it), so unlike
// soap.call this node takes no credential.
registerNode({
  type: "soap.describe",
  label: i18n.nodes.soap.describe.label,
  description: i18n.nodes.soap.describe.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "wsdlUrl", label: i18n.nodes.soap.describe.pin_wsdl_url, type: "string", direction: "input", defaultValue: "" },
    { id: "timeoutMs", label: i18n.nodes.__shared.pin_timeout, type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "description", label: i18n.nodes.soap.describe.pin_description, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSoapManager()).describe(String(inputs.wsdlUrl ?? ""), Number(inputs.timeoutMs) || 0);
    return { nextExec: "exec-out", outputs: { success: result.success, description: result.descriptionJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SoapManager.describe(${inputs.wsdlUrl}, ${inputs.timeoutMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      description: `${v}.descriptionJson`,
      error: `${v}.error`,
    };
  },
  compileImports: [SOAP_MANAGER_IMPORT],
});
