import { SlackManager } from "../lib/slackManager.ts";

/** Compile-time-only counterpart of nodes/slack.ts's execute() vault lookup (resolveSlackCredential) —
 * the compiled/deployed script has no access to the Credential Vault database, only the interpreter
 * does, so it reads the same credential's botToken back from an environment variable instead, the
 * same "HERMIONE_CRED_<NAME>_<FIELD>" naming credentialEnv.ts's applyCredentialEnvVars writes.
 * Never called by the interpreter — genuinely different credential-sourcing behavior, not
 * duplicated logic (see functionLibraryDropbox.ts for the same pattern). */
function slackManagerFromEnv(credentialName: string): { ok: true; manager: SlackManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "slackBotToken") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a Slack Bot Token credential` };
  return { ok: true, manager: new SlackManager(process.env[`${prefix}_BOT_TOKEN`] || "") };
}

export async function slackPostMessage(credentialName: string, channel: string, text: string, threadTs: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, channel: "", ts: "", error: cred.error };
  return cred.manager.postMessage(channel, text, threadTs);
}

export async function slackUpdateMessage(credentialName: string, channel: string, ts: string, text: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, channel: "", ts: "", error: cred.error };
  return cred.manager.updateMessage(channel, ts, text);
}

export async function slackDeleteMessage(credentialName: string, channel: string, ts: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteMessage(channel, ts);
}

export async function slackPostEphemeral(credentialName: string, channel: string, user: string, text: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messageTs: "", error: cred.error };
  return cred.manager.postEphemeral(channel, user, text);
}

export async function slackScheduleMessage(credentialName: string, channel: string, text: string, postAt: number) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, scheduledMessageId: "", postAt: 0, error: cred.error };
  return cred.manager.scheduleMessage(channel, text, postAt);
}

export async function slackListConversations(credentialName: string, limit: number, types: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, channels: [], error: cred.error };
  return cred.manager.listConversations(limit, types);
}

export async function slackCreateConversation(credentialName: string, name: string, isPrivate: boolean) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, channelId: "", name: "", error: cred.error };
  return cred.manager.createConversation(name, isPrivate);
}

export async function slackArchiveConversation(credentialName: string, channel: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.archiveConversation(channel);
}

export async function slackInviteToConversation(credentialName: string, channel: string, userIds: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.inviteToConversation(channel, userIds);
}

export async function slackKickFromConversation(credentialName: string, channel: string, user: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.kickFromConversation(channel, user);
}

export async function slackJoinConversation(credentialName: string, channel: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.joinConversation(channel);
}

export async function slackGetConversationHistory(credentialName: string, channel: string, limit: number) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messages: [], error: cred.error };
  return cred.manager.getConversationHistory(channel, limit);
}

export async function slackGetConversationInfo(credentialName: string, channel: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", name: "", isPrivate: false, isArchived: false, topic: "", purpose: "", memberCount: 0, error: cred.error };
  return cred.manager.getConversationInfo(channel);
}

export async function slackGetConversationMembers(credentialName: string, channel: string, limit: number) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, memberIds: [], error: cred.error };
  return cred.manager.getConversationMembers(channel, limit);
}

export async function slackSetConversationTopic(credentialName: string, channel: string, topic: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.setConversationTopic(channel, topic);
}

export async function slackSetConversationPurpose(credentialName: string, channel: string, purpose: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.setConversationPurpose(channel, purpose);
}

export async function slackRenameConversation(credentialName: string, channel: string, name: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.renameConversation(channel, name);
}

export async function slackListUsers(credentialName: string, limit: number) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, users: [], error: cred.error };
  return cred.manager.listUsers(limit);
}

export async function slackGetUserInfo(credentialName: string, user: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", name: "", realName: "", email: "", isBot: false, error: cred.error };
  return cred.manager.getUserInfo(user);
}

export async function slackLookupUserByEmail(credentialName: string, email: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", name: "", realName: "", error: cred.error };
  return cred.manager.lookupUserByEmail(email);
}

export async function slackUploadFile(credentialName: string, channel: string, filename: string, content: string, encoding: "utf8" | "base64", initialComment: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, fileId: "", permalink: "", error: cred.error };
  return cred.manager.uploadFile(channel, filename, content, encoding, initialComment);
}

export async function slackDeleteFile(credentialName: string, fileId: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteFile(fileId);
}

export async function slackGetFileInfo(credentialName: string, fileId: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", name: "", title: "", permalink: "", size: 0, error: cred.error };
  return cred.manager.getFileInfo(fileId);
}

export async function slackAddReaction(credentialName: string, channel: string, timestamp: string, emojiName: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.addReaction(channel, timestamp, emojiName);
}

export async function slackRemoveReaction(credentialName: string, channel: string, timestamp: string, emojiName: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.removeReaction(channel, timestamp, emojiName);
}

export async function slackAddPin(credentialName: string, channel: string, timestamp: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.addPin(channel, timestamp);
}

export async function slackRemovePin(credentialName: string, channel: string, timestamp: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.removePin(channel, timestamp);
}

export async function slackListPins(credentialName: string, channel: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, items: [], error: cred.error };
  return cred.manager.listPins(channel);
}

export async function slackSearchMessages(credentialName: string, query: string, count: number) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, matches: [], error: cred.error };
  return cred.manager.searchMessages(query, count);
}

export async function slackGetTeamInfo(credentialName: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", name: "", domain: "", error: cred.error };
  return cred.manager.getTeamInfo();
}

export async function slackListUserGroups(credentialName: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, groups: [], error: cred.error };
  return cred.manager.listUserGroups();
}

export async function slackCreateUserGroup(credentialName: string, name: string, handle: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createUserGroup(name, handle);
}

export async function slackUpdateUserGroup(credentialName: string, usergroup: string, name: string, handle: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.updateUserGroup(usergroup, name, handle);
}

export async function slackUpdateUserGroupUsers(credentialName: string, usergroup: string, userIds: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.updateUserGroupUsers(usergroup, userIds);
}

export async function slackAddReminder(credentialName: string, text: string, time: string, user: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, reminderId: "", error: cred.error };
  return cred.manager.addReminder(text, time, user);
}

export async function slackListReminders(credentialName: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, reminders: [], error: cred.error };
  return cred.manager.listReminders();
}

export async function slackDeleteReminder(credentialName: string, reminderId: string) {
  const cred = slackManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteReminder(reminderId);
}
