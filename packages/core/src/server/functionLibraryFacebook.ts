import { FacebookManager } from "../lib/facebookManager.ts";

/** Compile-time-only counterpart of nodes/facebook.ts's execute() vault lookup
 * (resolveFacebookCredential) — the compiled/deployed script has no access to the Credential Vault
 * database, only the interpreter does, so it reads the same credential's fields back from
 * environment variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming
 * credentialEnv.ts's applyCredentialEnvVars writes. Never called by the interpreter — genuinely
 * different credential-sourcing behavior, not duplicated logic.
 *
 * Kept in its own file, separate from functionLibrary.ts, purely to mirror
 * functionLibrarySftp.ts's one-node-family-per-file convention. */
function facebookCredentialFromEnv(name: string): { ok: true; appId: string; appSecret: string; redirectUri: string; authCode: string; accessToken: string } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "facebookGraphAPI") return { ok: false, error: `Credential "${name}" not found in the vault, or is not a Facebook Graph API credential` };
  return {
    ok: true,
    appId: process.env[`${prefix}_APP_ID`] || "",
    appSecret: process.env[`${prefix}_APP_SECRET`] || "",
    redirectUri: process.env[`${prefix}_REDIRECT_URI`] || "",
    authCode: process.env[`${prefix}_AUTH_CODE`] || "",
    accessToken: process.env[`${prefix}_ACCESS_TOKEN`] || "",
  };
}

function facebookManagerFromEnv(credentialName: string): { ok: true; manager: FacebookManager } | { ok: false; error: string } {
  const cred = facebookCredentialFromEnv(credentialName);
  if (!cred.ok) return cred;
  return { ok: true, manager: FacebookManager.forCredential(cred.accessToken) };
}

export async function facebookAuthorize(credentialName: string) {
  const cred = facebookCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, accessToken: "", expiresIn: 0, error: cred.error };
  return FacebookManager.exchangeAuthCode(cred.authCode, cred.appId, cred.appSecret, cred.redirectUri);
}

export async function facebookDebugToken(credentialName: string, inputToken: string) {
  const cred = facebookCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, appId: "", isValid: false, expiresAt: 0, scopes: [], error: cred.error };
  return FacebookManager.debugToken(inputToken, cred.appId, cred.appSecret);
}

export async function facebookGetPageInfo(credentialName: string, pageId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", name: "", category: "", fanCount: 0, link: "", error: cred.error };
  return cred.manager.getPageInfo(pageId);
}

export async function facebookCreatePost(credentialName: string, pageId: string, message: string, link: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createPost(pageId, message, link);
}

export async function facebookCreatePhotoPost(credentialName: string, pageId: string, url: string, caption: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createPhotoPost(pageId, url, caption);
}

export async function facebookCreateVideoPost(credentialName: string, pageId: string, videoUrl: string, description: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createVideoPost(pageId, videoUrl, description);
}

export async function facebookDeletePost(credentialName: string, postId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deletePost(postId);
}

export async function facebookGetPosts(credentialName: string, pageId: string, limit: number) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, posts: [], error: cred.error };
  return cred.manager.getPosts(pageId, limit);
}

export async function facebookGetPageInsights(credentialName: string, pageId: string, metrics: string[], period: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, json: "", error: cred.error };
  return cred.manager.getPageInsights(pageId, metrics, period);
}

export async function facebookCreateComment(credentialName: string, objectId: string, message: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createComment(objectId, message);
}

export async function facebookGetComments(credentialName: string, objectId: string, limit: number) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, comments: [], error: cred.error };
  return cred.manager.getComments(objectId, limit);
}

export async function facebookDeleteComment(credentialName: string, commentId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteComment(commentId);
}

export async function facebookLikeObject(credentialName: string, objectId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.likeObject(objectId);
}

export async function facebookUnlikeObject(credentialName: string, objectId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.unlikeObject(objectId);
}

export async function facebookGetLikesCount(credentialName: string, objectId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, count: 0, error: cred.error };
  return cred.manager.getLikesCount(objectId);
}

export async function facebookGetUserProfile(credentialName: string, userId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", name: "", email: "", error: cred.error };
  return cred.manager.getUserProfile(userId);
}

export async function facebookGetAdAccounts(credentialName: string, userId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, accounts: [], error: cred.error };
  return cred.manager.getAdAccounts(userId);
}

export async function facebookCreateCampaign(credentialName: string, adAccountId: string, name: string, objective: string, status: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createCampaign(adAccountId, name, objective, status);
}

export async function facebookGetCampaigns(credentialName: string, adAccountId: string, limit: number) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, campaigns: [], error: cred.error };
  return cred.manager.getCampaigns(adAccountId, limit);
}

export async function facebookDeleteCampaign(credentialName: string, campaignId: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteCampaign(campaignId);
}

export async function facebookGetInsights(credentialName: string, objectId: string, fields: string[]) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, json: "", error: cred.error };
  return cred.manager.getInsights(objectId, fields);
}

export async function facebookApiCall(credentialName: string, method: string, path: string, paramsJson: string) {
  const cred = facebookManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, json: "", error: cred.error };
  return cred.manager.apiCall(method, path, paramsJson);
}
