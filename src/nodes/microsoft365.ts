import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { registerStructType } from "../engine/structRegistry";
import { GraphManager } from "../lib/graphManager";
import type { MicrosoftGraphClientCredentialsData } from "../credentials/types";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over GraphManager (src/lib/graphManager.ts),
// which owns the actual Graph REST calls, token acquisition/refresh, and error normalization —
// this file only ever translates pins to method arguments and method results back to pins.
// Interpreter-only for now (no compileExecute/compileImports), same deferral as dropbox.ts/github.ts.
//
// Every operation node takes a Credential Name directly: each resolves the named vault entry and
// hands it to GraphManager.forCredential, which caches the client and mints/refreshes the app-only
// access token on demand — see graphManager.ts.

const GROUP_NAME = "Request.Microsoft365";
const GROUP_NAME_ONEDRIVE = "Request.Microsoft365 OneDrive";
const GROUP_NAME_TEAMS = "Request.Microsoft365 Teams";
const GROUP_NAME_MAIL = "Request.Microsoft365 Mail";
const GROUP_NAME_SHAREPOINT = "Request.Microsoft365 SharePoint";
const GROUP_NAME_EXCEL = "Request.Microsoft365 Excel";
const GROUP_NAME_TASKS = "Request.Microsoft365 Tasks";
const GROUP_NAME_ADMIN = "Request.Microsoft365 Admin";
const BODY_TYPE_OPTIONS = ["text", "html"];
const SHARING_LINK_TYPE_OPTIONS = ["view", "edit"];
const SHARING_LINK_SCOPE_OPTIONS = ["anonymous", "organization"];

// Same struct-array pattern as nodes/azureStorage.ts/dropbox.ts/github.ts: every "list X" result
// is an array of same-shaped Graph resource objects (see graphManager.ts's Graph* interfaces), so
// each gets a registered struct type instead of an opaque "object" array element type.
const USER_STRUCT_TYPE = "graphUser";
const GROUP_STRUCT_TYPE = "graphGroup";
const MESSAGE_STRUCT_TYPE = "graphMessage";
const EVENT_STRUCT_TYPE = "graphEvent";
const DRIVE_ITEM_STRUCT_TYPE = "graphDriveItem";
const TEAM_STRUCT_TYPE = "graphTeam";
const CHANNEL_STRUCT_TYPE = "graphChannel";
const CHANNEL_MESSAGE_STRUCT_TYPE = "graphChannelMessage";
const CHAT_STRUCT_TYPE = "graphChat";
const SITE_STRUCT_TYPE = "graphSite";
const SITE_LIST_STRUCT_TYPE = "graphSiteList";
const LIST_ITEM_STRUCT_TYPE = "graphListItem";
const WORKSHEET_STRUCT_TYPE = "graphWorksheet";
const TABLE_STRUCT_TYPE = "graphTable";
const PLANNER_PLAN_STRUCT_TYPE = "graphPlannerPlan";
const PLANNER_TASK_STRUCT_TYPE = "graphPlannerTask";
const TODO_LIST_STRUCT_TYPE = "graphTodoList";
const TODO_TASK_STRUCT_TYPE = "graphTodoTask";
const CONTACT_STRUCT_TYPE = "graphContact";
const APPLICATION_STRUCT_TYPE = "graphApplication";
const DIRECTORY_ROLE_STRUCT_TYPE = "graphDirectoryRole";
const TRENDING_DOCUMENT_STRUCT_TYPE = "graphTrendingDocument";
const MESSAGE_DETAIL_STRUCT_TYPE = "graphMessageDetail";

registerStructType({
  id: USER_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphUser.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "userPrincipalName",
      label: i18n.nodes.microsoft365.__shared.pin_user_principal_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "mail",
      label: i18n.nodes.microsoft365.__shared.pin_mail,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: GROUP_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphGroup.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "mailNickname",
      label: i18n.nodes.microsoft365.__shared.pin_mail_nickname,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: MESSAGE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphMessage.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "subject",
      label: i18n.nodes.microsoft365.__shared.pin_subject,
      type: "string",
      defaultValue: "",
    },
    {
      id: "from",
      label: i18n.nodes.microsoft365.getMessage.pin_from,
      type: "string",
      defaultValue: "",
    },
    {
      id: "receivedDateTime",
      label: i18n.nodes.microsoft365.getMessage.pin_received_date_time,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: EVENT_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphEvent.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "subject",
      label: i18n.nodes.microsoft365.__shared.pin_subject,
      type: "string",
      defaultValue: "",
    },
    {
      id: "start",
      label: i18n.nodes.microsoft365.createEvent.pin_start,
      type: "string",
      defaultValue: "",
    },
    {
      id: "end",
      label: i18n.nodes.microsoft365.createEvent.pin_end,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: DRIVE_ITEM_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphDriveItem.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "name",
      label: i18n.nodes.microsoft365.__shared.pin_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "isFolder",
      label: i18n.nodes.microsoft365.__shared.pin_is_folder,
      type: "boolean",
      defaultValue: false,
    },
    {
      id: "size",
      label: i18n.nodes.microsoft365.__shared.pin_size,
      type: "number",
      defaultValue: 0,
    },
  ],
});

registerStructType({
  id: TEAM_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTeam.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: CHANNEL_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphChannel.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "description",
      label: i18n.nodes.microsoft365.__shared.pin_description,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: CHANNEL_MESSAGE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphChannelMessage.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "from",
      label: i18n.nodes.microsoft365.getMessage.pin_from,
      type: "string",
      defaultValue: "",
    },
    {
      id: "content",
      label: i18n.nodes.microsoft365.__shared.pin_content,
      type: "string",
      defaultValue: "",
    },
    {
      id: "createdDateTime",
      label: i18n.nodes.microsoft365.__shared.pin_created_date_time,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: CHAT_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphChat.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "topic",
      label: i18n.nodes.microsoft365.__shared.pin_topic,
      type: "string",
      defaultValue: "",
    },
    {
      id: "chatType",
      label: i18n.nodes.microsoft365.__shared.pin_chat_type,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: SITE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphSite.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "name",
      label: i18n.nodes.microsoft365.__shared.pin_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "webUrl",
      label: i18n.nodes.microsoft365.__shared.pin_web_url,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: SITE_LIST_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphSiteList.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "name",
      label: i18n.nodes.microsoft365.__shared.pin_name,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: LIST_ITEM_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphListItem.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "fieldsJson",
      label: i18n.nodes.microsoft365.createListItem.pin_fields_json,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: WORKSHEET_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphWorksheet.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "name",
      label: i18n.nodes.microsoft365.__shared.pin_name,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: TABLE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTable.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "name",
      label: i18n.nodes.microsoft365.__shared.pin_name,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: PLANNER_PLAN_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphPlannerPlan.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "title",
      label: i18n.nodes.microsoft365.__shared.pin_title,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: PLANNER_TASK_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphPlannerTask.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "title",
      label: i18n.nodes.microsoft365.__shared.pin_title,
      type: "string",
      defaultValue: "",
    },
    {
      id: "percentComplete",
      label: i18n.nodes.microsoft365.__shared.pin_percent_complete,
      type: "number",
      defaultValue: 0,
    },
  ],
});

registerStructType({
  id: TODO_LIST_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTodoList.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: TODO_TASK_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTodoTask.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "title",
      label: i18n.nodes.microsoft365.__shared.pin_title,
      type: "string",
      defaultValue: "",
    },
    {
      id: "status",
      label: i18n.nodes.microsoft365.__shared.pin_status,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: CONTACT_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphContact.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "email",
      label: i18n.nodes.microsoft365.__shared.pin_email,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: APPLICATION_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphApplication.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "appId",
      label: i18n.nodes.microsoft365.__shared.pin_app_id,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: DIRECTORY_ROLE_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphDirectoryRole.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: TRENDING_DOCUMENT_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphTrendingDocument.label,
  fields: [
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "name",
      label: i18n.nodes.microsoft365.__shared.pin_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "webUrl",
      label: i18n.nodes.microsoft365.__shared.pin_web_url,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: MESSAGE_DETAIL_STRUCT_TYPE,
  label: i18n.nodes.microsoft365.graphMessageDetail.label,
  fields: [
    {
      id: "subject",
      label: i18n.nodes.microsoft365.__shared.pin_subject,
      type: "string",
      defaultValue: "",
    },
    {
      id: "from",
      label: i18n.nodes.microsoft365.getMessage.pin_from,
      type: "string",
      defaultValue: "",
    },
    {
      id: "bodyContent",
      label: i18n.nodes.microsoft365.getMessage.pin_body_content,
      type: "string",
      defaultValue: "",
    },
    {
      id: "receivedDateTime",
      label: i18n.nodes.microsoft365.getMessage.pin_received_date_time,
      type: "string",
      defaultValue: "",
    },
  ],
});

function credentialNamePin() {
  return {
    id: "credentialName",
    label: i18n.nodes.microsoft365.__shared.pin_credential_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

function userIdPin(label: string = i18n.nodes.microsoft365.__shared.pin_user_id) {
  return {
    id: "userId",
    label,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

/** Shared by every Microsoft 365 node — looks up a named Credential Vault entry and returns its
 * tenant/client fields, or a clear error if the name is wrong/missing. */
function resolveGraphCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: MicrosoftGraphClientCredentialsData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential)
    return {
      ok: false,
      error: `Credential "${credentialName}" not found in the vault`,
    };
  if (credential.type !== "microsoftGraphClientCredentials")
    return {
      ok: false,
      error: `Credential "${credentialName}" is not a Microsoft Graph credential`,
    };
  return {
    ok: true,
    data: credential.data as MicrosoftGraphClientCredentialsData,
  };
}

function managerFor(data: MicrosoftGraphClientCredentialsData): GraphManager {
  return GraphManager.forCredential(data.tenantId, data.clientId, data.clientSecret);
}

function execInOutPins() {
  return {
    execIn: {
      id: "exec-in",
      label: "",
      type: "exec" as const,
      direction: "input" as const,
    },
    execOut: {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec" as const,
      direction: "output" as const,
    },
    success: {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean" as const,
      direction: "output" as const,
    },
    error: {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string" as const,
      direction: "output" as const,
    },
  };
}

registerNode({
  type: "microsoft365.listUsers",
  label: i18n.nodes.microsoft365.listUsers.label,
  description: i18n.nodes.microsoft365.listUsers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "filter",
      label: i18n.nodes.microsoft365.__shared.pin_filter,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "top",
      label: i18n.nodes.microsoft365.__shared.pin_top,
      type: "number",
      direction: "input",
      defaultValue: 100,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "users",
      label: i18n.nodes.microsoft365.listUsers.pin_users,
      type: "struct",
      subType: USER_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, users: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listUsers(String(inputs.filter ?? ""), Number(inputs.top ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.getUser",
  label: i18n.nodes.microsoft365.getUser.label,
  description: i18n.nodes.microsoft365.getUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "user",
      label: i18n.nodes.microsoft365.graphUser.label,
      type: "struct",
      subType: USER_STRUCT_TYPE,
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          user: { id: "", displayName: "", userPrincipalName: "", mail: "" },
          error: resolved.error,
        },
      };
    }
    const result = await managerFor(resolved.data).getUser(String(inputs.userId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        user: {
          id: result.id,
          displayName: result.displayName,
          userPrincipalName: result.userPrincipalName,
          mail: result.mail,
        },
        error: result.error,
      },
    };
  },
});

registerNode({
  type: "microsoft365.createUser",
  label: i18n.nodes.microsoft365.createUser.label,
  description: i18n.nodes.microsoft365.createUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "userPrincipalName",
      label: i18n.nodes.microsoft365.__shared.pin_user_principal_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "mailNickname",
      label: i18n.nodes.microsoft365.__shared.pin_mail_nickname,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "password",
      label: i18n.nodes.microsoft365.createUser.pin_password,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "forceChangePasswordNextSignIn",
      label: i18n.nodes.microsoft365.createUser.pin_force_change_password,
      type: "boolean",
      direction: "input",
      defaultValue: true,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createUser(String(inputs.displayName ?? ""), String(inputs.userPrincipalName ?? ""), String(inputs.mailNickname ?? ""), String(inputs.password ?? ""), Boolean(inputs.forceChangePasswordNextSignIn));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.updateUser",
  label: i18n.nodes.microsoft365.updateUser.label,
  description: i18n.nodes.microsoft365.updateUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "propertiesJson",
      label: i18n.nodes.microsoft365.updateUser.pin_properties_json,
      type: "string",
      direction: "input",
      defaultValue: "{}",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).updateUser(String(inputs.userId ?? ""), String(inputs.propertiesJson ?? "{}"));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.deleteUser",
  label: i18n.nodes.microsoft365.deleteUser.label,
  description: i18n.nodes.microsoft365.deleteUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), userIdPin(), execInOutPins().execOut, execInOutPins().success, execInOutPins().error] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).deleteUser(String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listGroups",
  label: i18n.nodes.microsoft365.listGroups.label,
  description: i18n.nodes.microsoft365.listGroups.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "filter",
      label: i18n.nodes.microsoft365.__shared.pin_filter,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "top",
      label: i18n.nodes.microsoft365.__shared.pin_top,
      type: "number",
      direction: "input",
      defaultValue: 100,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "groups",
      label: i18n.nodes.microsoft365.listGroups.pin_groups,
      type: "struct",
      subType: GROUP_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, groups: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listGroups(String(inputs.filter ?? ""), Number(inputs.top ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createGroup",
  label: i18n.nodes.microsoft365.createGroup.label,
  description: i18n.nodes.microsoft365.createGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "mailNickname",
      label: i18n.nodes.microsoft365.__shared.pin_mail_nickname,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "description",
      label: i18n.nodes.microsoft365.__shared.pin_description,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "securityEnabled",
      label: i18n.nodes.microsoft365.createGroup.pin_security_enabled,
      type: "boolean",
      direction: "input",
      defaultValue: true,
    },
    {
      id: "mailEnabled",
      label: i18n.nodes.microsoft365.createGroup.pin_mail_enabled,
      type: "boolean",
      direction: "input",
      defaultValue: false,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createGroup(String(inputs.displayName ?? ""), String(inputs.mailNickname ?? ""), String(inputs.description ?? ""), Boolean(inputs.securityEnabled), Boolean(inputs.mailEnabled));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.deleteGroup",
  label: i18n.nodes.microsoft365.deleteGroup.label,
  description: i18n.nodes.microsoft365.deleteGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "groupId",
      label: i18n.nodes.microsoft365.__shared.pin_group_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).deleteGroup(String(inputs.groupId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.addGroupMember",
  label: i18n.nodes.microsoft365.addGroupMember.label,
  description: i18n.nodes.microsoft365.addGroupMember.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "groupId",
      label: i18n.nodes.microsoft365.__shared.pin_group_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).addGroupMember(String(inputs.groupId ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.sendMail",
  label: i18n.nodes.microsoft365.sendMail.label,
  description: i18n.nodes.microsoft365.sendMail.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(i18n.nodes.microsoft365.sendMail.pin_from_user_id),
    {
      id: "to",
      label: i18n.nodes.microsoft365.sendMail.pin_to,
      type: "string",
      container: "array",
      direction: "input",
      defaultValue: [],
    },
    {
      id: "subject",
      label: i18n.nodes.microsoft365.__shared.pin_subject,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "body",
      label: i18n.nodes.microsoft365.__shared.pin_body,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "bodyType",
      label: i18n.nodes.microsoft365.__shared.pin_body_type,
      type: "string",
      direction: "input",
      defaultValue: BODY_TYPE_OPTIONS[0],
      options: BODY_TYPE_OPTIONS,
    },
    {
      id: "saveToSentItems",
      label: i18n.nodes.microsoft365.sendMail.pin_save_to_sent_items,
      type: "boolean",
      direction: "input",
      defaultValue: true,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).sendMail(
      String(inputs.userId ?? ""),
      (Array.isArray(inputs.to) ? inputs.to : []).map(String),
      String(inputs.subject ?? ""),
      String(inputs.body ?? ""),
      inputs.bodyType === "html" ? "html" : "text",
      Boolean(inputs.saveToSentItems),
    );
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listMessages",
  label: i18n.nodes.microsoft365.listMessages.label,
  description: i18n.nodes.microsoft365.listMessages.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "top",
      label: i18n.nodes.microsoft365.__shared.pin_top,
      type: "number",
      direction: "input",
      defaultValue: 25,
    },
    {
      id: "filter",
      label: i18n.nodes.microsoft365.__shared.pin_filter,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "messages",
      label: i18n.nodes.microsoft365.listMessages.pin_messages,
      type: "struct",
      subType: MESSAGE_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, messages: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listMessages(String(inputs.userId ?? ""), Number(inputs.top ?? 25), String(inputs.filter ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.getMessage",
  label: i18n.nodes.microsoft365.getMessage.label,
  description: i18n.nodes.microsoft365.getMessage.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "messageId",
      label: i18n.nodes.microsoft365.__shared.pin_message_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "message",
      label: i18n.nodes.microsoft365.graphMessageDetail.label,
      type: "struct",
      subType: MESSAGE_DETAIL_STRUCT_TYPE,
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          message: {
            subject: "",
            from: "",
            bodyContent: "",
            receivedDateTime: "",
          },
          error: resolved.error,
        },
      };
    }
    const result = await managerFor(resolved.data).getMessage(String(inputs.userId ?? ""), String(inputs.messageId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        message: {
          subject: result.subject,
          from: result.from,
          bodyContent: result.bodyContent,
          receivedDateTime: result.receivedDateTime,
        },
        error: result.error,
      },
    };
  },
});

registerNode({
  type: "microsoft365.deleteMessage",
  label: i18n.nodes.microsoft365.deleteMessage.label,
  description: i18n.nodes.microsoft365.deleteMessage.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "messageId",
      label: i18n.nodes.microsoft365.__shared.pin_message_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).deleteMessage(String(inputs.userId ?? ""), String(inputs.messageId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listEvents",
  label: i18n.nodes.microsoft365.listEvents.label,
  description: i18n.nodes.microsoft365.listEvents.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "top",
      label: i18n.nodes.microsoft365.__shared.pin_top,
      type: "number",
      direction: "input",
      defaultValue: 25,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "events",
      label: i18n.nodes.microsoft365.listEvents.pin_events,
      type: "struct",
      subType: EVENT_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, events: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listEvents(String(inputs.userId ?? ""), Number(inputs.top ?? 25));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createEvent",
  label: i18n.nodes.microsoft365.createEvent.label,
  description: i18n.nodes.microsoft365.createEvent.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "subject",
      label: i18n.nodes.microsoft365.__shared.pin_subject,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "start",
      label: i18n.nodes.microsoft365.createEvent.pin_start,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "end",
      label: i18n.nodes.microsoft365.createEvent.pin_end,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "timeZone",
      label: i18n.nodes.microsoft365.createEvent.pin_time_zone,
      type: "string",
      direction: "input",
      defaultValue: "UTC",
    },
    {
      id: "body",
      label: i18n.nodes.microsoft365.__shared.pin_body,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "attendees",
      label: i18n.nodes.microsoft365.createEvent.pin_attendees,
      type: "string",
      container: "array",
      direction: "input",
      defaultValue: [],
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createEvent(
      String(inputs.userId ?? ""),
      String(inputs.subject ?? ""),
      String(inputs.start ?? ""),
      String(inputs.end ?? ""),
      String(inputs.timeZone ?? "UTC"),
      String(inputs.body ?? ""),
      (Array.isArray(inputs.attendees) ? inputs.attendees : []).map(String),
    );
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.deleteEvent",
  label: i18n.nodes.microsoft365.deleteEvent.label,
  description: i18n.nodes.microsoft365.deleteEvent.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "eventId",
      label: i18n.nodes.microsoft365.__shared.pin_event_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).deleteEvent(String(inputs.userId ?? ""), String(inputs.eventId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listDriveItems",
  label: i18n.nodes.microsoft365.listDriveItems.label,
  description: i18n.nodes.microsoft365.listDriveItems.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "folderPath",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "items",
      label: i18n.nodes.microsoft365.listDriveItems.pin_items,
      type: "struct",
      subType: DRIVE_ITEM_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, items: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listDriveItems(String(inputs.userId ?? ""), String(inputs.folderPath ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.downloadFile",
  label: i18n.nodes.microsoft365.downloadFile.label,
  description: i18n.nodes.microsoft365.downloadFile.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "filePath",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "encoding",
      label: i18n.nodes.microsoft365.__shared.pin_encoding,
      type: "string",
      direction: "input",
      defaultValue: "utf8",
      options: ["utf8", "base64"],
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "content",
      label: i18n.nodes.microsoft365.__shared.pin_content,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, content: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).downloadFile(String(inputs.userId ?? ""), String(inputs.filePath ?? ""), inputs.encoding === "base64" ? "base64" : "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.uploadFile",
  label: i18n.nodes.microsoft365.uploadFile.label,
  description: i18n.nodes.microsoft365.uploadFile.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "filePath",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "content",
      label: i18n.nodes.microsoft365.__shared.pin_content,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "encoding",
      label: i18n.nodes.microsoft365.__shared.pin_encoding,
      type: "string",
      direction: "input",
      defaultValue: "utf8",
      options: ["utf8", "base64"],
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).uploadFile(String(inputs.userId ?? ""), String(inputs.filePath ?? ""), String(inputs.content ?? ""), inputs.encoding === "base64" ? "base64" : "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.deleteDriveItem",
  label: i18n.nodes.microsoft365.deleteDriveItem.label,
  description: i18n.nodes.microsoft365.deleteDriveItem.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).deleteDriveItem(String(inputs.userId ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listJoinedTeams",
  label: i18n.nodes.microsoft365.listJoinedTeams.label,
  description: i18n.nodes.microsoft365.listJoinedTeams.description,
  group: GROUP_NAME_TEAMS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "teams",
      label: i18n.nodes.microsoft365.listJoinedTeams.pin_teams,
      type: "struct",
      subType: TEAM_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, teams: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listJoinedTeams(String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.sendChannelMessage",
  label: i18n.nodes.microsoft365.sendChannelMessage.label,
  description: i18n.nodes.microsoft365.sendChannelMessage.description,
  group: GROUP_NAME_TEAMS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "teamId",
      label: i18n.nodes.microsoft365.sendChannelMessage.pin_team_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "channelId",
      label: i18n.nodes.microsoft365.sendChannelMessage.pin_channel_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "message",
      label: i18n.nodes.microsoft365.__shared.pin_body,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).sendChannelMessage(String(inputs.teamId ?? ""), String(inputs.channelId ?? ""), String(inputs.message ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.request",
  label: i18n.nodes.microsoft365.request.label,
  description: i18n.nodes.microsoft365.request.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "method",
      label: i18n.nodes.microsoft365.request.pin_method,
      type: "string",
      direction: "input",
      defaultValue: "GET",
      options: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    },
    {
      id: "path",
      label: i18n.nodes.microsoft365.request.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "bodyJson",
      label: i18n.nodes.microsoft365.request.pin_body_json,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "status",
      label: i18n.nodes.__shared.pin_status,
      type: "number",
      direction: "output",
    },
    {
      id: "data",
      label: i18n.nodes.microsoft365.request.pin_data,
      type: "object",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          status: 0,
          data: undefined,
          error: resolved.error,
        },
      };
    }
    const result = await managerFor(resolved.data).rawRequest(String(inputs.method ?? "GET"), String(inputs.path ?? ""), String(inputs.bodyJson ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listChannels",
  label: i18n.nodes.microsoft365.listChannels.label,
  description: i18n.nodes.microsoft365.listChannels.description,
  group: GROUP_NAME_TEAMS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "teamId",
      label: i18n.nodes.microsoft365.sendChannelMessage.pin_team_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "channels",
      label: i18n.nodes.microsoft365.listChannels.pin_channels,
      type: "struct",
      subType: CHANNEL_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, channels: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listChannels(String(inputs.teamId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createChannel",
  label: i18n.nodes.microsoft365.createChannel.label,
  description: i18n.nodes.microsoft365.createChannel.description,
  group: GROUP_NAME_TEAMS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "teamId",
      label: i18n.nodes.microsoft365.sendChannelMessage.pin_team_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "description",
      label: i18n.nodes.microsoft365.__shared.pin_description,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createChannel(String(inputs.teamId ?? ""), String(inputs.displayName ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listChannelMessages",
  label: i18n.nodes.microsoft365.listChannelMessages.label,
  description: i18n.nodes.microsoft365.listChannelMessages.description,
  group: GROUP_NAME_TEAMS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "teamId",
      label: i18n.nodes.microsoft365.sendChannelMessage.pin_team_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "channelId",
      label: i18n.nodes.microsoft365.sendChannelMessage.pin_channel_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "top",
      label: i18n.nodes.microsoft365.__shared.pin_top,
      type: "number",
      direction: "input",
      defaultValue: 25,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "messages",
      label: i18n.nodes.microsoft365.listChannelMessages.pin_messages,
      type: "struct",
      subType: CHANNEL_MESSAGE_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, messages: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listChannelMessages(String(inputs.teamId ?? ""), String(inputs.channelId ?? ""), Number(inputs.top ?? 25));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listChats",
  label: i18n.nodes.microsoft365.listChats.label,
  description: i18n.nodes.microsoft365.listChats.description,
  group: GROUP_NAME_TEAMS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "chats",
      label: i18n.nodes.microsoft365.listChats.pin_chats,
      type: "struct",
      subType: CHAT_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, chats: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listChats(String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.sendChatMessage",
  label: i18n.nodes.microsoft365.sendChatMessage.label,
  description: i18n.nodes.microsoft365.sendChatMessage.description,
  group: GROUP_NAME_TEAMS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "chatId",
      label: i18n.nodes.microsoft365.sendChatMessage.pin_chat_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "message",
      label: i18n.nodes.microsoft365.__shared.pin_body,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).sendChatMessage(String(inputs.chatId ?? ""), String(inputs.message ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listSites",
  label: i18n.nodes.microsoft365.listSites.label,
  description: i18n.nodes.microsoft365.listSites.description,
  group: GROUP_NAME_SHAREPOINT,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "search",
      label: i18n.nodes.microsoft365.listSites.pin_search,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "sites",
      label: i18n.nodes.microsoft365.listSites.pin_sites,
      type: "struct",
      subType: SITE_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, sites: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listSites(String(inputs.search ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listSiteLists",
  label: i18n.nodes.microsoft365.listSiteLists.label,
  description: i18n.nodes.microsoft365.listSiteLists.description,
  group: GROUP_NAME_SHAREPOINT,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "siteId",
      label: i18n.nodes.microsoft365.__shared.pin_site_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "lists",
      label: i18n.nodes.microsoft365.listSiteLists.pin_lists,
      type: "struct",
      subType: SITE_LIST_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, lists: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listSiteLists(String(inputs.siteId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listListItems",
  label: i18n.nodes.microsoft365.listListItems.label,
  description: i18n.nodes.microsoft365.listListItems.description,
  group: GROUP_NAME_SHAREPOINT,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "siteId",
      label: i18n.nodes.microsoft365.__shared.pin_site_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "listId",
      label: i18n.nodes.microsoft365.__shared.pin_list_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "items",
      label: i18n.nodes.microsoft365.listListItems.pin_items,
      type: "struct",
      subType: LIST_ITEM_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, items: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listListItems(String(inputs.siteId ?? ""), String(inputs.listId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createListItem",
  label: i18n.nodes.microsoft365.createListItem.label,
  description: i18n.nodes.microsoft365.createListItem.description,
  group: GROUP_NAME_SHAREPOINT,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "siteId",
      label: i18n.nodes.microsoft365.__shared.pin_site_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "listId",
      label: i18n.nodes.microsoft365.__shared.pin_list_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "fieldsJson",
      label: i18n.nodes.microsoft365.createListItem.pin_fields_json,
      type: "string",
      direction: "input",
      defaultValue: "{}",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createListItem(String(inputs.siteId ?? ""), String(inputs.listId ?? ""), String(inputs.fieldsJson ?? "{}"));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createFolder",
  label: i18n.nodes.microsoft365.createFolder.label,
  description: i18n.nodes.microsoft365.createFolder.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "parentPath",
      label: i18n.nodes.microsoft365.createFolder.pin_parent_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "name",
      label: i18n.nodes.microsoft365.__shared.pin_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createFolder(String(inputs.userId ?? ""), String(inputs.parentPath ?? ""), String(inputs.name ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.moveDriveItem",
  label: i18n.nodes.microsoft365.moveDriveItem.label,
  description: i18n.nodes.microsoft365.moveDriveItem.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "destinationFolderPath",
      label: i18n.nodes.microsoft365.__shared.pin_destination_folder_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).moveDriveItem(String(inputs.userId ?? ""), String(inputs.path ?? ""), String(inputs.destinationFolderPath ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.copyDriveItem",
  label: i18n.nodes.microsoft365.copyDriveItem.label,
  description: i18n.nodes.microsoft365.copyDriveItem.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "destinationFolderPath",
      label: i18n.nodes.microsoft365.__shared.pin_destination_folder_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "newName",
      label: i18n.nodes.microsoft365.copyDriveItem.pin_new_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).copyDriveItem(String(inputs.userId ?? ""), String(inputs.path ?? ""), String(inputs.destinationFolderPath ?? ""), String(inputs.newName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createSharingLink",
  label: i18n.nodes.microsoft365.createSharingLink.label,
  description: i18n.nodes.microsoft365.createSharingLink.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "type",
      label: i18n.nodes.microsoft365.createSharingLink.pin_type,
      type: "string",
      direction: "input",
      defaultValue: SHARING_LINK_TYPE_OPTIONS[0],
      options: SHARING_LINK_TYPE_OPTIONS,
    },
    {
      id: "scope",
      label: i18n.nodes.microsoft365.createSharingLink.pin_scope,
      type: "string",
      direction: "input",
      defaultValue: SHARING_LINK_SCOPE_OPTIONS[1],
      options: SHARING_LINK_SCOPE_OPTIONS,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "link",
      label: i18n.nodes.microsoft365.createSharingLink.pin_link,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, link: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createSharingLink(String(inputs.userId ?? ""), String(inputs.path ?? ""), String(inputs.type ?? "view"), String(inputs.scope ?? "organization"));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.searchDriveItems",
  label: i18n.nodes.microsoft365.searchDriveItems.label,
  description: i18n.nodes.microsoft365.searchDriveItems.description,
  group: GROUP_NAME_ONEDRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "query",
      label: i18n.nodes.microsoft365.searchDriveItems.pin_query,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "items",
      label: i18n.nodes.microsoft365.listDriveItems.pin_items,
      type: "struct",
      subType: DRIVE_ITEM_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, items: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).searchDriveItems(String(inputs.userId ?? ""), String(inputs.query ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listWorksheets",
  label: i18n.nodes.microsoft365.listWorksheets.label,
  description: i18n.nodes.microsoft365.listWorksheets.description,
  group: GROUP_NAME_EXCEL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "worksheets",
      label: i18n.nodes.microsoft365.listWorksheets.pin_worksheets,
      type: "struct",
      subType: WORKSHEET_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, worksheets: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listWorksheets(String(inputs.userId ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.getWorksheetRange",
  label: i18n.nodes.microsoft365.getWorksheetRange.label,
  description: i18n.nodes.microsoft365.getWorksheetRange.description,
  group: GROUP_NAME_EXCEL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "worksheetName",
      label: i18n.nodes.microsoft365.__shared.pin_worksheet_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "address",
      label: i18n.nodes.microsoft365.__shared.pin_address,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "valuesJson",
      label: i18n.nodes.microsoft365.__shared.pin_values_json,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, valuesJson: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).getWorksheetRange(String(inputs.userId ?? ""), String(inputs.path ?? ""), String(inputs.worksheetName ?? ""), String(inputs.address ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.setWorksheetRange",
  label: i18n.nodes.microsoft365.setWorksheetRange.label,
  description: i18n.nodes.microsoft365.setWorksheetRange.description,
  group: GROUP_NAME_EXCEL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "worksheetName",
      label: i18n.nodes.microsoft365.__shared.pin_worksheet_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "address",
      label: i18n.nodes.microsoft365.__shared.pin_address,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "valuesJson",
      label: i18n.nodes.microsoft365.__shared.pin_values_json,
      type: "string",
      direction: "input",
      defaultValue: "[]",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).setWorksheetRange(String(inputs.userId ?? ""), String(inputs.path ?? ""), String(inputs.worksheetName ?? ""), String(inputs.address ?? ""), String(inputs.valuesJson ?? "[]"));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listTables",
  label: i18n.nodes.microsoft365.listTables.label,
  description: i18n.nodes.microsoft365.listTables.description,
  group: GROUP_NAME_EXCEL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "tables",
      label: i18n.nodes.microsoft365.listTables.pin_tables,
      type: "struct",
      subType: TABLE_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, tables: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listTables(String(inputs.userId ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.addTableRow",
  label: i18n.nodes.microsoft365.addTableRow.label,
  description: i18n.nodes.microsoft365.addTableRow.description,
  group: GROUP_NAME_EXCEL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "path",
      label: i18n.nodes.microsoft365.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "tableName",
      label: i18n.nodes.microsoft365.addTableRow.pin_table_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "valuesJson",
      label: i18n.nodes.microsoft365.__shared.pin_values_json,
      type: "string",
      direction: "input",
      defaultValue: "[]",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).addTableRow(String(inputs.userId ?? ""), String(inputs.path ?? ""), String(inputs.tableName ?? ""), String(inputs.valuesJson ?? "[]"));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listPlannerPlans",
  label: i18n.nodes.microsoft365.listPlannerPlans.label,
  description: i18n.nodes.microsoft365.listPlannerPlans.description,
  group: GROUP_NAME_TASKS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "groupId",
      label: i18n.nodes.microsoft365.__shared.pin_group_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "plans",
      label: i18n.nodes.microsoft365.listPlannerPlans.pin_plans,
      type: "struct",
      subType: PLANNER_PLAN_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, plans: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listPlannerPlans(String(inputs.groupId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createPlannerTask",
  label: i18n.nodes.microsoft365.createPlannerTask.label,
  description: i18n.nodes.microsoft365.createPlannerTask.description,
  group: GROUP_NAME_TASKS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "planId",
      label: i18n.nodes.microsoft365.createPlannerTask.pin_plan_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "bucketId",
      label: i18n.nodes.microsoft365.createPlannerTask.pin_bucket_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "title",
      label: i18n.nodes.microsoft365.__shared.pin_title,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createPlannerTask(String(inputs.planId ?? ""), String(inputs.bucketId ?? ""), String(inputs.title ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listPlannerTasks",
  label: i18n.nodes.microsoft365.listPlannerTasks.label,
  description: i18n.nodes.microsoft365.listPlannerTasks.description,
  group: GROUP_NAME_TASKS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "planId",
      label: i18n.nodes.microsoft365.createPlannerTask.pin_plan_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "tasks",
      label: i18n.nodes.microsoft365.listPlannerTasks.pin_tasks,
      type: "struct",
      subType: PLANNER_TASK_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, tasks: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listPlannerTasks(String(inputs.planId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listTodoLists",
  label: i18n.nodes.microsoft365.listTodoLists.label,
  description: i18n.nodes.microsoft365.listTodoLists.description,
  group: GROUP_NAME_TASKS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "lists",
      label: i18n.nodes.microsoft365.listTodoLists.pin_lists,
      type: "struct",
      subType: TODO_LIST_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, lists: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listTodoLists(String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createTodoTask",
  label: i18n.nodes.microsoft365.createTodoTask.label,
  description: i18n.nodes.microsoft365.createTodoTask.description,
  group: GROUP_NAME_TASKS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "listId",
      label: i18n.nodes.microsoft365.__shared.pin_list_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "title",
      label: i18n.nodes.microsoft365.__shared.pin_title,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createTodoTask(String(inputs.userId ?? ""), String(inputs.listId ?? ""), String(inputs.title ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listTodoTasks",
  label: i18n.nodes.microsoft365.listTodoTasks.label,
  description: i18n.nodes.microsoft365.listTodoTasks.description,
  group: GROUP_NAME_TASKS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "listId",
      label: i18n.nodes.microsoft365.__shared.pin_list_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "tasks",
      label: i18n.nodes.microsoft365.listTodoTasks.pin_tasks,
      type: "struct",
      subType: TODO_TASK_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, tasks: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listTodoTasks(String(inputs.userId ?? ""), String(inputs.listId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listContacts",
  label: i18n.nodes.microsoft365.listContacts.label,
  description: i18n.nodes.microsoft365.listContacts.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "contacts",
      label: i18n.nodes.microsoft365.listContacts.pin_contacts,
      type: "struct",
      subType: CONTACT_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, contacts: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listContacts(String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createContact",
  label: i18n.nodes.microsoft365.createContact.label,
  description: i18n.nodes.microsoft365.createContact.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "email",
      label: i18n.nodes.microsoft365.__shared.pin_mail,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createContact(String(inputs.userId ?? ""), String(inputs.displayName ?? ""), String(inputs.email ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.deleteContact",
  label: i18n.nodes.microsoft365.deleteContact.label,
  description: i18n.nodes.microsoft365.deleteContact.description,
  group: GROUP_NAME_MAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    {
      id: "contactId",
      label: i18n.nodes.microsoft365.deleteContact.pin_contact_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).deleteContact(String(inputs.userId ?? ""), String(inputs.contactId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listApplications",
  label: i18n.nodes.microsoft365.listApplications.label,
  description: i18n.nodes.microsoft365.listApplications.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "filter",
      label: i18n.nodes.microsoft365.__shared.pin_filter,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "applications",
      label: i18n.nodes.microsoft365.listApplications.pin_applications,
      type: "struct",
      subType: APPLICATION_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, applications: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listApplications(String(inputs.filter ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listDirectoryRoles",
  label: i18n.nodes.microsoft365.listDirectoryRoles.label,
  description: i18n.nodes.microsoft365.listDirectoryRoles.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "roles",
      label: i18n.nodes.microsoft365.listDirectoryRoles.pin_roles,
      type: "struct",
      subType: DIRECTORY_ROLE_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, roles: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listDirectoryRoles();
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listUserLicenses",
  label: i18n.nodes.microsoft365.listUserLicenses.label,
  description: i18n.nodes.microsoft365.listUserLicenses.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "skuIds",
      label: i18n.nodes.microsoft365.listUserLicenses.pin_sku_ids,
      type: "string",
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, skuIds: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listUserLicenses(String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.createSubscription",
  label: i18n.nodes.microsoft365.createSubscription.label,
  description: i18n.nodes.microsoft365.createSubscription.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "resource",
      label: i18n.nodes.microsoft365.createSubscription.pin_resource,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "changeType",
      label: i18n.nodes.microsoft365.createSubscription.pin_change_type,
      type: "string",
      direction: "input",
      defaultValue: "updated",
    },
    {
      id: "notificationUrl",
      label: i18n.nodes.microsoft365.createSubscription.pin_notification_url,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "expirationDateTime",
      label: i18n.nodes.microsoft365.createSubscription.pin_expiration_date_time,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, id: "", error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).createSubscription(String(inputs.resource ?? ""), String(inputs.changeType ?? "updated"), String(inputs.notificationUrl ?? ""), String(inputs.expirationDateTime ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.deleteSubscription",
  label: i18n.nodes.microsoft365.deleteSubscription.label,
  description: i18n.nodes.microsoft365.deleteSubscription.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    {
      id: "subscriptionId",
      label: i18n.nodes.microsoft365.deleteSubscription.pin_subscription_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).deleteSubscription(String(inputs.subscriptionId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "microsoft365.listTrendingDocuments",
  label: i18n.nodes.microsoft365.listTrendingDocuments.label,
  description: i18n.nodes.microsoft365.listTrendingDocuments.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "documents",
      label: i18n.nodes.microsoft365.listTrendingDocuments.pin_documents,
      type: "struct",
      subType: TRENDING_DOCUMENT_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ] as never,
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, documents: [], error: resolved.error },
      };
    }
    const result = await managerFor(resolved.data).listTrendingDocuments(String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});
