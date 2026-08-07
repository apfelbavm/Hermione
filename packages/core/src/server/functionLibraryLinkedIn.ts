import { LinkedInManager } from "../lib/linkedinManager.ts";
import type { LinkedInOAuth2CredentialData } from "@hermione/shared/types";

/** Compile-time-only counterpart of nodes/linkedin.ts's vault lookups (resolveLinkedInCredential/
 * requireAccessToken) — the compiled/deployed script has no access to the Credential Vault
 * database, only the interpreter does, so it reads the same credential's fields back from
 * environment variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming
 * credentialEnv.ts's applyCredentialEnvVars writes. Never called by the interpreter — genuinely
 * different credential-sourcing behavior, not duplicated logic (see functionLibraryFacebook.ts for
 * the same pattern). */
function linkedInCredentialFromEnv(credentialName: string): { ok: true; data: LinkedInOAuth2CredentialData } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "linkedInOAuth2") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a LinkedIn OAuth2 credential` };
  return {
    ok: true,
    data: {
      clientId: process.env[`${prefix}_CLIENT_ID`] || "",
      clientSecret: process.env[`${prefix}_CLIENT_SECRET`] || "",
      redirectUri: process.env[`${prefix}_REDIRECT_URI`] || "",
      authCode: process.env[`${prefix}_AUTH_CODE`] || "",
      accessToken: process.env[`${prefix}_ACCESS_TOKEN`] || "",
      refreshToken: process.env[`${prefix}_REFRESH_TOKEN`] || "",
    },
  };
}

function emptyToken() {
  return { success: false, accessToken: "", expiresIn: 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "" };
}

export function linkedinGenerateAuthorizationUrl(clientId: string, redirectUri: string, scopes: string[], state: string) {
  return LinkedInManager.generateAuthorizationUrl(clientId, redirectUri, scopes, state);
}

export async function linkedinAuthorize(credentialName: string) {
  const cred = linkedInCredentialFromEnv(credentialName);
  if (!cred.ok) return { ...emptyToken(), error: cred.error };
  return LinkedInManager.exchangeAuthCode(cred.data.clientId, cred.data.clientSecret, cred.data.redirectUri, cred.data.authCode);
}

export async function linkedinRefreshToken(credentialName: string) {
  const cred = linkedInCredentialFromEnv(credentialName);
  if (!cred.ok) return { ...emptyToken(), error: cred.error };
  return LinkedInManager.exchangeRefreshToken(cred.data.clientId, cred.data.clientSecret, cred.data.refreshToken);
}

export async function linkedinGetTwoLeggedAccessToken(credentialName: string) {
  const cred = linkedInCredentialFromEnv(credentialName);
  if (!cred.ok) return { ...emptyToken(), error: cred.error };
  return LinkedInManager.getTwoLeggedAccessToken(cred.data.clientId, cred.data.clientSecret);
}

export async function linkedinIntrospectAccessToken(credentialName: string, accessToken: string) {
  const cred = linkedInCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, active: false, authType: "", clientId: "", createdAt: 0, expiresAt: 0, scope: "", status: "", error: cred.error };
  return LinkedInManager.introspectAccessToken(cred.data.clientId, cred.data.clientSecret, accessToken || cred.data.accessToken);
}

function requireAccessTokenFromEnv(credentialName: string): { ok: true; accessToken: string } | { ok: false; error: string } {
  const cred = linkedInCredentialFromEnv(credentialName);
  if (!cred.ok) return cred;
  return { ok: true, accessToken: cred.data.accessToken };
}

export async function linkedinGet(credentialName: string, resourcePath: string, idJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.get(auth.accessToken, resourcePath, idJson, pathKeysJson, queryParamsJson, versionString);
}

export async function linkedinBatchGet(credentialName: string, resourcePath: string, idsJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.batchGet(auth.accessToken, resourcePath, idsJson, pathKeysJson, queryParamsJson, versionString);
}

export async function linkedinGetAll(credentialName: string, resourcePath: string, pathKeysJson: string, queryParamsJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.getAll(auth.accessToken, resourcePath, pathKeysJson, queryParamsJson, versionString);
}

export async function linkedinFinder(credentialName: string, resourcePath: string, finderName: string, pathKeysJson: string, queryParamsJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.finder(auth.accessToken, resourcePath, finderName, pathKeysJson, queryParamsJson, versionString);
}

export async function linkedinBatchFinder(credentialName: string, resourcePath: string, finderName: string, finderCriteriaName: string, finderCriteriaValuesJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.batchFinder(auth.accessToken, resourcePath, finderName, finderCriteriaName, finderCriteriaValuesJson, pathKeysJson, queryParamsJson, versionString);
}

export async function linkedinCreate(credentialName: string, resourcePath: string, entityJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, createdEntityId: "", error: auth.error };
  return LinkedInManager.create(auth.accessToken, resourcePath, entityJson, pathKeysJson, versionString);
}

export async function linkedinBatchCreate(credentialName: string, resourcePath: string, entitiesJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.batchCreate(auth.accessToken, resourcePath, entitiesJson, pathKeysJson, versionString);
}

export async function linkedinUpdate(credentialName: string, resourcePath: string, idJson: string, entityJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, error: auth.error };
  return LinkedInManager.update(auth.accessToken, resourcePath, idJson, entityJson, pathKeysJson, versionString);
}

export async function linkedinBatchUpdate(credentialName: string, resourcePath: string, idsJson: string, entitiesJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.batchUpdate(auth.accessToken, resourcePath, idsJson, entitiesJson, pathKeysJson, versionString);
}

export async function linkedinPartialUpdate(credentialName: string, resourcePath: string, idJson: string, patchSetObjectJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, error: auth.error };
  return LinkedInManager.partialUpdate(auth.accessToken, resourcePath, idJson, patchSetObjectJson, pathKeysJson, versionString);
}

export async function linkedinBatchPartialUpdate(credentialName: string, resourcePath: string, idsJson: string, patchSetObjectsJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.batchPartialUpdate(auth.accessToken, resourcePath, idsJson, patchSetObjectsJson, pathKeysJson, versionString);
}

export async function linkedinDelete(credentialName: string, resourcePath: string, idJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, error: auth.error };
  return LinkedInManager.delete(auth.accessToken, resourcePath, idJson, pathKeysJson, versionString);
}

export async function linkedinBatchDelete(credentialName: string, resourcePath: string, idsJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.batchDelete(auth.accessToken, resourcePath, idsJson, pathKeysJson, versionString);
}

export async function linkedinAction(credentialName: string, resourcePath: string, actionName: string, dataJson: string, pathKeysJson: string, versionString: string) {
  const auth = requireAccessTokenFromEnv(credentialName);
  if (!auth.ok) return { success: false, json: "", error: auth.error };
  return LinkedInManager.action(auth.accessToken, resourcePath, actionName, dataJson, pathKeysJson, versionString);
}
