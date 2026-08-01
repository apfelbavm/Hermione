import { registerEnumType } from "../engine/enumRegistry";

export const OAUTH2_SEND_AS_ENUM_TYPE = "oauth2SendAs";

registerEnumType({
  id: OAUTH2_SEND_AS_ENUM_TYPE,
  label: "OAuth2 Send As",
  category: "Auth",
  values: [
    { id: "body", label: "Request Body" },
    { id: "basicAuthHeader", label: "Basic Auth Header" },
  ],
});
