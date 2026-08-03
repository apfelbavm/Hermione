import { registerEnumType } from "../engine/enumRegistry";

export const SOAP_SECURITY_ENUM_TYPE = "soapSecurity";
export const SOAP_WS_SECURITY_PASSWORD_TYPE_ENUM_TYPE = "soapWsSecurityPasswordType";

registerEnumType({
  id: SOAP_SECURITY_ENUM_TYPE,
  label: "SOAP Security",
  category: "SOAP",
  values: [
    { id: "None", label: "None" },
    { id: "Basic", label: "HTTP Basic Auth" },
    { id: "WSSecurity", label: "WS-Security UsernameToken" },
  ],
});

registerEnumType({
  id: SOAP_WS_SECURITY_PASSWORD_TYPE_ENUM_TYPE,
  label: "WS-Security Password Type",
  category: "SOAP",
  values: [
    { id: "PasswordText", label: "PasswordText" },
    { id: "PasswordDigest", label: "PasswordDigest" },
  ],
});
