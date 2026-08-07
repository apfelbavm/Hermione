import { registerStructType } from "@hermione/graph/engine/structRegistry";
import { i18n } from "@i18n";

export const AUTH_TOKENS_STRUCT_TYPE = "facebookAuthTokens";
export const DEBUG_TOKEN_STRUCT_TYPE = "facebookDebugToken";
export const PAGE_STRUCT_TYPE = "facebookPage";
export const POST_STRUCT_TYPE = "facebookPost";
export const COMMENT_STRUCT_TYPE = "facebookComment";
export const USER_STRUCT_TYPE = "facebookUser";
export const AD_ACCOUNT_STRUCT_TYPE = "facebookAdAccount";
export const CAMPAIGN_STRUCT_TYPE = "facebookCampaign";

registerStructType({
  id: AUTH_TOKENS_STRUCT_TYPE,
  label: i18n.nodes.facebook.authTokens.label,
  category: "Facebook",
  fields: [
    { id: "accessToken", label: i18n.nodes.facebook.__shared.pin_access_token, type: "string", defaultValue: "" },
    { id: "expiresIn", label: i18n.nodes.facebook.authorize.pin_expires_in, type: "number", defaultValue: 0 },
  ],
});

registerStructType({
  id: DEBUG_TOKEN_STRUCT_TYPE,
  label: i18n.nodes.facebook.debugTokenResult.label,
  category: "Facebook",
  fields: [
    { id: "appId", label: i18n.nodes.facebook.debugToken.pin_app_id, type: "string", defaultValue: "" },
    { id: "isValid", label: i18n.nodes.facebook.debugToken.pin_is_valid, type: "boolean", defaultValue: false },
    { id: "expiresAt", label: i18n.nodes.facebook.debugToken.pin_expires_at, type: "number", defaultValue: 0 },
    { id: "scopes", label: i18n.nodes.facebook.debugToken.pin_scopes, type: "string", container: "array", defaultValue: [] },
  ],
});

registerStructType({
  id: PAGE_STRUCT_TYPE,
  label: i18n.nodes.facebook.page.label,
  category: "Facebook",
  fields: [
    { id: "id", label: i18n.nodes.facebook.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.facebook.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "category", label: i18n.nodes.facebook.getPageInfo.pin_category, type: "string", defaultValue: "" },
    { id: "fanCount", label: i18n.nodes.facebook.getPageInfo.pin_fan_count, type: "number", defaultValue: 0 },
    { id: "link", label: i18n.nodes.facebook.__shared.pin_link, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: POST_STRUCT_TYPE,
  label: i18n.nodes.facebook.post.label,
  category: "Facebook",
  fields: [
    { id: "id", label: i18n.nodes.facebook.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "message", label: i18n.nodes.facebook.__shared.pin_message, type: "string", defaultValue: "" },
    { id: "createdTime", label: i18n.nodes.facebook.__shared.pin_created_time, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: COMMENT_STRUCT_TYPE,
  label: i18n.nodes.facebook.comment.label,
  category: "Facebook",
  fields: [
    { id: "id", label: i18n.nodes.facebook.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "message", label: i18n.nodes.facebook.__shared.pin_message, type: "string", defaultValue: "" },
    { id: "fromName", label: i18n.nodes.facebook.getComments.pin_from_name, type: "string", defaultValue: "" },
    { id: "createdTime", label: i18n.nodes.facebook.__shared.pin_created_time, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: USER_STRUCT_TYPE,
  label: i18n.nodes.facebook.user.label,
  category: "Facebook",
  fields: [
    { id: "id", label: i18n.nodes.facebook.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.facebook.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "email", label: i18n.nodes.facebook.getUserProfile.pin_email, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: AD_ACCOUNT_STRUCT_TYPE,
  label: i18n.nodes.facebook.adAccount.label,
  category: "Facebook",
  fields: [
    { id: "id", label: i18n.nodes.facebook.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.facebook.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "accountStatus", label: i18n.nodes.facebook.getAdAccounts.pin_account_status, type: "number", defaultValue: 0 },
  ],
});

registerStructType({
  id: CAMPAIGN_STRUCT_TYPE,
  label: i18n.nodes.facebook.campaign.label,
  category: "Facebook",
  fields: [
    { id: "id", label: i18n.nodes.facebook.__shared.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.facebook.__shared.pin_name, type: "string", defaultValue: "" },
    { id: "status", label: i18n.nodes.facebook.getCampaigns.pin_status, type: "string", defaultValue: "" },
    { id: "objective", label: i18n.nodes.facebook.getCampaigns.pin_objective, type: "string", defaultValue: "" },
  ],
});
