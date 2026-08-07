import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, FACEBOOK_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { AUTH_TOKENS_STRUCT_TYPE, DEBUG_TOKEN_STRUCT_TYPE, PAGE_STRUCT_TYPE, POST_STRUCT_TYPE, COMMENT_STRUCT_TYPE, USER_STRUCT_TYPE, AD_ACCOUNT_STRUCT_TYPE, CAMPAIGN_STRUCT_TYPE } from "@hermione/graph/structs/facebook";
import { FACEBOOK_CAMPAIGN_OBJECTIVE_ENUM_TYPE, FACEBOOK_CAMPAIGN_STATUS_ENUM_TYPE, FACEBOOK_INSIGHTS_PERIOD_ENUM_TYPE } from "@hermione/graph/enum/facebook";
import { HTTP_METHOD_ENUM_TYPE } from "@hermione/graph/enum/common";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below calls the exact same FacebookManager static method (packages/core/src/lib/
// facebookManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — FacebookManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike most other providers there is no separate functionLibraryFacebook.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
//
// FacebookManager now reaches the database directly, which pulls in better-sqlite3 and Node
// builtins — fine for execute(), which only ever runs server-side, but this file is still statically
// imported client-side too (for the node-creation menu), so a plain top-level import here would drag
// that whole chain into the browser bundle. Loaded with a runtime `import()` instead, ignored by both
// bundlers, so it's never even resolved for the client build; only ever actually called server-side,
// where it resolves normally.
async function loadFacebookManager(): Promise<typeof import("@hermione/core/lib/facebookManager").FacebookManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/facebookManager");
  return mod.FacebookManager;
}

const GROUP_NAME = "Request.Facebook";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.facebook.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

registerNode({
  type: "facebook.authorize",
  label: i18n.nodes.facebook.authorize.label,
  description: i18n.nodes.facebook.authorize.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "tokens", label: i18n.nodes.facebook.authTokens.label, type: "struct", subType: AUTH_TOKENS_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).authorize(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn }, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.authorize(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: `{ accessToken: ${v}.accessToken, expiresIn: ${v}.expiresIn }`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).debugToken(String(inputs.credentialName ?? ""), String(inputs.inputToken ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { appId: result.appId, isValid: result.isValid, expiresAt: result.expiresAt, scopes: result.scopes },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.debugToken(${inputs.credentialName}, ${inputs.inputToken});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: `{ appId: ${v}.appId, isValid: ${v}.isValid, expiresAt: ${v}.expiresAt, scopes: ${v}.scopes }`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getPageInfo(String(inputs.credentialName ?? ""), String(inputs.pageId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        page: { id: result.id, name: result.name, category: result.category, fanCount: result.fanCount, link: result.link },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getPageInfo(${inputs.credentialName}, ${inputs.pageId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, page: `{ id: ${v}.id, name: ${v}.name, category: ${v}.category, fanCount: ${v}.fanCount, link: ${v}.link }`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).createPost(String(inputs.credentialName ?? ""), String(inputs.pageId ?? ""), String(inputs.message ?? ""), String(inputs.link ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, postId: result.id, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.createPost(${inputs.credentialName}, ${inputs.pageId}, ${inputs.message}, ${inputs.link});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, postId: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).createPhotoPost(String(inputs.credentialName ?? ""), String(inputs.pageId ?? ""), String(inputs.url ?? ""), String(inputs.caption ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, postId: result.id, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.createPhotoPost(${inputs.credentialName}, ${inputs.pageId}, ${inputs.url}, ${inputs.caption});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, postId: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).createVideoPost(String(inputs.credentialName ?? ""), String(inputs.pageId ?? ""), String(inputs.videoUrl ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, postId: result.id, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.createVideoPost(${inputs.credentialName}, ${inputs.pageId}, ${inputs.videoUrl}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, postId: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).deletePost(String(inputs.credentialName ?? ""), String(inputs.postId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.deletePost(${inputs.credentialName}, ${inputs.postId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getPosts(String(inputs.credentialName ?? ""), String(inputs.pageId ?? ""), Number(inputs.limit ?? 25));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getPosts(${inputs.credentialName}, ${inputs.pageId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, posts: `${v}.posts`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getPageInsights(String(inputs.credentialName ?? ""), String(inputs.pageId ?? ""), (inputs.metrics as string[]) ?? [], String(inputs.period ?? "day"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getPageInsights(${inputs.credentialName}, ${inputs.pageId}, ${inputs.metrics}, ${inputs.period});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, json: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).createComment(String(inputs.credentialName ?? ""), String(inputs.objectId ?? ""), String(inputs.message ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.createComment(${inputs.credentialName}, ${inputs.objectId}, ${inputs.message});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getComments(String(inputs.credentialName ?? ""), String(inputs.objectId ?? ""), Number(inputs.limit ?? 25));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getComments(${inputs.credentialName}, ${inputs.objectId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, comments: `${v}.comments`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).deleteComment(String(inputs.credentialName ?? ""), String(inputs.commentId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.deleteComment(${inputs.credentialName}, ${inputs.commentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
    execute: async ({ inputs }) => {
      const manager = await loadFacebookManager();
      const result = await manager[type](String(inputs.credentialName ?? ""), String(inputs.objectId ?? ""));
      return { nextExec: "exec-out", outputs: result };
    },
    compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.${type}(${inputs.credentialName}, ${inputs.objectId});`, ...compileFrom("exec-out")],
    compileExecuteOutputs: ({ node }) => {
      const v = compileResultVar(node.id);
      return { success: `${v}.success`, error: `${v}.error` };
    },
    compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getLikesCount(String(inputs.credentialName ?? ""), String(inputs.objectId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getLikesCount(${inputs.credentialName}, ${inputs.objectId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, count: `${v}.count`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getUserProfile(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, user: { id: result.id, name: result.name, email: result.email }, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getUserProfile(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, user: `{ id: ${v}.id, name: ${v}.name, email: ${v}.email }`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getAdAccounts(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getAdAccounts(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, accounts: `${v}.accounts`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).createCampaign(String(inputs.credentialName ?? ""), String(inputs.adAccountId ?? ""), String(inputs.name ?? ""), String(inputs.objective ?? "OUTCOME_TRAFFIC"), String(inputs.status ?? "PAUSED"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.createCampaign(${inputs.credentialName}, ${inputs.adAccountId}, ${inputs.name}, ${inputs.objective}, ${inputs.status});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getCampaigns(String(inputs.credentialName ?? ""), String(inputs.adAccountId ?? ""), Number(inputs.limit ?? 25));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getCampaigns(${inputs.credentialName}, ${inputs.adAccountId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, campaigns: `${v}.campaigns`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).deleteCampaign(String(inputs.credentialName ?? ""), String(inputs.campaignId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.deleteCampaign(${inputs.credentialName}, ${inputs.campaignId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).getInsights(String(inputs.credentialName ?? ""), String(inputs.objectId ?? ""), (inputs.fields as string[]) ?? []);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.getInsights(${inputs.credentialName}, ${inputs.objectId}, ${inputs.fields});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, json: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadFacebookManager()).apiCall(String(inputs.credentialName ?? ""), String(inputs.method ?? "GET"), String(inputs.path ?? ""), String(inputs.paramsJson ?? "{}"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await FacebookManager.apiCall(${inputs.credentialName}, ${inputs.method}, ${inputs.path}, ${inputs.paramsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, json: `${v}.json`, error: `${v}.error` };
  },
  compileImports: [FACEBOOK_MANAGER_IMPORT],
});
