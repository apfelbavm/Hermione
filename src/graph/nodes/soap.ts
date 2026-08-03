import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SOAP_IMPORT } from "../engine/compileUtils";
import { enumOptionIds } from "../engine/enumRegistry";
import { SOAP_SECURITY_ENUM_TYPE, SOAP_WS_SECURITY_PASSWORD_TYPE_ENUM_TYPE } from "../enum/soap";
import { i18n } from "@i18n";

const GROUP_NAME = "Request.SOAP";
const SECURITY_OPTIONS = enumOptionIds(SOAP_SECURITY_ENUM_TYPE);
const WS_SECURITY_PASSWORD_TYPE_OPTIONS = enumOptionIds(SOAP_WS_SECURITY_PASSWORD_TYPE_ENUM_TYPE);

// Calls a SOAP web service via the official "soap" (node-soap) SDK — a real WSDL fetch/parse plus
// SOAP envelope construction, which "soap" itself only ever does under Node (it transitively pulls
// in "axios"/"sax"/etc., none of which this project wants forced into the interpreter/browser
// bundle). Same structural situation as sftp.ts's SFTP Upload node (see that file's own header
// comment): this node's own execute() below is therefore a permanent, honest stub reporting that
// only the compiled output can actually reach a SOAP service; the REAL implementation lives in
// src/server/functionLibrarySoap.ts, reached only via compileImports, never statically imported by
// any interpreter-facing code.
registerNode({
  type: "soap.call",
  label: i18n.nodes.soap.call.label,
  description: i18n.nodes.soap.call.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "wsdlUrl", label: i18n.nodes.soap.call.pin_wsdl_url, type: "string", direction: "input", defaultValue: "" },
    { id: "operation", label: i18n.nodes.soap.call.pin_operation, type: "string", direction: "input", defaultValue: "" },
    { id: "args", label: i18n.nodes.soap.call.pin_args, type: "string", direction: "input", defaultValue: "{}" },
    { id: "security", label: i18n.nodes.soap.call.pin_security, type: "enum", subType: SOAP_SECURITY_ENUM_TYPE, direction: "input", defaultValue: SECURITY_OPTIONS[0], options: SECURITY_OPTIONS },
    { id: "username", label: i18n.nodes.soap.call.pin_username, type: "string", direction: "input", defaultValue: "" },
    { id: "password", label: i18n.nodes.soap.call.pin_password, type: "string", direction: "input", defaultValue: "" },
    {
      id: "wsSecurityPasswordType",
      label: i18n.nodes.soap.call.pin_ws_security_password_type,
      type: "enum",
      subType: SOAP_WS_SECURITY_PASSWORD_TYPE_ENUM_TYPE,
      direction: "input",
      defaultValue: WS_SECURITY_PASSWORD_TYPE_OPTIONS[0],
      options: WS_SECURITY_PASSWORD_TYPE_OPTIONS,
    },
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
  execute: async () => ({
    nextExec: "exec-out",
    outputs: {
      success: false,
      result: "",
      rawRequest: "",
      rawResponse: "",
      error: 'SOAP Call only runs in the compiled output (under Node.js) — the in-browser "Run" button has no way to load the "soap" SDK\'s WSDL/XML machinery. Compile this graph and run the generated script to actually call the service.',
    },
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySoap.soapCall({ wsdlUrl: ${inputs.wsdlUrl}, operation: ${inputs.operation}, argsJson: ${inputs.args}, security: ${inputs.security}, username: ${inputs.username}, password: ${inputs.password}, wsSecurityPasswordType: ${inputs.wsSecurityPasswordType}, endpointOverride: ${inputs.endpointOverride}, headersJson: ${inputs.headers}, timeoutMs: ${inputs.timeoutMs} });`,
    ...compileFrom("exec-out"),
  ],
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
  // "soap" is a real Node dependency this project itself never needs (nothing here can run it
  // live) — it only needs to be `npm install`ed alongside the COMPILED .mjs, same convention as
  // "ssh2-sftp-client" (see sftp.ts).
  compileImports: [FUNCTION_LIBRARY_SOAP_IMPORT],
});

// Lists the operations/services/ports a WSDL exposes — useful for exploring an unfamiliar SOAP
// service before wiring up soap.call's Operation/Args pins. Same compiled-output-only situation as
// soap.call above (see that node's header comment).
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
  execute: async () => ({
    nextExec: "exec-out",
    outputs: {
      success: false,
      description: "",
      error: 'SOAP Describe only runs in the compiled output (under Node.js) — the in-browser "Run" button has no way to load the "soap" SDK\'s WSDL/XML machinery. Compile this graph and run the generated script to actually inspect the service.',
    },
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySoap.soapDescribe({ wsdlUrl: ${inputs.wsdlUrl}, timeoutMs: ${inputs.timeoutMs} });`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      description: `${v}.descriptionJson`,
      error: `${v}.error`,
    };
  },
  compileImports: [FUNCTION_LIBRARY_SOAP_IMPORT],
});
