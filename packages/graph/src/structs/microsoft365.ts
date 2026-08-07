import { registerStructType } from "@hermione/graph/engine/structRegistry";
import { i18n } from "@i18n";

// Same struct-array pattern as structs/azureStorage.ts/dropbox.ts/github.ts: every "list X" result
// is an array of same-shaped Graph resource objects (see graphManager.ts's Graph* interfaces), so
// each gets a registered struct type instead of an opaque "object" array element type.
export const USER_STRUCT_TYPE = "graphUser";
export const GROUP_STRUCT_TYPE = "graphGroup";
export const MESSAGE_STRUCT_TYPE = "graphMessage";
export const EVENT_STRUCT_TYPE = "graphEvent";
export const DRIVE_ITEM_STRUCT_TYPE = "graphDriveItem";
export const TEAM_STRUCT_TYPE = "graphTeam";
export const CHANNEL_STRUCT_TYPE = "graphChannel";
export const CHANNEL_MESSAGE_STRUCT_TYPE = "graphChannelMessage";
export const CHAT_STRUCT_TYPE = "graphChat";
export const SITE_STRUCT_TYPE = "graphSite";
export const SITE_LIST_STRUCT_TYPE = "graphSiteList";
export const LIST_ITEM_STRUCT_TYPE = "graphListItem";
export const WORKSHEET_STRUCT_TYPE = "graphWorksheet";
export const TABLE_STRUCT_TYPE = "graphTable";
export const PLANNER_PLAN_STRUCT_TYPE = "graphPlannerPlan";
export const PLANNER_TASK_STRUCT_TYPE = "graphPlannerTask";
export const TODO_LIST_STRUCT_TYPE = "graphTodoList";
export const TODO_TASK_STRUCT_TYPE = "graphTodoTask";
export const CONTACT_STRUCT_TYPE = "graphContact";
export const APPLICATION_STRUCT_TYPE = "graphApplication";
export const DIRECTORY_ROLE_STRUCT_TYPE = "graphDirectoryRole";
export const TRENDING_DOCUMENT_STRUCT_TYPE = "graphTrendingDocument";
export const MESSAGE_DETAIL_STRUCT_TYPE = "graphMessageDetail";

registerStructType({
  id: USER_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphUser.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.microsoft365.__shared.pin_display_name, type: "string", defaultValue: "" },
    { id: "userPrincipalName", label: i18n.nodes.microsoft365.__shared.pin_user_principal_name, type: "string", defaultValue: "" },
    { id: "mail", label: i18n.nodes.microsoft365.__shared.pin_mail, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: GROUP_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphGroup.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.microsoft365.__shared.pin_display_name, type: "string", defaultValue: "" },
    { id: "mailNickname", label: i18n.nodes.microsoft365.__shared.pin_mail_nickname, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: MESSAGE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphMessage.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "subject", label: i18n.nodes.microsoft365.__shared.pin_subject, type: "string", defaultValue: "" },
    { id: "from", label: i18n.nodes.microsoft365.getMessage.pin_from, type: "string", defaultValue: "" },
    { id: "receivedDateTime", label: i18n.nodes.microsoft365.getMessage.pin_received_date_time, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: EVENT_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphEvent.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "subject", label: i18n.nodes.microsoft365.__shared.pin_subject, type: "string", defaultValue: "" },
    { id: "start", label: i18n.nodes.microsoft365.createEvent.pin_start, type: "string", defaultValue: "" },
    { id: "end", label: i18n.nodes.microsoft365.createEvent.pin_end, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: DRIVE_ITEM_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphDriveItem.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.microsoft365.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "isFolder", label: i18n.nodes.microsoft365.__shared.pin_is_folder, type: "boolean", defaultValue: false },
    { id: "size", label: i18n.nodes.microsoft365.__shared.pin_size, type: "number", defaultValue: 0 },
  ],
});

registerStructType({
  id: TEAM_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTeam.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.microsoft365.__shared.pin_display_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CHANNEL_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphChannel.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.microsoft365.__shared.pin_display_name, type: "string", defaultValue: "" },
    { id: "description", label: i18n.nodes.microsoft365.__shared.pin_description, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CHANNEL_MESSAGE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphChannelMessage.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "from", label: i18n.nodes.microsoft365.getMessage.pin_from, type: "string", defaultValue: "" },
    { id: "content", label: i18n.nodes.microsoft365.__shared.pin_content, type: "string", defaultValue: "" },
    { id: "createdDateTime", label: i18n.nodes.microsoft365.__shared.pin_created_date_time, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CHAT_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphChat.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "topic", label: i18n.nodes.microsoft365.__shared.pin_topic, type: "string", defaultValue: "" },
    { id: "chatType", label: i18n.nodes.microsoft365.__shared.pin_chat_type, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: SITE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphSite.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.microsoft365.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "webUrl", label: i18n.nodes.microsoft365.__shared.pin_web_url, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: SITE_LIST_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphSiteList.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.microsoft365.__shared.pin_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: LIST_ITEM_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphListItem.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "fieldsJson", label: i18n.nodes.microsoft365.createListItem.pin_fields_json, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: WORKSHEET_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphWorksheet.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.microsoft365.__shared.pin_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: TABLE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTable.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.microsoft365.__shared.pin_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: PLANNER_PLAN_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphPlannerPlan.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "title", label: i18n.nodes.microsoft365.__shared.pin_title, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: PLANNER_TASK_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphPlannerTask.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "title", label: i18n.nodes.microsoft365.__shared.pin_title, type: "string", defaultValue: "" },
    { id: "percentComplete", label: i18n.nodes.microsoft365.__shared.pin_percent_complete, type: "number", defaultValue: 0 },
  ],
});

registerStructType({
  id: TODO_LIST_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTodoList.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.microsoft365.__shared.pin_display_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: TODO_TASK_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTodoTask.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "title", label: i18n.nodes.microsoft365.__shared.pin_title, type: "string", defaultValue: "" },
    { id: "status", label: i18n.nodes.microsoft365.__shared.pin_status, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CONTACT_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphContact.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.microsoft365.__shared.pin_display_name, type: "string", defaultValue: "" },
    { id: "email", label: i18n.nodes.microsoft365.__shared.pin_email, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: APPLICATION_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphApplication.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.microsoft365.__shared.pin_display_name, type: "string", defaultValue: "" },
    { id: "appId", label: i18n.nodes.microsoft365.__shared.pin_app_id, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: DIRECTORY_ROLE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphDirectoryRole.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.microsoft365.__shared.pin_display_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: TRENDING_DOCUMENT_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTrendingDocument.label,
  category: "Microsoft 365",
  fields: [
    { id: "id", label: i18n.nodes.microsoft365.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.microsoft365.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "webUrl", label: i18n.nodes.microsoft365.__shared.pin_web_url, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: MESSAGE_DETAIL_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphMessageDetail.label,
  category: "Microsoft 365",
  fields: [
    { id: "subject", label: i18n.nodes.microsoft365.__shared.pin_subject, type: "string", defaultValue: "" },
    { id: "from", label: i18n.nodes.microsoft365.getMessage.pin_from, type: "string", defaultValue: "" },
    { id: "bodyContent", label: i18n.nodes.microsoft365.getMessage.pin_body_content, type: "string", defaultValue: "" },
    { id: "receivedDateTime", label: i18n.nodes.microsoft365.getMessage.pin_received_date_time, type: "string", defaultValue: "" },
  ],
});
