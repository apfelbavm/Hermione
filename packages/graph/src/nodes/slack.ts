import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, SLACK_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { CHANNEL_STRUCT_TYPE, USER_STRUCT_TYPE, MESSAGE_STRUCT_TYPE, PIN_ITEM_STRUCT_TYPE, SEARCH_MATCH_STRUCT_TYPE, USER_GROUP_STRUCT_TYPE, REMINDER_STRUCT_TYPE } from "@hermione/graph/structs/slack";
import { TEXT_ENCODING_ENUM_TYPE } from "@hermione/graph/enum/common";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { i18n } from "@i18n";

// SlackManager (packages/core/src/lib/slackManager.ts) reaches the database directly to resolve the
// named credential, which pulls in better-sqlite3 and Node builtins — fine for execute(), which only
// ever runs server-side, but this file is still statically imported client-side too (for the
// node-creation menu), so a plain top-level import here would drag that whole chain into the browser
// bundle. Loaded with a runtime `import()` instead, ignored by both bundlers, so it's never even
// resolved for the client build; only ever actually called server-side, where it resolves normally.
async function loadSlackManager(): Promise<typeof import("@hermione/core/lib/slackManager").SlackManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/slackManager");
  return mod.SlackManager;
}

const GROUP_NAME = "Request.Slack";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.slack.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
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

registerNode({
  type: "slack.postMessage",
  label: i18n.nodes.slack.postMessage.label,
  description: i18n.nodes.slack.postMessage.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.postMessage.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.slack.postMessage.pin_text, type: "string", direction: "input", defaultValue: "" },
    { id: "threadTs", label: i18n.nodes.slack.postMessage.pin_thread_ts, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "ts", label: i18n.nodes.slack.postMessage.pin_ts, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).postMessage(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.text ?? ""), String(inputs.threadTs ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.postMessage(${inputs.credentialName}, ${inputs.channel}, ${inputs.text}, ${inputs.threadTs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, ts: `${v}.ts`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.updateMessage",
  label: i18n.nodes.slack.updateMessage.label,
  description: i18n.nodes.slack.updateMessage.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.updateMessage.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "ts", label: i18n.nodes.slack.updateMessage.pin_ts, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.slack.updateMessage.pin_text, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "channelOut", label: i18n.nodes.slack.updateMessage.pin_channel_out, type: "string", direction: "output" },
    { id: "tsOut", label: i18n.nodes.slack.updateMessage.pin_ts_out, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).updateMessage(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.ts ?? ""), String(inputs.text ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, channelOut: result.channel, tsOut: result.ts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.updateMessage(${inputs.credentialName}, ${inputs.channel}, ${inputs.ts}, ${inputs.text});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, channelOut: `${v}.channel`, tsOut: `${v}.ts`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.deleteMessage",
  label: i18n.nodes.slack.deleteMessage.label,
  description: i18n.nodes.slack.deleteMessage.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.deleteMessage.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "ts", label: i18n.nodes.slack.deleteMessage.pin_ts, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).deleteMessage(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.ts ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.deleteMessage(${inputs.credentialName}, ${inputs.channel}, ${inputs.ts});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.postEphemeral",
  label: i18n.nodes.slack.postEphemeral.label,
  description: i18n.nodes.slack.postEphemeral.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.postEphemeral.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "user", label: i18n.nodes.slack.postEphemeral.pin_user, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.slack.postEphemeral.pin_text, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "messageTs", label: i18n.nodes.slack.postEphemeral.pin_message_ts, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).postEphemeral(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.user ?? ""), String(inputs.text ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.postEphemeral(${inputs.credentialName}, ${inputs.channel}, ${inputs.user}, ${inputs.text});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messageTs: `${v}.messageTs`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.scheduleMessage",
  label: i18n.nodes.slack.scheduleMessage.label,
  description: i18n.nodes.slack.scheduleMessage.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.scheduleMessage.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.slack.scheduleMessage.pin_text, type: "string", direction: "input", defaultValue: "" },
    { id: "postAt", label: i18n.nodes.slack.scheduleMessage.pin_post_at, type: "number", direction: "input", defaultValue: 0 },
    execOutPin(),
    successPin(),
    { id: "scheduledMessageId", label: i18n.nodes.slack.scheduleMessage.pin_scheduled_message_id, type: "string", direction: "output" },
    { id: "postAtOut", label: i18n.nodes.slack.scheduleMessage.pin_post_at_out, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).scheduleMessage(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.text ?? ""), Number(inputs.postAt ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, scheduledMessageId: result.scheduledMessageId, postAtOut: result.postAt, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.scheduleMessage(${inputs.credentialName}, ${inputs.channel}, ${inputs.text}, ${inputs.postAt});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, scheduledMessageId: `${v}.scheduledMessageId`, postAtOut: `${v}.postAt`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.listConversations",
  label: i18n.nodes.slack.listConversations.label,
  description: i18n.nodes.slack.listConversations.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "limit", label: i18n.nodes.slack.listConversations.pin_limit, type: "number", direction: "input", defaultValue: 200 },
    { id: "types", label: i18n.nodes.slack.listConversations.pin_types, type: "string", direction: "input", defaultValue: "public_channel,private_channel" },
    execOutPin(),
    successPin(),
    { id: "channels", label: i18n.nodes.slack.listConversations.pin_channels, type: "struct", subType: CHANNEL_STRUCT_TYPE, container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).listConversations(String(inputs.credentialName ?? ""), Number(inputs.limit ?? 200), String(inputs.types ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.listConversations(${inputs.credentialName}, ${inputs.limit}, ${inputs.types});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, channels: `${v}.channels`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.createConversation",
  label: i18n.nodes.slack.createConversation.label,
  description: i18n.nodes.slack.createConversation.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "name", label: i18n.nodes.slack.createConversation.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "isPrivate", label: i18n.nodes.slack.createConversation.pin_is_private, type: "boolean", direction: "input", defaultValue: false },
    execOutPin(),
    successPin(),
    { id: "channelId", label: i18n.nodes.slack.createConversation.pin_channel_id, type: "string", direction: "output" },
    { id: "nameOut", label: i18n.nodes.slack.createConversation.pin_name_out, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).createConversation(String(inputs.credentialName ?? ""), String(inputs.name ?? ""), Boolean(inputs.isPrivate));
    return { nextExec: "exec-out", outputs: { success: result.success, channelId: result.channelId, nameOut: result.name, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.createConversation(${inputs.credentialName}, ${inputs.name}, ${inputs.isPrivate});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, channelId: `${v}.channelId`, nameOut: `${v}.name`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.archiveConversation",
  label: i18n.nodes.slack.archiveConversation.label,
  description: i18n.nodes.slack.archiveConversation.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "channel", label: i18n.nodes.slack.archiveConversation.pin_channel, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).archiveConversation(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.archiveConversation(${inputs.credentialName}, ${inputs.channel});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.inviteToConversation",
  label: i18n.nodes.slack.inviteToConversation.label,
  description: i18n.nodes.slack.inviteToConversation.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.inviteToConversation.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "userIds", label: i18n.nodes.slack.inviteToConversation.pin_user_ids, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).inviteToConversation(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.userIds ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.inviteToConversation(${inputs.credentialName}, ${inputs.channel}, ${inputs.userIds});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.kickFromConversation",
  label: i18n.nodes.slack.kickFromConversation.label,
  description: i18n.nodes.slack.kickFromConversation.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.kickFromConversation.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "user", label: i18n.nodes.slack.kickFromConversation.pin_user, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).kickFromConversation(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.user ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.kickFromConversation(${inputs.credentialName}, ${inputs.channel}, ${inputs.user});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.joinConversation",
  label: i18n.nodes.slack.joinConversation.label,
  description: i18n.nodes.slack.joinConversation.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "channel", label: i18n.nodes.slack.joinConversation.pin_channel, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).joinConversation(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.joinConversation(${inputs.credentialName}, ${inputs.channel});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.getConversationHistory",
  label: i18n.nodes.slack.getConversationHistory.label,
  description: i18n.nodes.slack.getConversationHistory.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.getConversationHistory.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.slack.getConversationHistory.pin_limit, type: "number", direction: "input", defaultValue: 100 },
    execOutPin(),
    successPin(),
    { id: "messages", label: i18n.nodes.slack.getConversationHistory.pin_messages, type: "struct", subType: MESSAGE_STRUCT_TYPE, container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).getConversationHistory(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), Number(inputs.limit ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.getConversationHistory(${inputs.credentialName}, ${inputs.channel}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messages: `${v}.messages`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.getConversationInfo",
  label: i18n.nodes.slack.getConversationInfo.label,
  description: i18n.nodes.slack.getConversationInfo.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.getConversationInfo.pin_channel, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.slack.getConversationInfo.pin_id, type: "string", direction: "output" },
    { id: "name", label: i18n.nodes.slack.getConversationInfo.pin_name, type: "string", direction: "output" },
    { id: "isPrivate", label: i18n.nodes.slack.getConversationInfo.pin_is_private, type: "boolean", direction: "output" },
    { id: "isArchived", label: i18n.nodes.slack.getConversationInfo.pin_is_archived, type: "boolean", direction: "output" },
    { id: "topic", label: i18n.nodes.slack.getConversationInfo.pin_topic, type: "string", direction: "output" },
    { id: "purpose", label: i18n.nodes.slack.getConversationInfo.pin_purpose, type: "string", direction: "output" },
    { id: "memberCount", label: i18n.nodes.slack.getConversationInfo.pin_member_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).getConversationInfo(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.getConversationInfo(${inputs.credentialName}, ${inputs.channel});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      id: `${v}.id`,
      name: `${v}.name`,
      isPrivate: `${v}.isPrivate`,
      isArchived: `${v}.isArchived`,
      topic: `${v}.topic`,
      purpose: `${v}.purpose`,
      memberCount: `${v}.memberCount`,
      error: `${v}.error`,
    };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.getConversationMembers",
  label: i18n.nodes.slack.getConversationMembers.label,
  description: i18n.nodes.slack.getConversationMembers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.getConversationMembers.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.slack.getConversationMembers.pin_limit, type: "number", direction: "input", defaultValue: 200 },
    execOutPin(),
    successPin(),
    { id: "memberIds", label: i18n.nodes.slack.getConversationMembers.pin_member_ids, type: "string", container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).getConversationMembers(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), Number(inputs.limit ?? 200));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.getConversationMembers(${inputs.credentialName}, ${inputs.channel}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, memberIds: `${v}.memberIds`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.setConversationTopic",
  label: i18n.nodes.slack.setConversationTopic.label,
  description: i18n.nodes.slack.setConversationTopic.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.setConversationTopic.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "topic", label: i18n.nodes.slack.setConversationTopic.pin_topic, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).setConversationTopic(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.topic ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.setConversationTopic(${inputs.credentialName}, ${inputs.channel}, ${inputs.topic});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.setConversationPurpose",
  label: i18n.nodes.slack.setConversationPurpose.label,
  description: i18n.nodes.slack.setConversationPurpose.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.setConversationPurpose.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "purpose", label: i18n.nodes.slack.setConversationPurpose.pin_purpose, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).setConversationPurpose(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.purpose ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.setConversationPurpose(${inputs.credentialName}, ${inputs.channel}, ${inputs.purpose});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.renameConversation",
  label: i18n.nodes.slack.renameConversation.label,
  description: i18n.nodes.slack.renameConversation.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.renameConversation.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "name", label: i18n.nodes.slack.renameConversation.pin_name, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).renameConversation(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.name ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.renameConversation(${inputs.credentialName}, ${inputs.channel}, ${inputs.name});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.listUsers",
  label: i18n.nodes.slack.listUsers.label,
  description: i18n.nodes.slack.listUsers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "limit", label: i18n.nodes.slack.listUsers.pin_limit, type: "number", direction: "input", defaultValue: 200 },
    execOutPin(),
    successPin(),
    { id: "users", label: i18n.nodes.slack.listUsers.pin_users, type: "struct", subType: USER_STRUCT_TYPE, container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).listUsers(String(inputs.credentialName ?? ""), Number(inputs.limit ?? 200));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.listUsers(${inputs.credentialName}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, users: `${v}.users`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.getUserInfo",
  label: i18n.nodes.slack.getUserInfo.label,
  description: i18n.nodes.slack.getUserInfo.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "user", label: i18n.nodes.slack.getUserInfo.pin_user, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.slack.getUserInfo.pin_id, type: "string", direction: "output" },
    { id: "name", label: i18n.nodes.slack.getUserInfo.pin_name, type: "string", direction: "output" },
    { id: "realName", label: i18n.nodes.slack.getUserInfo.pin_real_name, type: "string", direction: "output" },
    { id: "email", label: i18n.nodes.slack.getUserInfo.pin_email, type: "string", direction: "output" },
    { id: "isBot", label: i18n.nodes.slack.getUserInfo.pin_is_bot, type: "boolean", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).getUserInfo(String(inputs.credentialName ?? ""), String(inputs.user ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.getUserInfo(${inputs.credentialName}, ${inputs.user});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, name: `${v}.name`, realName: `${v}.realName`, email: `${v}.email`, isBot: `${v}.isBot`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.lookupUserByEmail",
  label: i18n.nodes.slack.lookupUserByEmail.label,
  description: i18n.nodes.slack.lookupUserByEmail.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "email", label: i18n.nodes.slack.lookupUserByEmail.pin_email, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.slack.lookupUserByEmail.pin_id, type: "string", direction: "output" },
    { id: "name", label: i18n.nodes.slack.lookupUserByEmail.pin_name, type: "string", direction: "output" },
    { id: "realName", label: i18n.nodes.slack.lookupUserByEmail.pin_real_name, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).lookupUserByEmail(String(inputs.credentialName ?? ""), String(inputs.email ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.lookupUserByEmail(${inputs.credentialName}, ${inputs.email});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, name: `${v}.name`, realName: `${v}.realName`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.uploadFile",
  label: i18n.nodes.slack.uploadFile.label,
  description: i18n.nodes.slack.uploadFile.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.uploadFile.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "filename", label: i18n.nodes.slack.uploadFile.pin_filename, type: "string", direction: "input", defaultValue: "" },
    { id: "content", label: i18n.nodes.slack.uploadFile.pin_content, type: "string", direction: "input", defaultValue: "" },
    { id: "encoding", label: i18n.nodes.slack.__shared.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    { id: "initialComment", label: i18n.nodes.slack.uploadFile.pin_initial_comment, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "fileId", label: i18n.nodes.slack.uploadFile.pin_file_id, type: "string", direction: "output" },
    { id: "permalink", label: i18n.nodes.slack.uploadFile.pin_permalink, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).uploadFile(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.filename ?? ""), String(inputs.content ?? ""), inputs.encoding === "base64" ? "base64" : "utf8", String(inputs.initialComment ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.uploadFile(${inputs.credentialName}, ${inputs.channel}, ${inputs.filename}, ${inputs.content}, ${inputs.encoding}, ${inputs.initialComment});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, fileId: `${v}.fileId`, permalink: `${v}.permalink`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.deleteFile",
  label: i18n.nodes.slack.deleteFile.label,
  description: i18n.nodes.slack.deleteFile.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "fileId", label: i18n.nodes.slack.deleteFile.pin_file_id, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).deleteFile(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.deleteFile(${inputs.credentialName}, ${inputs.fileId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.getFileInfo",
  label: i18n.nodes.slack.getFileInfo.label,
  description: i18n.nodes.slack.getFileInfo.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.slack.getFileInfo.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.slack.getFileInfo.pin_id, type: "string", direction: "output" },
    { id: "name", label: i18n.nodes.slack.getFileInfo.pin_name, type: "string", direction: "output" },
    { id: "title", label: i18n.nodes.slack.getFileInfo.pin_title, type: "string", direction: "output" },
    { id: "permalink", label: i18n.nodes.slack.getFileInfo.pin_permalink, type: "string", direction: "output" },
    { id: "size", label: i18n.nodes.slack.getFileInfo.pin_size, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).getFileInfo(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.getFileInfo(${inputs.credentialName}, ${inputs.fileId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, name: `${v}.name`, title: `${v}.title`, permalink: `${v}.permalink`, size: `${v}.size`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.addReaction",
  label: i18n.nodes.slack.addReaction.label,
  description: i18n.nodes.slack.addReaction.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.addReaction.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "timestamp", label: i18n.nodes.slack.addReaction.pin_timestamp, type: "string", direction: "input", defaultValue: "" },
    { id: "emojiName", label: i18n.nodes.slack.addReaction.pin_emoji_name, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).addReaction(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.timestamp ?? ""), String(inputs.emojiName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.addReaction(${inputs.credentialName}, ${inputs.channel}, ${inputs.timestamp}, ${inputs.emojiName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.removeReaction",
  label: i18n.nodes.slack.removeReaction.label,
  description: i18n.nodes.slack.removeReaction.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.removeReaction.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "timestamp", label: i18n.nodes.slack.removeReaction.pin_timestamp, type: "string", direction: "input", defaultValue: "" },
    { id: "emojiName", label: i18n.nodes.slack.removeReaction.pin_emoji_name, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).removeReaction(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.timestamp ?? ""), String(inputs.emojiName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.removeReaction(${inputs.credentialName}, ${inputs.channel}, ${inputs.timestamp}, ${inputs.emojiName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.addPin",
  label: i18n.nodes.slack.addPin.label,
  description: i18n.nodes.slack.addPin.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.addPin.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "timestamp", label: i18n.nodes.slack.addPin.pin_timestamp, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).addPin(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.timestamp ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.addPin(${inputs.credentialName}, ${inputs.channel}, ${inputs.timestamp});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.removePin",
  label: i18n.nodes.slack.removePin.label,
  description: i18n.nodes.slack.removePin.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.removePin.pin_channel, type: "string", direction: "input", defaultValue: "" },
    { id: "timestamp", label: i18n.nodes.slack.removePin.pin_timestamp, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).removePin(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""), String(inputs.timestamp ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.removePin(${inputs.credentialName}, ${inputs.channel}, ${inputs.timestamp});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.listPins",
  label: i18n.nodes.slack.listPins.label,
  description: i18n.nodes.slack.listPins.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "channel", label: i18n.nodes.slack.listPins.pin_channel, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "items", label: i18n.nodes.slack.listPins.pin_items, type: "struct", subType: PIN_ITEM_STRUCT_TYPE, container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).listPins(String(inputs.credentialName ?? ""), String(inputs.channel ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.listPins(${inputs.credentialName}, ${inputs.channel});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, items: `${v}.items`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.searchMessages",
  label: i18n.nodes.slack.searchMessages.label,
  description: i18n.nodes.slack.searchMessages.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "query", label: i18n.nodes.slack.searchMessages.pin_query, type: "string", direction: "input", defaultValue: "" },
    { id: "count", label: i18n.nodes.slack.searchMessages.pin_count, type: "number", direction: "input", defaultValue: 20 },
    execOutPin(),
    successPin(),
    { id: "matches", label: i18n.nodes.slack.searchMessages.pin_matches, type: "struct", subType: SEARCH_MATCH_STRUCT_TYPE, container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).searchMessages(String(inputs.credentialName ?? ""), String(inputs.query ?? ""), Number(inputs.count ?? 20));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.searchMessages(${inputs.credentialName}, ${inputs.query}, ${inputs.count});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, matches: `${v}.matches`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.getTeamInfo",
  label: i18n.nodes.slack.getTeamInfo.label,
  description: i18n.nodes.slack.getTeamInfo.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.slack.getTeamInfo.pin_id, type: "string", direction: "output" },
    { id: "name", label: i18n.nodes.slack.getTeamInfo.pin_name, type: "string", direction: "output" },
    { id: "domain", label: i18n.nodes.slack.getTeamInfo.pin_domain, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).getTeamInfo(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.getTeamInfo(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, name: `${v}.name`, domain: `${v}.domain`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.listUserGroups",
  label: i18n.nodes.slack.listUserGroups.label,
  description: i18n.nodes.slack.listUserGroups.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "groups", label: i18n.nodes.slack.listUserGroups.pin_groups, type: "struct", subType: USER_GROUP_STRUCT_TYPE, container: "array", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).listUserGroups(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.listUserGroups(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, groups: `${v}.groups`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.createUserGroup",
  label: i18n.nodes.slack.createUserGroup.label,
  description: i18n.nodes.slack.createUserGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "name", label: i18n.nodes.slack.createUserGroup.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "handle", label: i18n.nodes.slack.createUserGroup.pin_handle, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.slack.createUserGroup.pin_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).createUserGroup(String(inputs.credentialName ?? ""), String(inputs.name ?? ""), String(inputs.handle ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.createUserGroup(${inputs.credentialName}, ${inputs.name}, ${inputs.handle});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.updateUserGroup",
  label: i18n.nodes.slack.updateUserGroup.label,
  description: i18n.nodes.slack.updateUserGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "usergroup", label: i18n.nodes.slack.updateUserGroup.pin_usergroup, type: "string", direction: "input", defaultValue: "" },
    { id: "name", label: i18n.nodes.slack.updateUserGroup.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "handle", label: i18n.nodes.slack.updateUserGroup.pin_handle, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).updateUserGroup(String(inputs.credentialName ?? ""), String(inputs.usergroup ?? ""), String(inputs.name ?? ""), String(inputs.handle ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.updateUserGroup(${inputs.credentialName}, ${inputs.usergroup}, ${inputs.name}, ${inputs.handle});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.updateUserGroupUsers",
  label: i18n.nodes.slack.updateUserGroupUsers.label,
  description: i18n.nodes.slack.updateUserGroupUsers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "usergroup", label: i18n.nodes.slack.updateUserGroupUsers.pin_usergroup, type: "string", direction: "input", defaultValue: "" },
    { id: "userIds", label: i18n.nodes.slack.updateUserGroupUsers.pin_user_ids, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).updateUserGroupUsers(String(inputs.credentialName ?? ""), String(inputs.usergroup ?? ""), String(inputs.userIds ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.updateUserGroupUsers(${inputs.credentialName}, ${inputs.usergroup}, ${inputs.userIds});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.addReminder",
  label: i18n.nodes.slack.addReminder.label,
  description: i18n.nodes.slack.addReminder.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "text", label: i18n.nodes.slack.addReminder.pin_text, type: "string", direction: "input", defaultValue: "" },
    { id: "time", label: i18n.nodes.slack.addReminder.pin_time, type: "string", direction: "input", defaultValue: "" },
    { id: "user", label: i18n.nodes.slack.addReminder.pin_user, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "reminderId", label: i18n.nodes.slack.addReminder.pin_reminder_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).addReminder(String(inputs.credentialName ?? ""), String(inputs.text ?? ""), String(inputs.time ?? ""), String(inputs.user ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, reminderId: result.reminderId, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.addReminder(${inputs.credentialName}, ${inputs.text}, ${inputs.time}, ${inputs.user});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, reminderId: `${v}.reminderId`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.listReminders",
  label: i18n.nodes.slack.listReminders.label,
  description: i18n.nodes.slack.listReminders.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "reminders", label: i18n.nodes.slack.listReminders.pin_reminders, type: "struct", subType: REMINDER_STRUCT_TYPE, container: "array", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).listReminders(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.listReminders(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, reminders: `${v}.reminders`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});

registerNode({
  type: "slack.deleteReminder",
  label: i18n.nodes.slack.deleteReminder.label,
  description: i18n.nodes.slack.deleteReminder.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "reminderId", label: i18n.nodes.slack.deleteReminder.pin_reminder_id, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSlackManager()).deleteReminder(String(inputs.credentialName ?? ""), String(inputs.reminderId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SlackManager.deleteReminder(${inputs.credentialName}, ${inputs.reminderId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SLACK_MANAGER_IMPORT],
});
