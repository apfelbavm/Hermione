import { registerEnumType } from "@hermione/graph/engine/enumRegistry";

export const MICROSOFT365_BODY_TYPE_ENUM_TYPE = "microsoft365BodyType";
export const MICROSOFT365_SHARING_LINK_TYPE_ENUM_TYPE = "microsoft365SharingLinkType";
export const MICROSOFT365_SHARING_LINK_SCOPE_ENUM_TYPE = "microsoft365SharingLinkScope";
export const MICROSOFT365_HTTP_METHOD_ENUM_TYPE = "microsoft365HttpMethod";

registerEnumType({
  id: MICROSOFT365_BODY_TYPE_ENUM_TYPE,
  label: "Microsoft 365 Mail Body Type",
  category: "Microsoft 365",
  values: [
    { id: "text", label: "Text" },
    { id: "html", label: "HTML" },
  ],
});

registerEnumType({
  id: MICROSOFT365_SHARING_LINK_TYPE_ENUM_TYPE,
  label: "Microsoft 365 Sharing Link Type",
  category: "Microsoft 365",
  values: [
    { id: "view", label: "View" },
    { id: "edit", label: "Edit" },
  ],
});

registerEnumType({
  id: MICROSOFT365_SHARING_LINK_SCOPE_ENUM_TYPE,
  label: "Microsoft 365 Sharing Link Scope",
  category: "Microsoft 365",
  values: [
    { id: "anonymous", label: "Anonymous" },
    { id: "organization", label: "Organization" },
  ],
});

registerEnumType({
  id: MICROSOFT365_HTTP_METHOD_ENUM_TYPE,
  label: "Microsoft 365 HTTP Method",
  category: "Microsoft 365",
  values: ["GET", "POST", "PATCH", "PUT", "DELETE"].map((id) => ({ id, label: id })),
});
