import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
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
const BODY_TYPE_OPTIONS = ["text", "html"];

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

/** Registers a Microsoft 365 node whose `execute` only needs the resolved GraphManager plus raw
 * pin inputs — resolving the credential and shaping the failure-path outputs is identical for
 * every node, so only the pin list and the actual manager call differ per operation. */
function registerGraphNode(def: { type: string; label: string; description: string; pins: unknown[]; failureOutputs: Record<string, unknown>; call: (manager: GraphManager, inputs: Record<string, unknown>) => Promise<Record<string, unknown>> }) {
  registerNode({
    type: def.type,
    label: def.label,
    description: def.description,
    group: GROUP_NAME,
    colorCategory: NodeColorCategory.Integration,
    pins: def.pins as never,
    latent: true,
    execute: async ({ inputs, ctx }) => {
      const resolved = resolveGraphCredential(ctx, String(inputs.credentialName ?? ""));
      if (!resolved.ok) {
        return {
          nextExec: "exec-out",
          outputs: {
            success: false,
            ...def.failureOutputs,
            error: resolved.error,
          },
        };
      }
      const result = await def.call(managerFor(resolved.data), inputs);
      return { nextExec: "exec-out", outputs: result };
    },
  });
}

registerGraphNode({
  type: "microsoft365.listUsers",
  label: i18n.nodes.microsoft365.listUsers.label,
  description: i18n.nodes.microsoft365.listUsers.description,
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
      type: "object",
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ],
  failureOutputs: { users: [] },
  call: (manager, inputs) => manager.listUsers(String(inputs.filter ?? ""), Number(inputs.top ?? 100)),
});

registerGraphNode({
  type: "microsoft365.getUser",
  label: i18n.nodes.microsoft365.getUser.label,
  description: i18n.nodes.microsoft365.getUser.description,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "id",
      label: i18n.nodes.microsoft365.__shared.pin_id,
      type: "string",
      direction: "output",
    },
    {
      id: "displayName",
      label: i18n.nodes.microsoft365.__shared.pin_display_name,
      type: "string",
      direction: "output",
    },
    {
      id: "userPrincipalName",
      label: i18n.nodes.microsoft365.__shared.pin_user_principal_name,
      type: "string",
      direction: "output",
    },
    {
      id: "mail",
      label: i18n.nodes.microsoft365.__shared.pin_mail,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ],
  failureOutputs: { id: "", displayName: "", userPrincipalName: "", mail: "" },
  call: (manager, inputs) => manager.getUser(String(inputs.userId ?? "")),
});

registerGraphNode({
  type: "microsoft365.createUser",
  label: i18n.nodes.microsoft365.createUser.label,
  description: i18n.nodes.microsoft365.createUser.description,
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
  ],
  failureOutputs: { id: "" },
  call: (manager, inputs) => manager.createUser(String(inputs.displayName ?? ""), String(inputs.userPrincipalName ?? ""), String(inputs.mailNickname ?? ""), String(inputs.password ?? ""), Boolean(inputs.forceChangePasswordNextSignIn)),
});

registerGraphNode({
  type: "microsoft365.updateUser",
  label: i18n.nodes.microsoft365.updateUser.label,
  description: i18n.nodes.microsoft365.updateUser.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) => manager.updateUser(String(inputs.userId ?? ""), String(inputs.propertiesJson ?? "{}")),
});

registerGraphNode({
  type: "microsoft365.deleteUser",
  label: i18n.nodes.microsoft365.deleteUser.label,
  description: i18n.nodes.microsoft365.deleteUser.description,
  pins: [execInOutPins().execIn, credentialNamePin(), userIdPin(), execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  failureOutputs: {},
  call: (manager, inputs) => manager.deleteUser(String(inputs.userId ?? "")),
});

registerGraphNode({
  type: "microsoft365.listGroups",
  label: i18n.nodes.microsoft365.listGroups.label,
  description: i18n.nodes.microsoft365.listGroups.description,
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
      type: "object",
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ],
  failureOutputs: { groups: [] },
  call: (manager, inputs) => manager.listGroups(String(inputs.filter ?? ""), Number(inputs.top ?? 100)),
});

registerGraphNode({
  type: "microsoft365.createGroup",
  label: i18n.nodes.microsoft365.createGroup.label,
  description: i18n.nodes.microsoft365.createGroup.description,
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
  ],
  failureOutputs: { id: "" },
  call: (manager, inputs) => manager.createGroup(String(inputs.displayName ?? ""), String(inputs.mailNickname ?? ""), String(inputs.description ?? ""), Boolean(inputs.securityEnabled), Boolean(inputs.mailEnabled)),
});

registerGraphNode({
  type: "microsoft365.deleteGroup",
  label: i18n.nodes.microsoft365.deleteGroup.label,
  description: i18n.nodes.microsoft365.deleteGroup.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) => manager.deleteGroup(String(inputs.groupId ?? "")),
});

registerGraphNode({
  type: "microsoft365.addGroupMember",
  label: i18n.nodes.microsoft365.addGroupMember.label,
  description: i18n.nodes.microsoft365.addGroupMember.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) => manager.addGroupMember(String(inputs.groupId ?? ""), String(inputs.userId ?? "")),
});

registerGraphNode({
  type: "microsoft365.sendMail",
  label: i18n.nodes.microsoft365.sendMail.label,
  description: i18n.nodes.microsoft365.sendMail.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) =>
    manager.sendMail(String(inputs.userId ?? ""), (Array.isArray(inputs.to) ? inputs.to : []).map(String), String(inputs.subject ?? ""), String(inputs.body ?? ""), inputs.bodyType === "html" ? "html" : "text", Boolean(inputs.saveToSentItems)),
});

registerGraphNode({
  type: "microsoft365.listMessages",
  label: i18n.nodes.microsoft365.listMessages.label,
  description: i18n.nodes.microsoft365.listMessages.description,
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
      type: "object",
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ],
  failureOutputs: { messages: [] },
  call: (manager, inputs) => manager.listMessages(String(inputs.userId ?? ""), Number(inputs.top ?? 25), String(inputs.filter ?? "")),
});

registerGraphNode({
  type: "microsoft365.getMessage",
  label: i18n.nodes.microsoft365.getMessage.label,
  description: i18n.nodes.microsoft365.getMessage.description,
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
      id: "subject",
      label: i18n.nodes.microsoft365.__shared.pin_subject,
      type: "string",
      direction: "output",
    },
    {
      id: "from",
      label: i18n.nodes.microsoft365.getMessage.pin_from,
      type: "string",
      direction: "output",
    },
    {
      id: "bodyContent",
      label: i18n.nodes.microsoft365.getMessage.pin_body_content,
      type: "string",
      direction: "output",
    },
    {
      id: "receivedDateTime",
      label: i18n.nodes.microsoft365.getMessage.pin_received_date_time,
      type: "string",
      direction: "output",
    },
    execInOutPins().error,
  ],
  failureOutputs: {
    subject: "",
    from: "",
    bodyContent: "",
    receivedDateTime: "",
  },
  call: (manager, inputs) => manager.getMessage(String(inputs.userId ?? ""), String(inputs.messageId ?? "")),
});

registerGraphNode({
  type: "microsoft365.deleteMessage",
  label: i18n.nodes.microsoft365.deleteMessage.label,
  description: i18n.nodes.microsoft365.deleteMessage.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) => manager.deleteMessage(String(inputs.userId ?? ""), String(inputs.messageId ?? "")),
});

registerGraphNode({
  type: "microsoft365.listEvents",
  label: i18n.nodes.microsoft365.listEvents.label,
  description: i18n.nodes.microsoft365.listEvents.description,
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
      type: "object",
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ],
  failureOutputs: { events: [] },
  call: (manager, inputs) => manager.listEvents(String(inputs.userId ?? ""), Number(inputs.top ?? 25)),
});

registerGraphNode({
  type: "microsoft365.createEvent",
  label: i18n.nodes.microsoft365.createEvent.label,
  description: i18n.nodes.microsoft365.createEvent.description,
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
  ],
  failureOutputs: { id: "" },
  call: (manager, inputs) =>
    manager.createEvent(
      String(inputs.userId ?? ""),
      String(inputs.subject ?? ""),
      String(inputs.start ?? ""),
      String(inputs.end ?? ""),
      String(inputs.timeZone ?? "UTC"),
      String(inputs.body ?? ""),
      (Array.isArray(inputs.attendees) ? inputs.attendees : []).map(String),
    ),
});

registerGraphNode({
  type: "microsoft365.deleteEvent",
  label: i18n.nodes.microsoft365.deleteEvent.label,
  description: i18n.nodes.microsoft365.deleteEvent.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) => manager.deleteEvent(String(inputs.userId ?? ""), String(inputs.eventId ?? "")),
});

registerGraphNode({
  type: "microsoft365.listDriveItems",
  label: i18n.nodes.microsoft365.listDriveItems.label,
  description: i18n.nodes.microsoft365.listDriveItems.description,
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
      type: "object",
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ],
  failureOutputs: { items: [] },
  call: (manager, inputs) => manager.listDriveItems(String(inputs.userId ?? ""), String(inputs.folderPath ?? "")),
});

registerGraphNode({
  type: "microsoft365.downloadFile",
  label: i18n.nodes.microsoft365.downloadFile.label,
  description: i18n.nodes.microsoft365.downloadFile.description,
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
  ],
  failureOutputs: { content: "" },
  call: (manager, inputs) => manager.downloadFile(String(inputs.userId ?? ""), String(inputs.filePath ?? ""), inputs.encoding === "base64" ? "base64" : "utf8"),
});

registerGraphNode({
  type: "microsoft365.uploadFile",
  label: i18n.nodes.microsoft365.uploadFile.label,
  description: i18n.nodes.microsoft365.uploadFile.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) => manager.uploadFile(String(inputs.userId ?? ""), String(inputs.filePath ?? ""), String(inputs.content ?? ""), inputs.encoding === "base64" ? "base64" : "utf8"),
});

registerGraphNode({
  type: "microsoft365.deleteDriveItem",
  label: i18n.nodes.microsoft365.deleteDriveItem.label,
  description: i18n.nodes.microsoft365.deleteDriveItem.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) => manager.deleteDriveItem(String(inputs.userId ?? ""), String(inputs.path ?? "")),
});

registerGraphNode({
  type: "microsoft365.listJoinedTeams",
  label: i18n.nodes.microsoft365.listJoinedTeams.label,
  description: i18n.nodes.microsoft365.listJoinedTeams.description,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    userIdPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "teams",
      label: i18n.nodes.microsoft365.listJoinedTeams.pin_teams,
      type: "object",
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ],
  failureOutputs: { teams: [] },
  call: (manager, inputs) => manager.listJoinedTeams(String(inputs.userId ?? "")),
});

registerGraphNode({
  type: "microsoft365.sendChannelMessage",
  label: i18n.nodes.microsoft365.sendChannelMessage.label,
  description: i18n.nodes.microsoft365.sendChannelMessage.description,
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
  ],
  failureOutputs: {},
  call: (manager, inputs) => manager.sendChannelMessage(String(inputs.teamId ?? ""), String(inputs.channelId ?? ""), String(inputs.message ?? "")),
});

registerGraphNode({
  type: "microsoft365.request",
  label: i18n.nodes.microsoft365.request.label,
  description: i18n.nodes.microsoft365.request.description,
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
  ],
  failureOutputs: { status: 0, data: undefined },
  call: (manager, inputs) => manager.rawRequest(String(inputs.method ?? "GET"), String(inputs.path ?? ""), String(inputs.bodyJson ?? "")),
});
