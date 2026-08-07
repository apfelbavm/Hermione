import { NodeColorCategory } from "@hermione/graph/engine/types";
import type { ExecutionContext } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT } from "@hermione/graph/engine/compileUtils";
import { SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE } from "@hermione/graph/enum/smartRecruiters";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { SmartRecruitersManager, type SmartRecruitersAuth } from "@hermione/core/lib/smartRecruitersManager";
import type { SmartRecruitersApiKeyCredentialData, SmartRecruitersOAuth2ClientCredentialsData } from "@hermione/shared/types";
import { i18n } from "@i18n";

// SmartRecruiters exposes ~150 REST endpoints across Jobs, Candidates, Job Applications, Users,
// Interviews, Offers, Configuration, Reporting, Webhooks and more — see
// /memories/repo/smartrecruiters-plan.md for the phased build-out of dedicated per-resource nodes.
// This file starts with only the generic `smartRecruiters.apiCall` escape hatch (usable against any
// documented endpoint right away) plus the shared credential-resolution/pin helpers every later
// phase's dedicated nodes will reuse. Request/response bodies use JSON-string pins (mirrors
// salesforce.ts/workday.ts) since most SmartRecruiters resources are large, deeply-nested,
// per-company-configurable objects unsuited to rigid struct types.
//
// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibrarySmartRecruiters.smartRecruiters*` wrapper (see
// server/functionLibrarySmartRecruiters.ts), which reads the credential back from environment
// variables via `smartRecruitersCredentialFromEnv` instead of the vault — same split as
// github.ts's/jira.ts's execute()/compileExecute().

const GROUP_NAME = "Request.SmartRecruiters";

/** Shared by every SmartRecruiters node — looks up a named Credential Vault entry and turns either
 * its smartRecruitersApiKey or smartRecruitersOAuth2ClientCredentials fields into the
 * SmartRecruitersAuth shape SmartRecruitersManager.forAuth expects. */
function resolveSmartRecruitersCredential(ctx: ExecutionContext, credentialName: string): { ok: true; auth: SmartRecruitersAuth } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type === "smartRecruitersApiKey") {
    const data = credential.data as SmartRecruitersApiKeyCredentialData;
    return { ok: true, auth: { kind: "apiKey", apiKey: data.apiKey } };
  }
  if (credential.type === "smartRecruitersOAuth2ClientCredentials") {
    const data = credential.data as SmartRecruitersOAuth2ClientCredentialsData;
    return { ok: true, auth: { kind: "oauth2", clientId: data.clientId, clientSecret: data.clientSecret, tokenUrl: data.tokenUrl } };
  }
  return { ok: false, error: `Credential "${credentialName}" is not a SmartRecruiters API Key or OAuth2 Client Credentials credential` };
}

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.smartRecruiters.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function execInPin() {
  return { id: "exec-in", label: "", type: "exec" as const, direction: "input" as const };
}

function execOutPin() {
  return { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec" as const, direction: "output" as const };
}

function successPin() {
  return { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean" as const, direction: "output" as const };
}

function errorPin() {
  return { id: "error", label: i18n.nodes.__shared.pin_error, type: "string" as const, direction: "output" as const };
}

function parseJsonRecord(json: string): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonBody(json: string): unknown {
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

registerNode({
  type: "smartRecruiters.apiCall",
  label: i18n.nodes.smartRecruiters.apiCall.label,
  description: i18n.nodes.smartRecruiters.apiCall.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "method", label: i18n.nodes.smartRecruiters.__shared.pin_method, type: "enum", subType: SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE, direction: "input", defaultValue: "GET", options: enumOptionIds(SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE) },
    { id: "path", label: i18n.nodes.smartRecruiters.__shared.pin_path, type: "string", direction: "input", defaultValue: "/jobs" },
    { id: "queryJson", label: i18n.nodes.smartRecruiters.__shared.pin_query_json, type: "string", direction: "input", defaultValue: "{}" },
    { id: "bodyJson", label: i18n.nodes.smartRecruiters.__shared.pin_body_json, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "status", label: i18n.nodes.smartRecruiters.apiCall.pin_status, type: "number", direction: "output" },
    { id: "dataJson", label: i18n.nodes.smartRecruiters.apiCall.pin_data_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, status: 0, dataJson: "", error: resolved.error },
      };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.apiCall(String(inputs.method ?? "GET"), String(inputs.path ?? ""), parseJsonRecord(String(inputs.queryJson ?? "")), parseJsonBody(String(inputs.bodyJson ?? "")));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, status: result.status, dataJson: result.dataJson, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersApiCall(${inputs.credentialName}, ${inputs.method}, ${inputs.path}, ${inputs.queryJson}, ${inputs.bodyJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, dataJson: `${v}.dataJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});
