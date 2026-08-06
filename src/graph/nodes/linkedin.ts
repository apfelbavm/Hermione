import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_LINKEDIN_IMPORT } from "../engine/compileUtils";
import { LinkedInManager } from "../../lib/linkedinManager";
import type { LinkedInOAuth2CredentialData } from "../../credentials/types";
import { TOKEN_STRUCT_TYPE, INTROSPECT_STRUCT_TYPE } from "../structs/linkedin";
import { i18n } from "@i18n";

// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibraryLinkedIn.linkedin*` wrapper (see server/functionLibraryLinkedIn.ts), which reads
// the credential back from environment variables instead of the vault — same split as
// facebook.ts's execute()/compileExecute().
//
// LinkedIn's official SDK (linkedin-api-client) exposes only generic Rest.li verbs (get/finder/
// create/update/delete/...) rather than per-resource helper methods, so this file has one node per
// SDK method instead of one node per business object — that's the complete, "all possible" surface
// the SDK itself provides. Object/array-shaped pins (pathKeys, queryParams, entities, patch
// objects) use JSON-string pins rather than rigid structs, mirroring salesforce.ts/workday.ts.

const GROUP_NAME = "Request.LinkedIn";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.linkedin.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function resolveLinkedInCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: LinkedInOAuth2CredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type !== "linkedInOAuth2") return { ok: false, error: `Credential "${credentialName}" is not a LinkedIn OAuth2 credential` };
  return { ok: true, data: credential.data as LinkedInOAuth2CredentialData };
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

function resourcePathPin() {
  return { id: "resourcePath", label: i18n.nodes.linkedin.__shared.pin_resource_path, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function pathKeysJsonPin() {
  return { id: "pathKeysJson", label: i18n.nodes.linkedin.__shared.pin_path_keys_json, type: "string" as const, direction: "input" as const, defaultValue: "{}" };
}

function queryParamsJsonPin() {
  return { id: "queryParamsJson", label: i18n.nodes.linkedin.__shared.pin_query_params_json, type: "string" as const, direction: "input" as const, defaultValue: "{}" };
}

function versionStringPin() {
  return { id: "versionString", label: i18n.nodes.linkedin.__shared.pin_version_string, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function idJsonPin() {
  return { id: "idJson", label: i18n.nodes.linkedin.__shared.pin_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function idsJsonPin() {
  return { id: "idsJson", label: i18n.nodes.linkedin.__shared.pin_ids_json, type: "string" as const, direction: "input" as const, defaultValue: "[]" };
}

function resultJsonPin() {
  return { id: "resultJson", label: i18n.nodes.linkedin.__shared.pin_result_json, type: "string" as const, direction: "output" as const };
}

registerNode({
  type: "linkedin.generateAuthorizationUrl",
  label: i18n.nodes.linkedin.generateAuthorizationUrl.label,
  description: i18n.nodes.linkedin.generateAuthorizationUrl.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "clientId", label: i18n.nodes.linkedin.__shared.pin_client_id, type: "string", direction: "input", defaultValue: "" },
    { id: "redirectUri", label: i18n.nodes.linkedin.__shared.pin_redirect_uri, type: "string", direction: "input", defaultValue: "" },
    { id: "scopes", label: i18n.nodes.linkedin.generateAuthorizationUrl.pin_scopes, type: "string", direction: "input", container: "array", defaultValue: [] },
    { id: "state", label: i18n.nodes.linkedin.generateAuthorizationUrl.pin_state, type: "string", direction: "input", defaultValue: "" },
    { id: "url", label: i18n.nodes.linkedin.generateAuthorizationUrl.pin_url, type: "string", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    const scopes = Array.isArray(inputs.scopes) ? (inputs.scopes as unknown[]).map(String) : [];
    const result = LinkedInManager.generateAuthorizationUrl(String(inputs.clientId ?? ""), String(inputs.redirectUri ?? ""), scopes, String(inputs.state ?? ""));
    return { url: result.url };
  },
  compileEvaluate: ({ inputs }) => ({
    url: `functionLibraryLinkedIn.linkedinGenerateAuthorizationUrl(${inputs.clientId}, ${inputs.redirectUri}, ${inputs.scopes}, ${inputs.state}).url`,
  }),
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.authorize",
  label: i18n.nodes.linkedin.authorize.label,
  description: i18n.nodes.linkedin.authorize.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "tokens", label: i18n.nodes.linkedin.token.label, type: "struct", subType: TOKEN_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveLinkedInCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, tokens: emptyToken(), error: resolved.error } };
    const result = await LinkedInManager.exchangeAuthCode(resolved.data.clientId, resolved.data.clientSecret, resolved.data.redirectUri, resolved.data.authCode);
    return { nextExec: "exec-out", outputs: { success: result.success, tokens: toTokenStruct(result), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinAuthorize(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: tokenStructExpr(v), error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.refreshToken",
  label: i18n.nodes.linkedin.refreshToken.label,
  description: i18n.nodes.linkedin.refreshToken.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "tokens", label: i18n.nodes.linkedin.token.label, type: "struct", subType: TOKEN_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveLinkedInCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, tokens: emptyToken(), error: resolved.error } };
    const result = await LinkedInManager.exchangeRefreshToken(resolved.data.clientId, resolved.data.clientSecret, resolved.data.refreshToken);
    return { nextExec: "exec-out", outputs: { success: result.success, tokens: toTokenStruct(result), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinRefreshToken(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: tokenStructExpr(v), error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.getTwoLeggedAccessToken",
  label: i18n.nodes.linkedin.getTwoLeggedAccessToken.label,
  description: i18n.nodes.linkedin.getTwoLeggedAccessToken.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "tokens", label: i18n.nodes.linkedin.token.label, type: "struct", subType: TOKEN_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveLinkedInCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, tokens: emptyToken(), error: resolved.error } };
    const result = await LinkedInManager.getTwoLeggedAccessToken(resolved.data.clientId, resolved.data.clientSecret);
    return { nextExec: "exec-out", outputs: { success: result.success, tokens: toTokenStruct(result), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinGetTwoLeggedAccessToken(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: tokenStructExpr(v), error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.introspectAccessToken",
  label: i18n.nodes.linkedin.introspectAccessToken.label,
  description: i18n.nodes.linkedin.introspectAccessToken.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "accessToken", label: i18n.nodes.linkedin.__shared.pin_access_token, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "result", label: i18n.nodes.linkedin.introspectAccessToken.label, type: "struct", subType: INTROSPECT_STRUCT_TYPE, direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveLinkedInCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, result: emptyIntrospect(), error: resolved.error } };
    const tokenToInspect = String(inputs.accessToken ?? "") || resolved.data.accessToken;
    const result = await LinkedInManager.introspectAccessToken(resolved.data.clientId, resolved.data.clientSecret, tokenToInspect);
    return { nextExec: "exec-out", outputs: { success: result.success, result: toIntrospectStruct(result), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinIntrospectAccessToken(${inputs.credentialName}, ${inputs.accessToken});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: introspectStructExpr(v), error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

function emptyToken() {
  return { accessToken: "", expiresIn: 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "" };
}

function toTokenStruct(r: { accessToken: string; expiresIn: number; refreshToken: string; refreshTokenExpiresIn: number; scope: string }) {
  return { accessToken: r.accessToken, expiresIn: r.expiresIn, refreshToken: r.refreshToken, refreshTokenExpiresIn: r.refreshTokenExpiresIn, scope: r.scope };
}

function tokenStructExpr(v: string): string {
  return `{ accessToken: ${v}.accessToken, expiresIn: ${v}.expiresIn, refreshToken: ${v}.refreshToken, refreshTokenExpiresIn: ${v}.refreshTokenExpiresIn, scope: ${v}.scope }`;
}

function emptyIntrospect() {
  return { active: false, authType: "", clientId: "", createdAt: 0, expiresAt: 0, scope: "", status: "" };
}

function toIntrospectStruct(r: { active: boolean; authType: string; clientId: string; createdAt: number; expiresAt: number; scope: string; status: string }) {
  return { active: r.active, authType: r.authType, clientId: r.clientId, createdAt: r.createdAt, expiresAt: r.expiresAt, scope: r.scope, status: r.status };
}

function introspectStructExpr(v: string): string {
  return `{ active: ${v}.active, authType: ${v}.authType, clientId: ${v}.clientId, createdAt: ${v}.createdAt, expiresAt: ${v}.expiresAt, scope: ${v}.scope, status: ${v}.status }`;
}

/** Resolves the accessToken every Rest.li call node needs — always the vault credential's stored
 * accessToken, since (unlike Facebook) LinkedIn's Rest.li calls don't take clientId/secret. */
function requireAccessToken(ctx: ExecutionContext, credentialName: string): { ok: true; accessToken: string } | { ok: false; error: string } {
  const resolved = resolveLinkedInCredential(ctx, credentialName);
  if (!resolved.ok) return resolved;
  return { ok: true, accessToken: resolved.data.accessToken };
}

registerNode({
  type: "linkedin.get",
  label: i18n.nodes.linkedin.get.label,
  description: i18n.nodes.linkedin.get.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idJsonPin(), pathKeysJsonPin(), queryParamsJsonPin(), versionStringPin(), execOutPin(), successPin(), resultJsonPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.get(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.idJson ?? ""), String(inputs.pathKeysJson ?? "{}"), String(inputs.queryParamsJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinGet(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idJson}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.batchGet",
  label: i18n.nodes.linkedin.batchGet.label,
  description: i18n.nodes.linkedin.batchGet.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idsJsonPin(), pathKeysJsonPin(), queryParamsJsonPin(), versionStringPin(), execOutPin(), successPin(), resultJsonPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.batchGet(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.idsJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.queryParamsJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinBatchGet(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idsJson}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.getAll",
  label: i18n.nodes.linkedin.getAll.label,
  description: i18n.nodes.linkedin.getAll.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), pathKeysJsonPin(), queryParamsJsonPin(), versionStringPin(), execOutPin(), successPin(), resultJsonPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.getAll(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.pathKeysJson ?? "{}"), String(inputs.queryParamsJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinGetAll(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.finder",
  label: i18n.nodes.linkedin.finder.label,
  description: i18n.nodes.linkedin.finder.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    { id: "finderName", label: i18n.nodes.linkedin.__shared.pin_finder_name, type: "string", direction: "input", defaultValue: "" },
    pathKeysJsonPin(),
    queryParamsJsonPin(),
    versionStringPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.finder(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.finderName ?? ""), String(inputs.pathKeysJson ?? "{}"), String(inputs.queryParamsJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinFinder(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.finderName}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.batchFinder",
  label: i18n.nodes.linkedin.batchFinder.label,
  description: i18n.nodes.linkedin.batchFinder.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    { id: "finderName", label: i18n.nodes.linkedin.__shared.pin_finder_name, type: "string", direction: "input", defaultValue: "" },
    { id: "finderCriteriaName", label: i18n.nodes.linkedin.batchFinder.pin_finder_criteria_name, type: "string", direction: "input", defaultValue: "" },
    { id: "finderCriteriaValuesJson", label: i18n.nodes.linkedin.batchFinder.pin_finder_criteria_values_json, type: "string", direction: "input", defaultValue: "[]" },
    pathKeysJsonPin(),
    queryParamsJsonPin(),
    versionStringPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.batchFinder(
      auth.accessToken,
      String(inputs.resourcePath ?? ""),
      String(inputs.finderName ?? ""),
      String(inputs.finderCriteriaName ?? ""),
      String(inputs.finderCriteriaValuesJson ?? "[]"),
      String(inputs.pathKeysJson ?? "{}"),
      String(inputs.queryParamsJson ?? "{}"),
      String(inputs.versionString ?? ""),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinBatchFinder(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.finderName}, ${inputs.finderCriteriaName}, ${inputs.finderCriteriaValuesJson}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.create",
  label: i18n.nodes.linkedin.create.label,
  description: i18n.nodes.linkedin.create.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    { id: "entityJson", label: i18n.nodes.linkedin.__shared.pin_entity_json, type: "string", direction: "input", defaultValue: "{}" },
    pathKeysJsonPin(),
    versionStringPin(),
    execOutPin(),
    successPin(),
    { id: "createdEntityId", label: i18n.nodes.linkedin.create.pin_created_entity_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, createdEntityId: "", error: auth.error } };
    const result = await LinkedInManager.create(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.entityJson ?? "{}"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, createdEntityId: result.createdEntityId, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinCreate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.entityJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdEntityId: `${v}.createdEntityId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.batchCreate",
  label: i18n.nodes.linkedin.batchCreate.label,
  description: i18n.nodes.linkedin.batchCreate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), { id: "entitiesJson", label: i18n.nodes.linkedin.batchCreate.pin_entities_json, type: "string", direction: "input", defaultValue: "[]" }, pathKeysJsonPin(), versionStringPin(), execOutPin(), successPin(), resultJsonPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.batchCreate(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.entitiesJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinBatchCreate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.entitiesJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.update",
  label: i18n.nodes.linkedin.update.label,
  description: i18n.nodes.linkedin.update.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idJsonPin(), { id: "entityJson", label: i18n.nodes.linkedin.__shared.pin_entity_json, type: "string", direction: "input", defaultValue: "{}" }, pathKeysJsonPin(), versionStringPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, error: auth.error } };
    const result = await LinkedInManager.update(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.idJson ?? ""), String(inputs.entityJson ?? "{}"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinUpdate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idJson}, ${inputs.entityJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => ({ success: `${compileResultVar(node.id)}.success`, error: `${compileResultVar(node.id)}.error` }),
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.batchUpdate",
  label: i18n.nodes.linkedin.batchUpdate.label,
  description: i18n.nodes.linkedin.batchUpdate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    idsJsonPin(),
    { id: "entitiesJson", label: i18n.nodes.linkedin.batchCreate.pin_entities_json, type: "string", direction: "input", defaultValue: "[]" },
    pathKeysJsonPin(),
    versionStringPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.batchUpdate(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.idsJson ?? "[]"), String(inputs.entitiesJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinBatchUpdate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idsJson}, ${inputs.entitiesJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.partialUpdate",
  label: i18n.nodes.linkedin.partialUpdate.label,
  description: i18n.nodes.linkedin.partialUpdate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    idJsonPin(),
    { id: "patchSetObjectJson", label: i18n.nodes.linkedin.partialUpdate.pin_patch_set_object_json, type: "string", direction: "input", defaultValue: "{}" },
    pathKeysJsonPin(),
    versionStringPin(),
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, error: auth.error } };
    const result = await LinkedInManager.partialUpdate(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.idJson ?? ""), String(inputs.patchSetObjectJson ?? "{}"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinPartialUpdate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idJson}, ${inputs.patchSetObjectJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => ({ success: `${compileResultVar(node.id)}.success`, error: `${compileResultVar(node.id)}.error` }),
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.batchPartialUpdate",
  label: i18n.nodes.linkedin.batchPartialUpdate.label,
  description: i18n.nodes.linkedin.batchPartialUpdate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    idsJsonPin(),
    { id: "patchSetObjectsJson", label: i18n.nodes.linkedin.batchPartialUpdate.pin_patch_set_objects_json, type: "string", direction: "input", defaultValue: "[]" },
    pathKeysJsonPin(),
    versionStringPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.batchPartialUpdate(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.idsJson ?? "[]"), String(inputs.patchSetObjectsJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinBatchPartialUpdate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idsJson}, ${inputs.patchSetObjectsJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.delete",
  label: i18n.nodes.linkedin.delete.label,
  description: i18n.nodes.linkedin.delete.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idJsonPin(), pathKeysJsonPin(), versionStringPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, error: auth.error } };
    const result = await LinkedInManager.delete(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.idJson ?? ""), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinDelete(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => ({ success: `${compileResultVar(node.id)}.success`, error: `${compileResultVar(node.id)}.error` }),
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.batchDelete",
  label: i18n.nodes.linkedin.batchDelete.label,
  description: i18n.nodes.linkedin.batchDelete.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idsJsonPin(), pathKeysJsonPin(), versionStringPin(), execOutPin(), successPin(), resultJsonPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, resultJson: "", error: auth.error } };
    const result = await LinkedInManager.batchDelete(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.idsJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinBatchDelete(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idsJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});

registerNode({
  type: "linkedin.action",
  label: i18n.nodes.linkedin.action.label,
  description: i18n.nodes.linkedin.action.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    { id: "actionName", label: i18n.nodes.linkedin.action.pin_action_name, type: "string", direction: "input", defaultValue: "" },
    { id: "dataJson", label: i18n.nodes.linkedin.action.pin_data_json, type: "string", direction: "input", defaultValue: "{}" },
    pathKeysJsonPin(),
    versionStringPin(),
    execOutPin(),
    successPin(),
    { id: "valueJson", label: i18n.nodes.linkedin.action.pin_value_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const auth = requireAccessToken(ctx, String(inputs.credentialName ?? ""));
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, valueJson: "", error: auth.error } };
    const result = await LinkedInManager.action(auth.accessToken, String(inputs.resourcePath ?? ""), String(inputs.actionName ?? ""), String(inputs.dataJson ?? "{}"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, valueJson: result.json, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryLinkedIn.linkedinAction(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.actionName}, ${inputs.dataJson}, ${inputs.pathKeysJson}, ${inputs.versionString});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, valueJson: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_LINKEDIN_IMPORT],
});
