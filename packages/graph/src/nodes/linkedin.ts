import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { TOKEN_STRUCT_TYPE, INTROSPECT_STRUCT_TYPE } from "@hermione/graph/structs/linkedin";
import { withRetry } from "@hermione/core/lib/retry";
import { retryCountPin, retryDelayMsPin, attemptsPin } from "@hermione/graph/nodes/shared/retryPins";
import { i18n } from "@i18n";

// Every operation below calls the exact same LinkedInManager static method (packages/core/src/lib/
// linkedinManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — LinkedInManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike before there is no separate functionLibraryLinkedIn.ts env-var-reading
// layer and no ctx.getCredential vault lookup here: both paths are already identical (mirrors
// twilio.ts).
//
// LinkedInManager now reaches the database directly (see its own header comment), which pulls in
// better-sqlite3 and Node builtins — fine for execute(), which only ever runs server-side, but this
// file is still statically imported client-side too (for the node-creation menu), so a plain
// top-level import here would drag that whole chain into the browser bundle. Loaded with a runtime
// `import()` instead, ignored by both bundlers, so it's never even resolved for the client build;
// only ever actually called server-side, where it resolves normally.
async function loadLinkedInManager(): Promise<typeof import("@hermione/core/lib/linkedinManager").LinkedInManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/linkedinManager");
  return mod.LinkedInManager;
}

// LinkedIn's official SDK (linkedin-api-client) exposes only generic Rest.li verbs (get/finder/
// create/update/delete/...) rather than per-resource helper methods, so this file has one node per
// SDK method instead of one node per business object — that's the complete, "all possible" surface
// the SDK itself provides. Object/array-shaped pins (pathKeys, queryParams, entities, patch
// objects) use JSON-string pins rather than rigid structs, mirroring salesforce.ts/workday.ts.

const GROUP_NAME = "Request.LinkedIn";

function emptyToken() {
  return { success: false, accessToken: "", expiresIn: 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "" };
}

function toTokenStruct(result: { success: boolean; accessToken: string; expiresIn: number; refreshToken: string; refreshTokenExpiresIn: number; scope: string }) {
  return { accessToken: result.accessToken, expiresIn: result.expiresIn, refreshToken: result.refreshToken, refreshTokenExpiresIn: result.refreshTokenExpiresIn, scope: result.scope };
}

function emptyIntrospect() {
  return { success: false, active: false, authType: "", clientId: "", createdAt: 0, expiresAt: 0, scope: "", status: "" };
}

function toIntrospectStruct(result: { success: boolean; active: boolean; authType: string; clientId: string; createdAt: number; expiresAt: number; scope: string; status: string }) {
  return { active: result.active, authType: result.authType, clientId: result.clientId, createdAt: result.createdAt, expiresAt: result.expiresAt, scope: result.scope, status: result.status };
}

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.linkedin.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
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
  evaluate: async ({ inputs }) => {
    const scopes = Array.isArray(inputs.scopes) ? (inputs.scopes as unknown[]).map(String) : [];
    const result = (await loadLinkedInManager()).generateAuthorizationUrl(String(inputs.clientId ?? ""), String(inputs.redirectUri ?? ""), scopes, String(inputs.state ?? ""));
    return { url: result.url };
  },
  compileEvaluate: ({ inputs }) => ({
    url: `LinkedInManager.generateAuthorizationUrl(${inputs.clientId}, ${inputs.redirectUri}, ${inputs.scopes}, ${inputs.state}).url`,
  }),
  compileImports: [LINKEDIN_MANAGER_IMPORT],
});

registerNode({
  type: "linkedin.authorize",
  label: i18n.nodes.linkedin.authorize.label,
  description: i18n.nodes.linkedin.authorize.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), { id: "tokens", label: i18n.nodes.linkedin.token.label, type: "struct", subType: TOKEN_STRUCT_TYPE, direction: "output" }, attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadLinkedInManager()).exchangeAuthCode(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, tokens: result.success ? toTokenStruct(result) : emptyToken(), attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.exchangeAuthCode(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: tokenStructExpr(v), attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "linkedin.refreshToken",
  label: i18n.nodes.linkedin.refreshToken.label,
  description: i18n.nodes.linkedin.refreshToken.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), { id: "tokens", label: i18n.nodes.linkedin.token.label, type: "struct", subType: TOKEN_STRUCT_TYPE, direction: "output" }, attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadLinkedInManager()).exchangeRefreshToken(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, tokens: result.success ? toTokenStruct(result) : emptyToken(), attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.exchangeRefreshToken(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: tokenStructExpr(v), attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "linkedin.getTwoLeggedAccessToken",
  label: i18n.nodes.linkedin.getTwoLeggedAccessToken.label,
  description: i18n.nodes.linkedin.getTwoLeggedAccessToken.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), { id: "tokens", label: i18n.nodes.linkedin.token.label, type: "struct", subType: TOKEN_STRUCT_TYPE, direction: "output" }, attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadLinkedInManager()).getTwoLeggedAccessToken(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, tokens: result.success ? toTokenStruct(result) : emptyToken(), attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.getTwoLeggedAccessToken(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: tokenStructExpr(v), attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "result", label: i18n.nodes.linkedin.introspectAccessToken.label, type: "struct", subType: INTROSPECT_STRUCT_TYPE, direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadLinkedInManager()).introspectAccessToken(String(inputs.credentialName ?? ""), String(inputs.accessToken ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, result: result.success ? toIntrospectStruct(result) : emptyIntrospect(), attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.introspectAccessToken(${inputs.credentialName}, ${inputs.accessToken}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: introspectStructExpr(v), attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

function tokenStructExpr(v: string): string {
  return `{ accessToken: ${v}.accessToken, expiresIn: ${v}.expiresIn, refreshToken: ${v}.refreshToken, refreshTokenExpiresIn: ${v}.refreshTokenExpiresIn, scope: ${v}.scope }`;
}

function introspectStructExpr(v: string): string {
  return `{ active: ${v}.active, authType: ${v}.authType, clientId: ${v}.clientId, createdAt: ${v}.createdAt, expiresAt: ${v}.expiresAt, scope: ${v}.scope, status: ${v}.status }`;
}

registerNode({
  type: "linkedin.get",
  label: i18n.nodes.linkedin.get.label,
  description: i18n.nodes.linkedin.get.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idJsonPin(), pathKeysJsonPin(), queryParamsJsonPin(), versionStringPin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), resultJsonPin(), attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).get(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.idJson ?? ""), String(inputs.pathKeysJson ?? "{}"), String(inputs.queryParamsJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.get(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idJson}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "linkedin.batchGet",
  label: i18n.nodes.linkedin.batchGet.label,
  description: i18n.nodes.linkedin.batchGet.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idsJsonPin(), pathKeysJsonPin(), queryParamsJsonPin(), versionStringPin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), resultJsonPin(), attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).batchGet(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.idsJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.queryParamsJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.batchGet(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idsJson}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "linkedin.getAll",
  label: i18n.nodes.linkedin.getAll.label,
  description: i18n.nodes.linkedin.getAll.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), pathKeysJsonPin(), queryParamsJsonPin(), versionStringPin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), resultJsonPin(), attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).getAll(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.pathKeysJson ?? "{}"), String(inputs.queryParamsJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.getAll(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).finder(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.finderName ?? ""), String(inputs.pathKeysJson ?? "{}"), String(inputs.queryParamsJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.finder(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.finderName}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () =>
        (await loadLinkedInManager()).batchFinder(
          String(inputs.credentialName ?? ""),
          String(inputs.resourcePath ?? ""),
          String(inputs.finderName ?? ""),
          String(inputs.finderCriteriaName ?? ""),
          String(inputs.finderCriteriaValuesJson ?? "[]"),
          String(inputs.pathKeysJson ?? "{}"),
          String(inputs.queryParamsJson ?? "{}"),
          String(inputs.versionString ?? ""),
        ),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.batchFinder(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.finderName}, ${inputs.finderCriteriaName}, ${inputs.finderCriteriaValuesJson}, ${inputs.pathKeysJson}, ${inputs.queryParamsJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "createdEntityId", label: i18n.nodes.linkedin.create.pin_created_entity_id, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).create(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.entityJson ?? "{}"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, createdEntityId: result.createdEntityId, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.create(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.entityJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdEntityId: `${v}.createdEntityId`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "linkedin.batchCreate",
  label: i18n.nodes.linkedin.batchCreate.label,
  description: i18n.nodes.linkedin.batchCreate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    { id: "entitiesJson", label: i18n.nodes.linkedin.batchCreate.pin_entities_json, type: "string", direction: "input", defaultValue: "[]" },
    pathKeysJsonPin(),
    versionStringPin(),
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).batchCreate(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.entitiesJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.batchCreate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.entitiesJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "linkedin.update",
  label: i18n.nodes.linkedin.update.label,
  description: i18n.nodes.linkedin.update.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    resourcePathPin(),
    idJsonPin(),
    { id: "entityJson", label: i18n.nodes.linkedin.__shared.pin_entity_json, type: "string", direction: "input", defaultValue: "{}" },
    pathKeysJsonPin(),
    versionStringPin(),
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).update(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.idJson ?? ""), String(inputs.entityJson ?? "{}"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.update(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idJson}, ${inputs.entityJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => ({ success: `${compileResultVar(node.id)}.success`, attempts: `${compileResultVar(node.id)}.attempts`, error: `${compileResultVar(node.id)}.error` }),
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).batchUpdate(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.idsJson ?? "[]"), String(inputs.entitiesJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.batchUpdate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idsJson}, ${inputs.entitiesJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).partialUpdate(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.idJson ?? ""), String(inputs.patchSetObjectJson ?? "{}"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.partialUpdate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idJson}, ${inputs.patchSetObjectJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => ({ success: `${compileResultVar(node.id)}.success`, attempts: `${compileResultVar(node.id)}.attempts`, error: `${compileResultVar(node.id)}.error` }),
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    resultJsonPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).batchPartialUpdate(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.idsJson ?? "[]"), String(inputs.patchSetObjectsJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.batchPartialUpdate(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idsJson}, ${inputs.patchSetObjectsJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "linkedin.delete",
  label: i18n.nodes.linkedin.delete.label,
  description: i18n.nodes.linkedin.delete.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idJsonPin(), pathKeysJsonPin(), versionStringPin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).delete(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.idJson ?? ""), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.delete(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => ({ success: `${compileResultVar(node.id)}.success`, attempts: `${compileResultVar(node.id)}.attempts`, error: `${compileResultVar(node.id)}.error` }),
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "linkedin.batchDelete",
  label: i18n.nodes.linkedin.batchDelete.label,
  description: i18n.nodes.linkedin.batchDelete.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), resourcePathPin(), idsJsonPin(), pathKeysJsonPin(), versionStringPin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), resultJsonPin(), attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).batchDelete(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.idsJson ?? "[]"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, resultJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.batchDelete(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.idsJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "valueJson", label: i18n.nodes.linkedin.action.pin_value_json, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadLinkedInManager()).action(String(inputs.credentialName ?? ""), String(inputs.resourcePath ?? ""), String(inputs.actionName ?? ""), String(inputs.dataJson ?? "{}"), String(inputs.pathKeysJson ?? "{}"), String(inputs.versionString ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, valueJson: result.json, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => LinkedInManager.action(${inputs.credentialName}, ${inputs.resourcePath}, ${inputs.actionName}, ${inputs.dataJson}, ${inputs.pathKeysJson}, ${inputs.versionString}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, valueJson: `${v}.json`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [LINKEDIN_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});
