import { registerStructType } from "@hermione/graph/engine/structRegistry";
import { i18n } from "@i18n";

export const TOKEN_STRUCT_TYPE = "linkedInToken";
export const INTROSPECT_STRUCT_TYPE = "linkedInIntrospectResult";

registerStructType({
  id: TOKEN_STRUCT_TYPE,
  label: i18n.nodes.linkedin.token.label,
  category: "LinkedIn",
  fields: [
    { id: "accessToken", label: i18n.nodes.linkedin.__shared.pin_access_token, type: "string", defaultValue: "" },
    { id: "expiresIn", label: i18n.nodes.linkedin.__shared.pin_expires_in, type: "number", defaultValue: 0 },
    { id: "refreshToken", label: i18n.nodes.linkedin.__shared.pin_refresh_token, type: "string", defaultValue: "" },
    { id: "refreshTokenExpiresIn", label: i18n.nodes.linkedin.__shared.pin_refresh_token_expires_in, type: "number", defaultValue: 0 },
    { id: "scope", label: i18n.nodes.linkedin.__shared.pin_scope, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: INTROSPECT_STRUCT_TYPE,
  label: i18n.nodes.linkedin.introspectAccessToken.label,
  category: "LinkedIn",
  fields: [
    { id: "active", label: i18n.nodes.linkedin.introspectAccessToken.pin_active, type: "boolean", defaultValue: false },
    { id: "authType", label: i18n.nodes.linkedin.introspectAccessToken.pin_auth_type, type: "string", defaultValue: "" },
    { id: "clientId", label: i18n.nodes.linkedin.__shared.pin_client_id, type: "string", defaultValue: "" },
    { id: "createdAt", label: i18n.nodes.linkedin.introspectAccessToken.pin_created_at, type: "number", defaultValue: 0 },
    { id: "expiresAt", label: i18n.nodes.linkedin.introspectAccessToken.pin_expires_at, type: "number", defaultValue: 0 },
    { id: "scope", label: i18n.nodes.linkedin.__shared.pin_scope, type: "string", defaultValue: "" },
    { id: "status", label: i18n.nodes.linkedin.introspectAccessToken.pin_status, type: "string", defaultValue: "" },
  ],
});
