import { registerEnumType } from "@hermione/graph/engine/enumRegistry";

export const TEXT_ENCODING_ENUM_TYPE = "textEncoding";
export const HTTP_METHOD_ENUM_TYPE = "httpMethod";

registerEnumType({
  id: TEXT_ENCODING_ENUM_TYPE,
  label: "Text Encoding",
  category: "Common",
  values: [
    { id: "utf8", label: "UTF-8" },
    { id: "base64", label: "Base64" },
  ],
});

registerEnumType({
  id: HTTP_METHOD_ENUM_TYPE,
  label: "HTTP Method",
  category: "Common",
  values: [
    { id: "GET", label: "GET" },
    { id: "POST", label: "POST" },
    { id: "PUT", label: "PUT" },
    { id: "PATCH", label: "PATCH" },
    { id: "DELETE", label: "DELETE" },
    { id: "HEAD", label: "HEAD" },
    { id: "OPTIONS", label: "OPTIONS" },
  ],
});
