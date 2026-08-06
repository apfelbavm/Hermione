import { registerStructType } from "../engine/structRegistry";
import { i18n } from "@i18n";

export const CHANNEL_STRUCT_TYPE = "slackChannel";
export const USER_STRUCT_TYPE = "slackUser";

registerStructType({
  id: CHANNEL_STRUCT_TYPE,
  label: i18n.nodes.slack.channel.label,
  category: "Slack",
  fields: [
    { id: "id", label: i18n.nodes.slack.channel.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.slack.channel.pin_name, type: "string", defaultValue: "" },
    { id: "isPrivate", label: i18n.nodes.slack.channel.pin_is_private, type: "boolean", defaultValue: false },
    { id: "isArchived", label: i18n.nodes.slack.channel.pin_is_archived, type: "boolean", defaultValue: false },
  ],
});

registerStructType({
  id: USER_STRUCT_TYPE,
  label: i18n.nodes.slack.user.label,
  category: "Slack",
  fields: [
    { id: "id", label: i18n.nodes.slack.user.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.slack.user.pin_name, type: "string", defaultValue: "" },
    { id: "realName", label: i18n.nodes.slack.user.pin_real_name, type: "string", defaultValue: "" },
    { id: "email", label: i18n.nodes.slack.user.pin_email, type: "string", defaultValue: "" },
    { id: "isBot", label: i18n.nodes.slack.user.pin_is_bot, type: "boolean", defaultValue: false },
  ],
});

export const MESSAGE_STRUCT_TYPE = "slackMessage";
export const PIN_ITEM_STRUCT_TYPE = "slackPinItem";
export const SEARCH_MATCH_STRUCT_TYPE = "slackSearchMatch";
export const USER_GROUP_STRUCT_TYPE = "slackUserGroup";
export const REMINDER_STRUCT_TYPE = "slackReminder";

registerStructType({
  id: MESSAGE_STRUCT_TYPE,
  label: i18n.nodes.slack.message.label,
  category: "Slack",
  fields: [
    { id: "ts", label: i18n.nodes.slack.message.pin_ts, type: "string", defaultValue: "" },
    { id: "user", label: i18n.nodes.slack.message.pin_user, type: "string", defaultValue: "" },
    { id: "text", label: i18n.nodes.slack.message.pin_text, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: PIN_ITEM_STRUCT_TYPE,
  label: i18n.nodes.slack.pinItem.label,
  category: "Slack",
  fields: [
    { id: "type", label: i18n.nodes.slack.pinItem.pin_type, type: "string", defaultValue: "" },
    { id: "channel", label: i18n.nodes.slack.pinItem.pin_channel, type: "string", defaultValue: "" },
    { id: "ts", label: i18n.nodes.slack.pinItem.pin_ts, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: SEARCH_MATCH_STRUCT_TYPE,
  label: i18n.nodes.slack.searchMatch.label,
  category: "Slack",
  fields: [
    { id: "channel", label: i18n.nodes.slack.searchMatch.pin_channel, type: "string", defaultValue: "" },
    { id: "user", label: i18n.nodes.slack.searchMatch.pin_user, type: "string", defaultValue: "" },
    { id: "text", label: i18n.nodes.slack.searchMatch.pin_text, type: "string", defaultValue: "" },
    { id: "ts", label: i18n.nodes.slack.searchMatch.pin_ts, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: USER_GROUP_STRUCT_TYPE,
  label: i18n.nodes.slack.userGroup.label,
  category: "Slack",
  fields: [
    { id: "id", label: i18n.nodes.slack.userGroup.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.slack.userGroup.pin_name, type: "string", defaultValue: "" },
    { id: "handle", label: i18n.nodes.slack.userGroup.pin_handle, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: REMINDER_STRUCT_TYPE,
  label: i18n.nodes.slack.reminder.label,
  category: "Slack",
  fields: [
    { id: "id", label: i18n.nodes.slack.reminder.pin_id, type: "string", defaultValue: "" },
    { id: "text", label: i18n.nodes.slack.reminder.pin_text, type: "string", defaultValue: "" },
    { id: "time", label: i18n.nodes.slack.reminder.pin_time, type: "number", defaultValue: 0 },
  ],
});
