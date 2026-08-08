/** Thin wrapper around Slack's official @slack/web-api SDK's WebClient. Every method calls a single
 * WebClient route and turns either a successful result or a thrown error (the SDK's own errors carry
 * Slack's error code at `err.data.error`, see SlackManager.errorMessage below) into the same plain
 * {success, error} shape every other provider manager in this repo returns (see lib/dropboxManager.ts).
 * Credential resolution is a single layer: the static wrappers resolve the named credential straight
 * from the database (see findCredential) and both the interpreter and compiled/deployed scripts call
 * through them, mirroring lib/twilioManager.ts. */

import { WebClient } from "@slack/web-api";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { SlackBotTokenCredentialData } from "@hermione/shared/types";

export interface SlackAuth {
  botToken: string;
}

export interface SlackOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface SlackMessageResult extends SlackOpResult {
  channel: string;
  ts: string;
}

export interface SlackPostEphemeralResult extends SlackOpResult {
  messageTs: string;
}

export interface SlackScheduleMessageResult extends SlackOpResult {
  scheduledMessageId: string;
  postAt: number;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  [key: string]: unknown;
}

export interface SlackListConversationsResult extends SlackOpResult {
  channels: SlackChannel[];
}

export interface SlackCreateConversationResult extends SlackOpResult {
  channelId: string;
  name: string;
}

export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  [key: string]: unknown;
}

export interface SlackConversationHistoryResult extends SlackOpResult {
  messages: SlackMessage[];
}

export interface SlackConversationInfoResult extends SlackOpResult {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  topic: string;
  purpose: string;
  memberCount: number;
}

export interface SlackConversationMembersResult extends SlackOpResult {
  memberIds: string[];
}

export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  email: string;
  isBot: boolean;
  [key: string]: unknown;
}

export interface SlackListUsersResult extends SlackOpResult {
  users: SlackUser[];
}

export interface SlackUserInfoResult extends SlackOpResult {
  id: string;
  name: string;
  realName: string;
  email: string;
  isBot: boolean;
}

export interface SlackLookupUserResult extends SlackOpResult {
  id: string;
  name: string;
  realName: string;
}

export interface SlackUploadFileResult extends SlackOpResult {
  fileId: string;
  permalink: string;
}

export interface SlackFileInfoResult extends SlackOpResult {
  id: string;
  name: string;
  title: string;
  permalink: string;
  size: number;
}

export interface SlackPinItem {
  type: string;
  channel: string;
  ts: string;
  [key: string]: unknown;
}

export interface SlackListPinsResult extends SlackOpResult {
  items: SlackPinItem[];
}

export interface SlackSearchMatch {
  channel: string;
  user: string;
  text: string;
  ts: string;
  [key: string]: unknown;
}

export interface SlackSearchMessagesResult extends SlackOpResult {
  matches: SlackSearchMatch[];
}

export interface SlackTeamInfoResult extends SlackOpResult {
  id: string;
  name: string;
  domain: string;
}

export interface SlackUserGroup {
  id: string;
  name: string;
  handle: string;
  [key: string]: unknown;
}

export interface SlackListUserGroupsResult extends SlackOpResult {
  groups: SlackUserGroup[];
}

export interface SlackCreateUserGroupResult extends SlackOpResult {
  id: string;
}

export interface SlackReminder {
  id: string;
  text: string;
  time: number;
  [key: string]: unknown;
}

export interface SlackAddReminderResult extends SlackOpResult {
  reminderId: string;
}

export interface SlackListRemindersResult extends SlackOpResult {
  reminders: SlackReminder[];
}

/** Normalizes a comma-separated ID list into a compact "id1,id2" string the Slack Web API expects
 * (conversations.invite's `users`, usergroups.users.update's `users`, ...). */
function normalizeCommaList(value: string): string {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .join(",");
}

const managerCache = new Map<string, SlackManager>();

export class SlackManager {
  private readonly client: WebClient;

  static getInstance(auth: SlackAuth): SlackManager {
    const key = auth.botToken;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new SlackManager(auth.botToken);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  static errorMessage(err: unknown): string {
    const data = (err as { data?: { error?: string } } | undefined)?.data;
    if (data?.error) return data.error;
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: SlackAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "slackBotToken") return { ok: false, error: `Credential "${credentialName}" is not a Slack Bot Token credential` };
    const data = credRecord.data as SlackBotTokenCredentialData;
    return { ok: true, auth: { botToken: data.botToken } };
  }

  // ---- Messaging (chat.*) ----

  static async postMessage(credentialName: string, channel: string, text: string, threadTs: string): Promise<SlackMessageResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, channel: "", ts: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).postMessage(channel, text, threadTs);
  }

  static async updateMessage(credentialName: string, channel: string, ts: string, text: string): Promise<SlackMessageResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, channel: "", ts: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).updateMessage(channel, ts, text);
  }

  static async deleteMessage(credentialName: string, channel: string, ts: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).deleteMessage(channel, ts);
  }

  static async postEphemeral(credentialName: string, channel: string, user: string, text: string): Promise<SlackPostEphemeralResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messageTs: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).postEphemeral(channel, user, text);
  }

  static async scheduleMessage(credentialName: string, channel: string, text: string, postAt: number): Promise<SlackScheduleMessageResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, scheduledMessageId: "", postAt: 0, error: cred.error };
    return SlackManager.getInstance(cred.auth).scheduleMessage(channel, text, postAt);
  }

  // ---- Conversations (conversations.*) ----

  static async listConversations(credentialName: string, limit: number, types: string): Promise<SlackListConversationsResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, channels: [], error: cred.error };
    return SlackManager.getInstance(cred.auth).listConversations(limit, types);
  }

  static async createConversation(credentialName: string, name: string, isPrivate: boolean): Promise<SlackCreateConversationResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, channelId: "", name: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).createConversation(name, isPrivate);
  }

  static async archiveConversation(credentialName: string, channel: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).archiveConversation(channel);
  }

  static async inviteToConversation(credentialName: string, channel: string, userIds: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).inviteToConversation(channel, userIds);
  }

  static async kickFromConversation(credentialName: string, channel: string, user: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).kickFromConversation(channel, user);
  }

  static async joinConversation(credentialName: string, channel: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).joinConversation(channel);
  }

  static async getConversationHistory(credentialName: string, channel: string, limit: number): Promise<SlackConversationHistoryResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messages: [], error: cred.error };
    return SlackManager.getInstance(cred.auth).getConversationHistory(channel, limit);
  }

  static async getConversationInfo(credentialName: string, channel: string): Promise<SlackConversationInfoResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", name: "", isPrivate: false, isArchived: false, topic: "", purpose: "", memberCount: 0, error: cred.error };
    return SlackManager.getInstance(cred.auth).getConversationInfo(channel);
  }

  static async getConversationMembers(credentialName: string, channel: string, limit: number): Promise<SlackConversationMembersResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, memberIds: [], error: cred.error };
    return SlackManager.getInstance(cred.auth).getConversationMembers(channel, limit);
  }

  static async setConversationTopic(credentialName: string, channel: string, topic: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).setConversationTopic(channel, topic);
  }

  static async setConversationPurpose(credentialName: string, channel: string, purpose: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).setConversationPurpose(channel, purpose);
  }

  static async renameConversation(credentialName: string, channel: string, name: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).renameConversation(channel, name);
  }

  // ---- Users (users.*) ----

  static async listUsers(credentialName: string, limit: number): Promise<SlackListUsersResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, users: [], error: cred.error };
    return SlackManager.getInstance(cred.auth).listUsers(limit);
  }

  static async getUserInfo(credentialName: string, user: string): Promise<SlackUserInfoResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", name: "", realName: "", email: "", isBot: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).getUserInfo(user);
  }

  static async lookupUserByEmail(credentialName: string, email: string): Promise<SlackLookupUserResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", name: "", realName: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).lookupUserByEmail(email);
  }

  // ---- Files (files.*) ----

  static async uploadFile(credentialName: string, channel: string, filename: string, content: string, encoding: "utf8" | "base64", initialComment: string): Promise<SlackUploadFileResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, fileId: "", permalink: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).uploadFile(channel, filename, content, encoding, initialComment);
  }

  static async deleteFile(credentialName: string, fileId: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).deleteFile(fileId);
  }

  static async getFileInfo(credentialName: string, fileId: string): Promise<SlackFileInfoResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", name: "", title: "", permalink: "", size: 0, error: cred.error };
    return SlackManager.getInstance(cred.auth).getFileInfo(fileId);
  }

  // ---- Reactions (reactions.*) ----

  static async addReaction(credentialName: string, channel: string, timestamp: string, emojiName: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).addReaction(channel, timestamp, emojiName);
  }

  static async removeReaction(credentialName: string, channel: string, timestamp: string, emojiName: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).removeReaction(channel, timestamp, emojiName);
  }

  // ---- Pins (pins.*) ----

  static async addPin(credentialName: string, channel: string, timestamp: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).addPin(channel, timestamp);
  }

  static async removePin(credentialName: string, channel: string, timestamp: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).removePin(channel, timestamp);
  }

  static async listPins(credentialName: string, channel: string): Promise<SlackListPinsResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, items: [], error: cred.error };
    return SlackManager.getInstance(cred.auth).listPins(channel);
  }

  // ---- Search ----

  static async searchMessages(credentialName: string, query: string, count: number): Promise<SlackSearchMessagesResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, matches: [], error: cred.error };
    return SlackManager.getInstance(cred.auth).searchMessages(query, count);
  }

  // ---- Team ----

  static async getTeamInfo(credentialName: string): Promise<SlackTeamInfoResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", name: "", domain: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).getTeamInfo();
  }

  // ---- User groups (usergroups.*) ----

  static async listUserGroups(credentialName: string): Promise<SlackListUserGroupsResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, groups: [], error: cred.error };
    return SlackManager.getInstance(cred.auth).listUserGroups();
  }

  static async createUserGroup(credentialName: string, name: string, handle: string): Promise<SlackCreateUserGroupResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).createUserGroup(name, handle);
  }

  static async updateUserGroup(credentialName: string, usergroup: string, name: string, handle: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).updateUserGroup(usergroup, name, handle);
  }

  static async updateUserGroupUsers(credentialName: string, usergroup: string, userIds: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).updateUserGroupUsers(usergroup, userIds);
  }

  // ---- Reminders (reminders.*) ----

  static async addReminder(credentialName: string, text: string, time: string, user: string): Promise<SlackAddReminderResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, reminderId: "", error: cred.error };
    return SlackManager.getInstance(cred.auth).addReminder(text, time, user);
  }

  static async listReminders(credentialName: string): Promise<SlackListRemindersResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, reminders: [], error: cred.error };
    return SlackManager.getInstance(cred.auth).listReminders();
  }

  static async deleteReminder(credentialName: string, reminderId: string): Promise<SlackOpResult> {
    const cred = await SlackManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SlackManager.getInstance(cred.auth).deleteReminder(reminderId);
  }

  // ==== Instance methods (require an authenticated WebClient) ====

  private async postMessage(channel: string, text: string, threadTs: string): Promise<SlackMessageResult> {
    try {
      const res = await this.client.chat.postMessage({ channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) });
      return { success: true, channel: res.channel ?? "", ts: res.ts ?? "", error: "" };
    } catch (err) {
      return { success: false, channel: "", ts: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async updateMessage(channel: string, ts: string, text: string): Promise<SlackMessageResult> {
    try {
      const res = await this.client.chat.update({ channel, ts, text });
      return { success: true, channel: res.channel ?? "", ts: res.ts ?? "", error: "" };
    } catch (err) {
      return { success: false, channel: "", ts: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async deleteMessage(channel: string, ts: string): Promise<SlackOpResult> {
    try {
      await this.client.chat.delete({ channel, ts });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async postEphemeral(channel: string, user: string, text: string): Promise<SlackPostEphemeralResult> {
    try {
      const res = await this.client.chat.postEphemeral({ channel, user, text });
      return { success: true, messageTs: res.message_ts ?? "", error: "" };
    } catch (err) {
      return { success: false, messageTs: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async scheduleMessage(channel: string, text: string, postAt: number): Promise<SlackScheduleMessageResult> {
    try {
      const res = await this.client.chat.scheduleMessage({ channel, text, post_at: postAt });
      return { success: true, scheduledMessageId: res.scheduled_message_id ?? "", postAt: Number(res.post_at ?? postAt), error: "" };
    } catch (err) {
      return { success: false, scheduledMessageId: "", postAt: 0, error: SlackManager.errorMessage(err) };
    }
  }

  private async listConversations(limit: number, types: string): Promise<SlackListConversationsResult> {
    try {
      const res = await this.client.conversations.list({ limit: limit || 200, types: types || "public_channel,private_channel" });
      const channels = (res.channels ?? []).map((c) => ({ id: c.id ?? "", name: c.name ?? "", isPrivate: Boolean(c.is_private), isArchived: Boolean(c.is_archived) }));
      return { success: true, channels, error: "" };
    } catch (err) {
      return { success: false, channels: [], error: SlackManager.errorMessage(err) };
    }
  }

  private async createConversation(name: string, isPrivate: boolean): Promise<SlackCreateConversationResult> {
    try {
      const res = await this.client.conversations.create({ name, is_private: isPrivate });
      return { success: true, channelId: res.channel?.id ?? "", name: res.channel?.name ?? "", error: "" };
    } catch (err) {
      return { success: false, channelId: "", name: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async archiveConversation(channel: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.archive({ channel });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async inviteToConversation(channel: string, userIds: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.invite({ channel, users: normalizeCommaList(userIds) });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async kickFromConversation(channel: string, user: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.kick({ channel, user });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async joinConversation(channel: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.join({ channel });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async getConversationHistory(channel: string, limit: number): Promise<SlackConversationHistoryResult> {
    try {
      const res = await this.client.conversations.history({ channel, limit: limit || 100 });
      const messages = (res.messages ?? []).map((m) => ({ ts: m.ts ?? "", user: m.user ?? "", text: m.text ?? "" }));
      return { success: true, messages, error: "" };
    } catch (err) {
      return { success: false, messages: [], error: SlackManager.errorMessage(err) };
    }
  }

  private async getConversationInfo(channel: string): Promise<SlackConversationInfoResult> {
    try {
      const res = await this.client.conversations.info({ channel, include_num_members: true });
      const c = res.channel;
      return {
        success: true,
        id: c?.id ?? "",
        name: c?.name ?? "",
        isPrivate: Boolean(c?.is_private),
        isArchived: Boolean(c?.is_archived),
        topic: c?.topic?.value ?? "",
        purpose: c?.purpose?.value ?? "",
        memberCount: c?.num_members ?? 0,
        error: "",
      };
    } catch (err) {
      return { success: false, id: "", name: "", isPrivate: false, isArchived: false, topic: "", purpose: "", memberCount: 0, error: SlackManager.errorMessage(err) };
    }
  }

  private async getConversationMembers(channel: string, limit: number): Promise<SlackConversationMembersResult> {
    try {
      const res = await this.client.conversations.members({ channel, limit: limit || 200 });
      return { success: true, memberIds: res.members ?? [], error: "" };
    } catch (err) {
      return { success: false, memberIds: [], error: SlackManager.errorMessage(err) };
    }
  }

  private async setConversationTopic(channel: string, topic: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.setTopic({ channel, topic });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async setConversationPurpose(channel: string, purpose: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.setPurpose({ channel, purpose });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async renameConversation(channel: string, name: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.rename({ channel, name });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async listUsers(limit: number): Promise<SlackListUsersResult> {
    try {
      const res = await this.client.users.list({ limit: limit || 200 });
      const users = (res.members ?? []).map((u) => ({ id: u.id ?? "", name: u.name ?? "", realName: u.profile?.real_name ?? "", email: u.profile?.email ?? "", isBot: Boolean(u.is_bot) }));
      return { success: true, users, error: "" };
    } catch (err) {
      return { success: false, users: [], error: SlackManager.errorMessage(err) };
    }
  }

  private async getUserInfo(user: string): Promise<SlackUserInfoResult> {
    try {
      const res = await this.client.users.info({ user });
      const u = res.user;
      return { success: true, id: u?.id ?? "", name: u?.name ?? "", realName: u?.profile?.real_name ?? "", email: u?.profile?.email ?? "", isBot: Boolean(u?.is_bot), error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", realName: "", email: "", isBot: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async lookupUserByEmail(email: string): Promise<SlackLookupUserResult> {
    try {
      const res = await this.client.users.lookupByEmail({ email });
      const u = res.user;
      return { success: true, id: u?.id ?? "", name: u?.name ?? "", realName: u?.profile?.real_name ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", realName: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async uploadFile(channel: string, filename: string, content: string, encoding: "utf8" | "base64", initialComment: string): Promise<SlackUploadFileResult> {
    try {
      const bytes = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
      const res = await this.client.files.uploadV2({ channel_id: channel || undefined, filename, file: bytes, initial_comment: initialComment || undefined });
      const completions = (res as unknown as { files?: { files?: { id?: string; permalink?: string }[] }[] }).files ?? [];
      const file = completions[0]?.files?.[0];
      return { success: true, fileId: file?.id ?? "", permalink: file?.permalink ?? "", error: "" };
    } catch (err) {
      return { success: false, fileId: "", permalink: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async deleteFile(fileId: string): Promise<SlackOpResult> {
    try {
      await this.client.files.delete({ file: fileId });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async getFileInfo(fileId: string): Promise<SlackFileInfoResult> {
    try {
      const res = await this.client.files.info({ file: fileId });
      const f = res.file;
      return { success: true, id: f?.id ?? "", name: f?.name ?? "", title: f?.title ?? "", permalink: f?.permalink ?? "", size: f?.size ?? 0, error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", title: "", permalink: "", size: 0, error: SlackManager.errorMessage(err) };
    }
  }

  private async addReaction(channel: string, timestamp: string, emojiName: string): Promise<SlackOpResult> {
    try {
      await this.client.reactions.add({ channel, timestamp, name: emojiName });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async removeReaction(channel: string, timestamp: string, emojiName: string): Promise<SlackOpResult> {
    try {
      await this.client.reactions.remove({ channel, timestamp, name: emojiName });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async addPin(channel: string, timestamp: string): Promise<SlackOpResult> {
    try {
      await this.client.pins.add({ channel, timestamp });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async removePin(channel: string, timestamp: string): Promise<SlackOpResult> {
    try {
      await this.client.pins.remove({ channel, timestamp });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  /** pins.list's typed response is missing the `channel`/`message` fields the real API actually
   * returns for message-type pins (see https://docs.slack.dev/reference/methods/pins.list), so the
   * items are cast to the shape Slack documents. */
  private async listPins(channel: string): Promise<SlackListPinsResult> {
    try {
      const res = await this.client.pins.list({ channel });
      const items = ((res.items ?? []) as unknown as { type?: string; channel?: string; message?: { ts?: string } }[]).map((item) => ({
        type: item.type ?? "",
        channel: item.channel ?? channel,
        ts: item.message?.ts ?? "",
      }));
      return { success: true, items, error: "" };
    } catch (err) {
      return { success: false, items: [], error: SlackManager.errorMessage(err) };
    }
  }

  /** search.messages requires a user token (xoxp-), not a bot token — Slack does not support this
   * endpoint for bot tokens, so this will fail with "not_allowed_token_type" unless the credential
   * happens to hold a user token. */
  private async searchMessages(query: string, count: number): Promise<SlackSearchMessagesResult> {
    try {
      const res = await this.client.search.messages({ query, count: count || 20 });
      const matches = (res.messages?.matches ?? []).map((m) => ({ channel: m.channel?.id ?? "", user: m.user ?? "", text: m.text ?? "", ts: m.ts ?? "" }));
      return { success: true, matches, error: "" };
    } catch (err) {
      return { success: false, matches: [], error: SlackManager.errorMessage(err) };
    }
  }

  private async getTeamInfo(): Promise<SlackTeamInfoResult> {
    try {
      const res = await this.client.team.info();
      return { success: true, id: res.team?.id ?? "", name: res.team?.name ?? "", domain: res.team?.domain ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", domain: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async listUserGroups(): Promise<SlackListUserGroupsResult> {
    try {
      const res = await this.client.usergroups.list();
      const groups = (res.usergroups ?? []).map((g) => ({ id: g.id ?? "", name: g.name ?? "", handle: g.handle ?? "" }));
      return { success: true, groups, error: "" };
    } catch (err) {
      return { success: false, groups: [], error: SlackManager.errorMessage(err) };
    }
  }

  private async createUserGroup(name: string, handle: string): Promise<SlackCreateUserGroupResult> {
    try {
      const res = await this.client.usergroups.create({ name, handle: handle || undefined });
      return { success: true, id: res.usergroup?.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async updateUserGroup(usergroup: string, name: string, handle: string): Promise<SlackOpResult> {
    try {
      await this.client.usergroups.update({ usergroup, ...(name ? { name } : {}), ...(handle ? { handle } : {}) });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async updateUserGroupUsers(usergroup: string, userIds: string): Promise<SlackOpResult> {
    try {
      await this.client.usergroups.users.update({ usergroup, users: normalizeCommaList(userIds) });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }

  private async addReminder(text: string, time: string, user: string): Promise<SlackAddReminderResult> {
    try {
      const res = await this.client.reminders.add({ text, time, ...(user ? { user } : {}) });
      return { success: true, reminderId: res.reminder?.id ?? "", error: "" };
    } catch (err) {
      return { success: false, reminderId: "", error: SlackManager.errorMessage(err) };
    }
  }

  private async listReminders(): Promise<SlackListRemindersResult> {
    try {
      const res = await this.client.reminders.list();
      const reminders = (res.reminders ?? []).map((r) => ({ id: r.id ?? "", text: r.text ?? "", time: r.time ?? 0 }));
      return { success: true, reminders, error: "" };
    } catch (err) {
      return { success: false, reminders: [], error: SlackManager.errorMessage(err) };
    }
  }

  private async deleteReminder(reminderId: string): Promise<SlackOpResult> {
    try {
      await this.client.reminders.delete({ reminder: reminderId });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SlackManager.errorMessage(err) };
    }
  }
}
