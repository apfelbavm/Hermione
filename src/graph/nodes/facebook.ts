import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_FACEBOOK_IMPORT } from "../engine/compileUtils";
import { FacebookManager } from "../../lib/facebookManager";
import type { FacebookCredentialData } from "../../credentials/types";
import { AUTH_TOKENS_STRUCT_TYPE, DEBUG_TOKEN_STRUCT_TYPE, PAGE_STRUCT_TYPE, POST_STRUCT_TYPE, COMMENT_STRUCT_TYPE, USER_STRUCT_TYPE, AD_ACCOUNT_STRUCT_TYPE, CAMPAIGN_STRUCT_TYPE } from "../structs/facebook";
import { FACEBOOK_CAMPAIGN_OBJECTIVE_ENUM_TYPE, FACEBOOK_CAMPAIGN_STATUS_ENUM_TYPE, FACEBOOK_INSIGHTS_PERIOD_ENUM_TYPE } from "../enum/facebook";
import { HTTP_METHOD_ENUM_TYPE } from "../enum/common";
import { enumOptionIds } from "../engine/enumRegistry";
import { i18n } from "@i18n";

// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibraryFacebook.facebook*` wrapper (see server/functionLibraryFacebook.ts), which reads
// the credential back from environment variables instead of the vault — same split as
// github.ts's execute()/compileExecute().

const GROUP_NAME = "Request.Facebook";

function credentialNamePin() {
  return {
    id: "credentialName",
    label: i18n.nodes.facebook.__shared.pin_credential_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

function resolveFacebookCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: FacebookCredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential)
    return {
      ok: false,
      error: `Credential "${credentialName}" not found in the vault`,
    };
  if (credential.type !== "facebookGraphAPI")
    return {
      ok: false,
      error: `Credential "${credentialName}" is not a Facebook Graph API credential`,
    };
  return { ok: true, data: credential.data as FacebookCredentialData };
}

registerNode({
  type: "facebook.authorize",
  label: i18n.nodes.facebook.authorize.label,
  description: i18n.nodes.facebook.authorize.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "credentialName", label: i18n.nodes.facebook.authorize.pin_credential_name, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "tokens", label: i18n.nodes.facebook.authTokens.label, type: "struct", subType: AUTH_TOKENS_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          tokens: { accessToken: "", expiresIn: 0 },
          error: resolved.error,
        },
      };
    }
    const result = await FacebookManager.exchangeAuthCode(resolved.data.authCode, resolved.data.appId, resolved.data.appSecret, resolved.data.redirectUri);
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookAuthorize(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: `{ accessToken: ${v}.accessToken, expiresIn: ${v}.expiresIn }`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.debugToken",
  label: i18n.nodes.facebook.debugToken.label,
  description: i18n.nodes.facebook.debugToken.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "inputToken", label: i18n.nodes.facebook.debugToken.pin_input_token, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "result", label: i18n.nodes.facebook.debugTokenResult.label, type: "struct", subType: DEBUG_TOKEN_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          result: { appId: "", isValid: false, expiresAt: 0, scopes: [] },
          error: resolved.error,
        },
      };
    const result = await FacebookManager.debugToken(String(inputs.inputToken ?? ""), resolved.data.appId, resolved.data.appSecret);
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: {
          appId: result.appId,
          isValid: result.isValid,
          expiresAt: result.expiresAt,
          scopes: result.scopes,
        },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookDebugToken(${inputs.credentialName}, ${inputs.inputToken});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: `{ appId: ${v}.appId, isValid: ${v}.isValid, expiresAt: ${v}.expiresAt, scopes: ${v}.scopes }`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.getPageInfo",
  label: i18n.nodes.facebook.getPageInfo.label,
  description: i18n.nodes.facebook.getPageInfo.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "pageId", label: i18n.nodes.facebook.__shared.pin_page_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "page", label: i18n.nodes.facebook.page.label, type: "struct", subType: PAGE_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          page: { id: "", name: "", category: "", fanCount: 0, link: "" },
          error: resolved.error,
        },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getPageInfo(String(inputs.pageId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        page: { id: result.id, name: result.name, category: result.category, fanCount: result.fanCount, link: result.link },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetPageInfo(${inputs.credentialName}, ${inputs.pageId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, page: `{ id: ${v}.id, name: ${v}.name, category: ${v}.category, fanCount: ${v}.fanCount, link: ${v}.link }`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.createPost",
  label: i18n.nodes.facebook.createPost.label,
  description: i18n.nodes.facebook.createPost.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "pageId", label: i18n.nodes.facebook.__shared.pin_page_id, type: "string", direction: "input", defaultValue: "" },
    { id: "message", label: i18n.nodes.facebook.__shared.pin_message, type: "string", direction: "input", defaultValue: "" },
    { id: "link", label: i18n.nodes.facebook.createPost.pin_link, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "postId", label: i18n.nodes.facebook.__shared.pin_post_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, postId: "", error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.createPost(String(inputs.pageId ?? ""), String(inputs.message ?? ""), String(inputs.link ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, postId: result.id, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookCreatePost(${inputs.credentialName}, ${inputs.pageId}, ${inputs.message}, ${inputs.link});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, postId: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.createPhotoPost",
  label: i18n.nodes.facebook.createPhotoPost.label,
  description: i18n.nodes.facebook.createPhotoPost.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "pageId", label: i18n.nodes.facebook.__shared.pin_page_id, type: "string", direction: "input", defaultValue: "" },
    { id: "url", label: i18n.nodes.facebook.createPhotoPost.pin_url, type: "string", direction: "input", defaultValue: "" },
    { id: "caption", label: i18n.nodes.facebook.createPhotoPost.pin_caption, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "postId", label: i18n.nodes.facebook.__shared.pin_post_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, postId: "", error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.createPhotoPost(String(inputs.pageId ?? ""), String(inputs.url ?? ""), String(inputs.caption ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, postId: result.id, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookCreatePhotoPost(${inputs.credentialName}, ${inputs.pageId}, ${inputs.url}, ${inputs.caption});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, postId: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.createVideoPost",
  label: i18n.nodes.facebook.createVideoPost.label,
  description: i18n.nodes.facebook.createVideoPost.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "pageId", label: i18n.nodes.facebook.__shared.pin_page_id, type: "string", direction: "input", defaultValue: "" },
    { id: "videoUrl", label: i18n.nodes.facebook.createVideoPost.pin_video_url, type: "string", direction: "input", defaultValue: "" },
    { id: "description", label: i18n.nodes.facebook.createVideoPost.pin_description, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "postId", label: i18n.nodes.facebook.__shared.pin_post_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, postId: "", error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.createVideoPost(String(inputs.pageId ?? ""), String(inputs.videoUrl ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, postId: result.id, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookCreateVideoPost(${inputs.credentialName}, ${inputs.pageId}, ${inputs.videoUrl}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, postId: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.deletePost",
  label: i18n.nodes.facebook.deletePost.label,
  description: i18n.nodes.facebook.deletePost.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "postId", label: i18n.nodes.facebook.__shared.pin_post_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.deletePost(String(inputs.postId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookDeletePost(${inputs.credentialName}, ${inputs.postId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.getPosts",
  label: i18n.nodes.facebook.getPosts.label,
  description: i18n.nodes.facebook.getPosts.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "pageId", label: i18n.nodes.facebook.__shared.pin_page_id, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.facebook.__shared.pin_limit, type: "number", direction: "input", defaultValue: 25, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "posts", label: i18n.nodes.facebook.getPosts.pin_posts, type: "struct", subType: POST_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, posts: [], error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getPosts(String(inputs.pageId ?? ""), Number(inputs.limit ?? 25));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetPosts(${inputs.credentialName}, ${inputs.pageId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, posts: `${v}.posts`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.getPageInsights",
  label: i18n.nodes.facebook.getPageInsights.label,
  description: i18n.nodes.facebook.getPageInsights.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "pageId", label: i18n.nodes.facebook.__shared.pin_page_id, type: "string", direction: "input", defaultValue: "" },
    { id: "metrics", label: i18n.nodes.facebook.getPageInsights.pin_metrics, type: "string", container: "array", direction: "input" },
    { id: "period", label: i18n.nodes.facebook.__shared.pin_period, type: "enum", subType: FACEBOOK_INSIGHTS_PERIOD_ENUM_TYPE, direction: "input", defaultValue: "day", options: enumOptionIds(FACEBOOK_INSIGHTS_PERIOD_ENUM_TYPE) },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "json", label: i18n.nodes.facebook.__shared.pin_json, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, json: "", error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getPageInsights(String(inputs.pageId ?? ""), (inputs.metrics as string[]) ?? [], String(inputs.period ?? "day"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetPageInsights(${inputs.credentialName}, ${inputs.pageId}, ${inputs.metrics}, ${inputs.period});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, json: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.createComment",
  label: i18n.nodes.facebook.createComment.label,
  description: i18n.nodes.facebook.createComment.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "objectId", label: i18n.nodes.facebook.__shared.pin_object_id, type: "string", direction: "input", defaultValue: "" },
    { id: "message", label: i18n.nodes.facebook.__shared.pin_message, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "id", label: i18n.nodes.facebook.__shared.pin_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.createComment(String(inputs.objectId ?? ""), String(inputs.message ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookCreateComment(${inputs.credentialName}, ${inputs.objectId}, ${inputs.message});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.getComments",
  label: i18n.nodes.facebook.getComments.label,
  description: i18n.nodes.facebook.getComments.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "objectId", label: i18n.nodes.facebook.__shared.pin_object_id, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.facebook.__shared.pin_limit, type: "number", direction: "input", defaultValue: 25, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "comments", label: i18n.nodes.facebook.getComments.pin_comments, type: "struct", subType: COMMENT_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, comments: [], error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getComments(String(inputs.objectId ?? ""), Number(inputs.limit ?? 25));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetComments(${inputs.credentialName}, ${inputs.objectId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, comments: `${v}.comments`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.deleteComment",
  label: i18n.nodes.facebook.deleteComment.label,
  description: i18n.nodes.facebook.deleteComment.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "commentId", label: i18n.nodes.facebook.__shared.pin_comment_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.deleteComment(String(inputs.commentId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookDeleteComment(${inputs.credentialName}, ${inputs.commentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

function registerLikeNode(type: "likeObject" | "unlikeObject") {
  registerNode({
    type: `facebook.${type}`,
    label: i18n.nodes.facebook[type].label,
    description: i18n.nodes.facebook[type].description,
    group: GROUP_NAME,
    colorCategory: NodeColorCategory.Integration,
    pins: [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      credentialNamePin(),
      { id: "objectId", label: i18n.nodes.facebook.__shared.pin_object_id, type: "string", direction: "input", defaultValue: "" },
      { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
      { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
      { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
    ],
    latent: true,
    execute: async ({ inputs, ctx }) => {
      const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
      if (!resolved.ok)
        return {
          nextExec: "exec-out",
          outputs: { success: false, error: resolved.error },
        };
      const manager = FacebookManager.forCredential(resolved.data.accessToken);
      const result = await manager[type](String(inputs.objectId ?? ""));
      return { nextExec: "exec-out", outputs: result };
    },
    compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebook${type[0].toUpperCase()}${type.slice(1)}(${inputs.credentialName}, ${inputs.objectId});`, ...compileFrom("exec-out")],
    compileExecuteOutputs: ({ node }) => {
      const v = compileResultVar(node.id);
      return { success: `${v}.success`, error: `${v}.error` };
    },
    compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
  });
}

registerLikeNode("likeObject");
registerLikeNode("unlikeObject");

registerNode({
  type: "facebook.getLikesCount",
  label: i18n.nodes.facebook.getLikesCount.label,
  description: i18n.nodes.facebook.getLikesCount.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "objectId", label: i18n.nodes.facebook.__shared.pin_object_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "count", label: i18n.nodes.facebook.getLikesCount.pin_count, type: "number", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, count: 0, error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getLikesCount(String(inputs.objectId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetLikesCount(${inputs.credentialName}, ${inputs.objectId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, count: `${v}.count`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.getUserProfile",
  label: i18n.nodes.facebook.getUserProfile.label,
  description: i18n.nodes.facebook.getUserProfile.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "userId", label: i18n.nodes.facebook.getUserProfile.pin_user_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "user", label: i18n.nodes.facebook.user.label, type: "struct", subType: USER_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          user: { id: "", name: "", email: "" },
          error: resolved.error,
        },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getUserProfile(String(inputs.userId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        user: { id: result.id, name: result.name, email: result.email },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetUserProfile(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, user: `{ id: ${v}.id, name: ${v}.name, email: ${v}.email }`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.getAdAccounts",
  label: i18n.nodes.facebook.getAdAccounts.label,
  description: i18n.nodes.facebook.getAdAccounts.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "userId", label: i18n.nodes.facebook.getUserProfile.pin_user_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "accounts", label: i18n.nodes.facebook.getAdAccounts.pin_accounts, type: "struct", subType: AD_ACCOUNT_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, accounts: [], error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getAdAccounts(String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetAdAccounts(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, accounts: `${v}.accounts`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.createCampaign",
  label: i18n.nodes.facebook.createCampaign.label,
  description: i18n.nodes.facebook.createCampaign.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "adAccountId", label: i18n.nodes.facebook.__shared.pin_ad_account_id, type: "string", direction: "input", defaultValue: "" },
    { id: "name", label: i18n.nodes.facebook.__shared.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "objective", label: i18n.nodes.facebook.createCampaign.pin_objective, type: "enum", subType: FACEBOOK_CAMPAIGN_OBJECTIVE_ENUM_TYPE, direction: "input", defaultValue: "OUTCOME_TRAFFIC", options: enumOptionIds(FACEBOOK_CAMPAIGN_OBJECTIVE_ENUM_TYPE) },
    { id: "status", label: i18n.nodes.facebook.__shared.pin_status, type: "enum", subType: FACEBOOK_CAMPAIGN_STATUS_ENUM_TYPE, direction: "input", defaultValue: "PAUSED", options: enumOptionIds(FACEBOOK_CAMPAIGN_STATUS_ENUM_TYPE) },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "id", label: i18n.nodes.facebook.__shared.pin_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.createCampaign(String(inputs.adAccountId ?? ""), String(inputs.name ?? ""), String(inputs.objective ?? "OUTCOME_TRAFFIC"), String(inputs.status ?? "PAUSED"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookCreateCampaign(${inputs.credentialName}, ${inputs.adAccountId}, ${inputs.name}, ${inputs.objective}, ${inputs.status});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.getCampaigns",
  label: i18n.nodes.facebook.getCampaigns.label,
  description: i18n.nodes.facebook.getCampaigns.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "adAccountId", label: i18n.nodes.facebook.__shared.pin_ad_account_id, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.facebook.__shared.pin_limit, type: "number", direction: "input", defaultValue: 25, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "campaigns", label: i18n.nodes.facebook.getCampaigns.pin_campaigns, type: "struct", subType: CAMPAIGN_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, campaigns: [], error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getCampaigns(String(inputs.adAccountId ?? ""), Number(inputs.limit ?? 25));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetCampaigns(${inputs.credentialName}, ${inputs.adAccountId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, campaigns: `${v}.campaigns`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.deleteCampaign",
  label: i18n.nodes.facebook.deleteCampaign.label,
  description: i18n.nodes.facebook.deleteCampaign.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "campaignId", label: i18n.nodes.facebook.deleteCampaign.pin_campaign_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.deleteCampaign(String(inputs.campaignId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookDeleteCampaign(${inputs.credentialName}, ${inputs.campaignId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.getInsights",
  label: i18n.nodes.facebook.getInsights.label,
  description: i18n.nodes.facebook.getInsights.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "objectId", label: i18n.nodes.facebook.__shared.pin_object_id, type: "string", direction: "input", defaultValue: "" },
    { id: "fields", label: i18n.nodes.facebook.getInsights.pin_fields, type: "string", container: "array", direction: "input" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "json", label: i18n.nodes.facebook.__shared.pin_json, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, json: "", error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.getInsights(String(inputs.objectId ?? ""), (inputs.fields as string[]) ?? []);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookGetInsights(${inputs.credentialName}, ${inputs.objectId}, ${inputs.fields});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, json: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});

registerNode({
  type: "facebook.apiCall",
  label: i18n.nodes.facebook.apiCall.label,
  description: i18n.nodes.facebook.apiCall.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "method", label: i18n.nodes.facebook.apiCall.pin_method, type: "enum", subType: HTTP_METHOD_ENUM_TYPE, direction: "input", defaultValue: "GET", options: enumOptionIds(HTTP_METHOD_ENUM_TYPE) },
    { id: "path", label: i18n.nodes.facebook.apiCall.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "paramsJson", label: i18n.nodes.facebook.apiCall.pin_params_json, type: "string", direction: "input", defaultValue: "{}" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "json", label: i18n.nodes.facebook.__shared.pin_json, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveFacebookCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, json: "", error: resolved.error },
      };
    const manager = FacebookManager.forCredential(resolved.data.accessToken);
    const result = await manager.apiCall(String(inputs.method ?? "GET"), String(inputs.path ?? ""), String(inputs.paramsJson ?? "{}"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryFacebook.facebookApiCall(${inputs.credentialName}, ${inputs.method}, ${inputs.path}, ${inputs.paramsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, json: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_FACEBOOK_IMPORT],
});
