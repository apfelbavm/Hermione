import { registerStructType } from "../../engine/structRegistry";
import { i18n } from "@i18n";

export const AUTH_TOKENS_STRUCT_TYPE = "dropboxAuthTokens";
export const METADATA_STRUCT_TYPE = "dropboxMetadata";
export const REVISION_STRUCT_TYPE = "dropboxRevision";
export const ACCOUNT_STRUCT_TYPE = "dropboxAccount";
export const SPACE_USAGE_STRUCT_TYPE = "dropboxSpaceUsage";

registerStructType({
  id: AUTH_TOKENS_STRUCT_TYPE,
  label: i18n.nodes.dropbox.authTokens.label,
  category: "Dropbox",
  fields: [
    {
      id: "accessToken",
      label: i18n.nodes.dropbox.__shared.pin_access_token,
      type: "string",
      defaultValue: "",
    },
    {
      id: "refreshToken",
      label: i18n.nodes.dropbox.authorize.pin_refresh_token,
      type: "string",
      defaultValue: "",
    },
    {
      id: "expiresIn",
      label: i18n.nodes.dropbox.authorize.pin_expires_in,
      type: "number",
      defaultValue: 0,
    },
  ],
});

registerStructType({
  id: METADATA_STRUCT_TYPE,
  label: i18n.nodes.dropbox.metadata.label,
  category: "Dropbox",
  fields: [
    {
      id: "isFolder",
      label: i18n.nodes.dropbox.getMetadata.pin_is_folder,
      type: "boolean",
      defaultValue: false,
    },
    {
      id: "size",
      label: i18n.nodes.dropbox.getMetadata.pin_size,
      type: "number",
      defaultValue: 0,
    },
    {
      id: "contentHash",
      label: i18n.nodes.dropbox.getMetadata.pin_content_hash,
      type: "string",
      defaultValue: "",
    },
    {
      id: "serverModified",
      label: i18n.nodes.dropbox.getMetadata.pin_server_modified,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: REVISION_STRUCT_TYPE,
  label: i18n.nodes.dropbox.revision.label,
  category: "Dropbox",
  fields: [
    {
      id: "rev",
      label: i18n.nodes.dropbox.revision.pin_rev,
      type: "string",
      defaultValue: "",
    },
    {
      id: "size",
      label: i18n.nodes.dropbox.revision.pin_size,
      type: "number",
      defaultValue: 0,
    },
    {
      id: "serverModified",
      label: i18n.nodes.dropbox.revision.pin_server_modified,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: ACCOUNT_STRUCT_TYPE,
  label: i18n.nodes.dropbox.account.label,
  category: "Dropbox",
  fields: [
    {
      id: "accountId",
      label: i18n.nodes.dropbox.getCurrentAccount.pin_account_id,
      type: "string",
      defaultValue: "",
    },
    {
      id: "name",
      label: i18n.nodes.dropbox.getCurrentAccount.pin_name,
      type: "string",
      defaultValue: "",
    },
    {
      id: "email",
      label: i18n.nodes.dropbox.addFolderMember.pin_email,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: SPACE_USAGE_STRUCT_TYPE,
  label: i18n.nodes.dropbox.spaceUsage.label,
  category: "Dropbox",
  fields: [
    {
      id: "used",
      label: i18n.nodes.dropbox.getSpaceUsage.pin_used,
      type: "number",
      defaultValue: 0,
    },
    {
      id: "allocated",
      label: i18n.nodes.dropbox.getSpaceUsage.pin_allocated,
      type: "number",
      defaultValue: 0,
    },
  ],
});
