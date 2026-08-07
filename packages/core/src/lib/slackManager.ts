/** Thin wrapper around Slack's official @slack/web-api SDK's WebClient. Every method calls a single
 * WebClient route and turns either a successful result or a thrown error (the SDK's own errors carry
 * Slack's error code at `err.data.error`, see slackErrorMessage below) into the same plain
 * {success, error} shape every other provider manager in this repo returns (see lib/dropboxManager.ts). */

import { WebClient } from "@slack/web-api";

function slackErrorMessage(err: unknown): string {
  const data = (err as { data?: { error?: string } } | undefined)?.data;
  if (data?.error) return data.error;
  return err instanceof Error ? err.message : String(err);
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

export class SlackManager {
  private readonly client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  // ---- Messaging (chat.*) ----

  async postMessage(channel: string, text: string, threadTs: string): Promise<SlackMessageResult> {
    try {
      const res = await this.client.chat.postMessage({ channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) });
      return { success: true, channel: res.channel ?? "", ts: res.ts ?? "", error: "" };
    } catch (err) {
      return { success: false, channel: "", ts: "", error: slackErrorMessage(err) };
    }
  }

  async updateMessage(channel: string, ts: string, text: string): Promise<SlackMessageResult> {
    try {
      const res = await this.client.chat.update({ channel, ts, text });
      return { success: true, channel: res.channel ?? "", ts: res.ts ?? "", error: "" };
    } catch (err) {
      return { success: false, channel: "", ts: "", error: slackErrorMessage(err) };
    }
  }

  async deleteMessage(channel: string, ts: string): Promise<SlackOpResult> {
    try {
      await this.client.chat.delete({ channel, ts });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async postEphemeral(channel: string, user: string, text: string): Promise<SlackPostEphemeralResult> {
    try {
      const res = await this.client.chat.postEphemeral({ channel, user, text });
      return { success: true, messageTs: res.message_ts ?? "", error: "" };
    } catch (err) {
      return { success: false, messageTs: "", error: slackErrorMessage(err) };
    }
  }

  async scheduleMessage(channel: string, text: string, postAt: number): Promise<SlackScheduleMessageResult> {
    try {
      const res = await this.client.chat.scheduleMessage({ channel, text, post_at: postAt });
      return { success: true, scheduledMessageId: res.scheduled_message_id ?? "", postAt: Number(res.post_at ?? postAt), error: "" };
    } catch (err) {
      return { success: false, scheduledMessageId: "", postAt: 0, error: slackErrorMessage(err) };
    }
  }

  // ---- Conversations (conversations.*) ----

  async listConversations(limit: number, types: string): Promise<SlackListConversationsResult> {
    try {
      const res = await this.client.conversations.list({ limit: limit || 200, types: types || "public_channel,private_channel" });
      const channels = (res.channels ?? []).map((c) => ({ id: c.id ?? "", name: c.name ?? "", isPrivate: Boolean(c.is_private), isArchived: Boolean(c.is_archived) }));
      return { success: true, channels, error: "" };
    } catch (err) {
      return { success: false, channels: [], error: slackErrorMessage(err) };
    }
  }

  async createConversation(name: string, isPrivate: boolean): Promise<SlackCreateConversationResult> {
    try {
      const res = await this.client.conversations.create({ name, is_private: isPrivate });
      return { success: true, channelId: res.channel?.id ?? "", name: res.channel?.name ?? "", error: "" };
    } catch (err) {
      return { success: false, channelId: "", name: "", error: slackErrorMessage(err) };
    }
  }

  async archiveConversation(channel: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.archive({ channel });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async inviteToConversation(channel: string, userIds: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.invite({ channel, users: normalizeCommaList(userIds) });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async kickFromConversation(channel: string, user: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.kick({ channel, user });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async joinConversation(channel: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.join({ channel });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async getConversationHistory(channel: string, limit: number): Promise<SlackConversationHistoryResult> {
    try {
      const res = await this.client.conversations.history({ channel, limit: limit || 100 });
      const messages = (res.messages ?? []).map((m) => ({ ts: m.ts ?? "", user: m.user ?? "", text: m.text ?? "" }));
      return { success: true, messages, error: "" };
    } catch (err) {
      return { success: false, messages: [], error: slackErrorMessage(err) };
    }
  }

  async getConversationInfo(channel: string): Promise<SlackConversationInfoResult> {
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
      return { success: false, id: "", name: "", isPrivate: false, isArchived: false, topic: "", purpose: "", memberCount: 0, error: slackErrorMessage(err) };
    }
  }

  async getConversationMembers(channel: string, limit: number): Promise<SlackConversationMembersResult> {
    try {
      const res = await this.client.conversations.members({ channel, limit: limit || 200 });
      return { success: true, memberIds: res.members ?? [], error: "" };
    } catch (err) {
      return { success: false, memberIds: [], error: slackErrorMessage(err) };
    }
  }

  async setConversationTopic(channel: string, topic: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.setTopic({ channel, topic });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async setConversationPurpose(channel: string, purpose: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.setPurpose({ channel, purpose });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async renameConversation(channel: string, name: string): Promise<SlackOpResult> {
    try {
      await this.client.conversations.rename({ channel, name });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  // ---- Users (users.*) ----

  async listUsers(limit: number): Promise<SlackListUsersResult> {
    try {
      const res = await this.client.users.list({ limit: limit || 200 });
      const users = (res.members ?? []).map((u) => ({ id: u.id ?? "", name: u.name ?? "", realName: u.profile?.real_name ?? "", email: u.profile?.email ?? "", isBot: Boolean(u.is_bot) }));
      return { success: true, users, error: "" };
    } catch (err) {
      return { success: false, users: [], error: slackErrorMessage(err) };
    }
  }

  async getUserInfo(user: string): Promise<SlackUserInfoResult> {
    try {
      const res = await this.client.users.info({ user });
      const u = res.user;
      return { success: true, id: u?.id ?? "", name: u?.name ?? "", realName: u?.profile?.real_name ?? "", email: u?.profile?.email ?? "", isBot: Boolean(u?.is_bot), error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", realName: "", email: "", isBot: false, error: slackErrorMessage(err) };
    }
  }

  async lookupUserByEmail(email: string): Promise<SlackLookupUserResult> {
    try {
      const res = await this.client.users.lookupByEmail({ email });
      const u = res.user;
      return { success: true, id: u?.id ?? "", name: u?.name ?? "", realName: u?.profile?.real_name ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", realName: "", error: slackErrorMessage(err) };
    }
  }

  // ---- Files (files.*) ----

  async uploadFile(channel: string, filename: string, content: string, encoding: "utf8" | "base64", initialComment: string): Promise<SlackUploadFileResult> {
    try {
      const bytes = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
      const res = await this.client.files.uploadV2({ channel_id: channel || undefined, filename, file: bytes, initial_comment: initialComment || undefined });
      const completions = (res as unknown as { files?: { files?: { id?: string; permalink?: string }[] }[] }).files ?? [];
      const file = completions[0]?.files?.[0];
      return { success: true, fileId: file?.id ?? "", permalink: file?.permalink ?? "", error: "" };
    } catch (err) {
      return { success: false, fileId: "", permalink: "", error: slackErrorMessage(err) };
    }
  }

  async deleteFile(fileId: string): Promise<SlackOpResult> {
    try {
      await this.client.files.delete({ file: fileId });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async getFileInfo(fileId: string): Promise<SlackFileInfoResult> {
    try {
      const res = await this.client.files.info({ file: fileId });
      const f = res.file;
      return { success: true, id: f?.id ?? "", name: f?.name ?? "", title: f?.title ?? "", permalink: f?.permalink ?? "", size: f?.size ?? 0, error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", title: "", permalink: "", size: 0, error: slackErrorMessage(err) };
    }
  }

  // ---- Reactions (reactions.*) ----

  async addReaction(channel: string, timestamp: string, emojiName: string): Promise<SlackOpResult> {
    try {
      await this.client.reactions.add({ channel, timestamp, name: emojiName });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async removeReaction(channel: string, timestamp: string, emojiName: string): Promise<SlackOpResult> {
    try {
      await this.client.reactions.remove({ channel, timestamp, name: emojiName });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  // ---- Pins (pins.*) ----

  async addPin(channel: string, timestamp: string): Promise<SlackOpResult> {
    try {
      await this.client.pins.add({ channel, timestamp });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async removePin(channel: string, timestamp: string): Promise<SlackOpResult> {
    try {
      await this.client.pins.remove({ channel, timestamp });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  /** pins.list's typed response is missing the `channel`/`message` fields the real API actually
   * returns for message-type pins (see https://docs.slack.dev/reference/methods/pins.list), so the
   * items are cast to the shape Slack documents. */
  async listPins(channel: string): Promise<SlackListPinsResult> {
    try {
      const res = await this.client.pins.list({ channel });
      const items = ((res.items ?? []) as unknown as { type?: string; channel?: string; message?: { ts?: string } }[]).map((item) => ({
        type: item.type ?? "",
        channel: item.channel ?? channel,
        ts: item.message?.ts ?? "",
      }));
      return { success: true, items, error: "" };
    } catch (err) {
      return { success: false, items: [], error: slackErrorMessage(err) };
    }
  }

  // ---- Search ----

  /** search.messages requires a user token (xoxp-), not a bot token — Slack does not support this
   * endpoint for bot tokens, so this will fail with "not_allowed_token_type" unless the credential
   * happens to hold a user token. */
  async searchMessages(query: string, count: number): Promise<SlackSearchMessagesResult> {
    try {
      const res = await this.client.search.messages({ query, count: count || 20 });
      const matches = (res.messages?.matches ?? []).map((m) => ({ channel: m.channel?.id ?? "", user: m.user ?? "", text: m.text ?? "", ts: m.ts ?? "" }));
      return { success: true, matches, error: "" };
    } catch (err) {
      return { success: false, matches: [], error: slackErrorMessage(err) };
    }
  }

  // ---- Team ----

  async getTeamInfo(): Promise<SlackTeamInfoResult> {
    try {
      const res = await this.client.team.info();
      return { success: true, id: res.team?.id ?? "", name: res.team?.name ?? "", domain: res.team?.domain ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", domain: "", error: slackErrorMessage(err) };
    }
  }

  // ---- User groups (usergroups.*) ----

  async listUserGroups(): Promise<SlackListUserGroupsResult> {
    try {
      const res = await this.client.usergroups.list();
      const groups = (res.usergroups ?? []).map((g) => ({ id: g.id ?? "", name: g.name ?? "", handle: g.handle ?? "" }));
      return { success: true, groups, error: "" };
    } catch (err) {
      return { success: false, groups: [], error: slackErrorMessage(err) };
    }
  }

  async createUserGroup(name: string, handle: string): Promise<SlackCreateUserGroupResult> {
    try {
      const res = await this.client.usergroups.create({ name, handle: handle || undefined });
      return { success: true, id: res.usergroup?.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: slackErrorMessage(err) };
    }
  }

  async updateUserGroup(usergroup: string, name: string, handle: string): Promise<SlackOpResult> {
    try {
      await this.client.usergroups.update({ usergroup, ...(name ? { name } : {}), ...(handle ? { handle } : {}) });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  async updateUserGroupUsers(usergroup: string, userIds: string): Promise<SlackOpResult> {
    try {
      await this.client.usergroups.users.update({ usergroup, users: normalizeCommaList(userIds) });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }

  // ---- Reminders (reminders.*) ----

  async addReminder(text: string, time: string, user: string): Promise<SlackAddReminderResult> {
    try {
      const res = await this.client.reminders.add({ text, time, ...(user ? { user } : {}) });
      return { success: true, reminderId: res.reminder?.id ?? "", error: "" };
    } catch (err) {
      return { success: false, reminderId: "", error: slackErrorMessage(err) };
    }
  }

  async listReminders(): Promise<SlackListRemindersResult> {
    try {
      const res = await this.client.reminders.list();
      const reminders = (res.reminders ?? []).map((r) => ({ id: r.id ?? "", text: r.text ?? "", time: r.time ?? 0 }));
      return { success: true, reminders, error: "" };
    } catch (err) {
      return { success: false, reminders: [], error: slackErrorMessage(err) };
    }
  }

  async deleteReminder(reminderId: string): Promise<SlackOpResult> {
    try {
      await this.client.reminders.delete({ reminder: reminderId });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: slackErrorMessage(err) };
    }
  }
}
