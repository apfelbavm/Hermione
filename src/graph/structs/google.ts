import { registerStructType } from "../engine/structRegistry";
import { i18n } from "@i18n";

// Same struct-array pattern as structs/microsoft365.ts/dropbox.ts/github.ts: every "list X" result
// is an array of same-shaped resource objects (see the lib/google*Manager.ts result interfaces),
// so each gets a registered struct type instead of an opaque "object" array element type.
export const AUTH_TOKENS_STRUCT_TYPE = "googleAuthTokens";
export const DRIVE_FILE_STRUCT_TYPE = "googleDriveFile";
export const DRIVE_PERMISSION_STRUCT_TYPE = "googleDrivePermission";
export const GMAIL_MESSAGE_STRUCT_TYPE = "googleGmailMessage";
export const GMAIL_LABEL_STRUCT_TYPE = "googleGmailLabel";
export const CALENDAR_EVENT_STRUCT_TYPE = "googleCalendarEvent";
export const CALENDAR_ENTRY_STRUCT_TYPE = "googleCalendarEntry";
export const ADMIN_USER_STRUCT_TYPE = "googleAdminUser";
export const ADMIN_GROUP_STRUCT_TYPE = "googleAdminGroup";

registerStructType({
  id: AUTH_TOKENS_STRUCT_TYPE,
  label: i18n.nodes.google.authTokens.label,
  category: "Google",
  fields: [
    { id: "accessToken", label: i18n.nodes.google.__shared.pin_access_token, type: "string", defaultValue: "" },
    { id: "refreshToken", label: i18n.nodes.google.__shared.pin_refresh_token, type: "string", defaultValue: "" },
    { id: "expiresIn", label: i18n.nodes.google.__shared.pin_expires_in, type: "number", defaultValue: 0 },
  ],
});

registerStructType({
  id: DRIVE_FILE_STRUCT_TYPE,
  label: i18n.nodes.google.googleDriveFile.label,
  category: "Google",
  fields: [
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.google.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "mimeType", label: i18n.nodes.google.__shared.pin_mime_type, type: "string", defaultValue: "" },
    { id: "isFolder", label: i18n.nodes.google.__shared.pin_is_folder, type: "boolean", defaultValue: false },
    { id: "size", label: i18n.nodes.google.__shared.pin_size, type: "number", defaultValue: 0 },
    { id: "webViewLink", label: i18n.nodes.google.__shared.pin_web_view_link, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: DRIVE_PERMISSION_STRUCT_TYPE,
  label: i18n.nodes.google.googleDrivePermission.label,
  category: "Google",
  fields: [
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "type", label: i18n.nodes.google.__shared.pin_type, type: "string", defaultValue: "" },
    { id: "role", label: i18n.nodes.google.__shared.pin_role, type: "string", defaultValue: "" },
    { id: "emailAddress", label: i18n.nodes.google.__shared.pin_email, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: GMAIL_MESSAGE_STRUCT_TYPE,
  label: i18n.nodes.google.googleGmailMessage.label,
  category: "Google",
  fields: [
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "threadId", label: i18n.nodes.google.__shared.pin_thread_id, type: "string", defaultValue: "" },
    { id: "subject", label: i18n.nodes.google.__shared.pin_subject, type: "string", defaultValue: "" },
    { id: "from", label: i18n.nodes.google.__shared.pin_from, type: "string", defaultValue: "" },
    { id: "snippet", label: i18n.nodes.google.__shared.pin_snippet, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: GMAIL_LABEL_STRUCT_TYPE,
  label: i18n.nodes.google.googleGmailLabel.label,
  category: "Google",
  fields: [
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.google.__shared.pin_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CALENDAR_EVENT_STRUCT_TYPE,
  label: i18n.nodes.google.googleCalendarEvent.label,
  category: "Google",
  fields: [
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "summary", label: i18n.nodes.google.__shared.pin_summary, type: "string", defaultValue: "" },
    { id: "start", label: i18n.nodes.google.__shared.pin_start, type: "string", defaultValue: "" },
    { id: "end", label: i18n.nodes.google.__shared.pin_end, type: "string", defaultValue: "" },
    { id: "htmlLink", label: i18n.nodes.google.__shared.pin_web_view_link, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CALENDAR_ENTRY_STRUCT_TYPE,
  label: i18n.nodes.google.googleCalendarEntry.label,
  category: "Google",
  fields: [
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "summary", label: i18n.nodes.google.__shared.pin_summary, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: ADMIN_USER_STRUCT_TYPE,
  label: i18n.nodes.google.googleAdminUser.label,
  category: "Google",
  fields: [
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "primaryEmail", label: i18n.nodes.google.__shared.pin_email, type: "string", defaultValue: "" },
    { id: "fullName", label: i18n.nodes.google.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "suspended", label: i18n.nodes.google.__shared.pin_suspended, type: "boolean", defaultValue: false },
  ],
});

registerStructType({
  id: ADMIN_GROUP_STRUCT_TYPE,
  label: i18n.nodes.google.googleAdminGroup.label,
  category: "Google",
  fields: [
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "email", label: i18n.nodes.google.__shared.pin_email, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.google.__shared.pin_name, type: "string", defaultValue: "" },
  ],
});
