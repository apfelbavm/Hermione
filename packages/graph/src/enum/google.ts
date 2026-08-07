import { registerEnumType } from "@hermione/graph/engine/enumRegistry";

export const GOOGLE_DRIVE_ROLE_ENUM_TYPE = "googleDriveRole";
export const GOOGLE_DRIVE_PERMISSION_TYPE_ENUM_TYPE = "googleDrivePermissionType";

registerEnumType({
  id: GOOGLE_DRIVE_ROLE_ENUM_TYPE,
  label: "Google Drive Sharing Role",
  category: "Google",
  values: [
    { id: "reader", label: "Reader" },
    { id: "commenter", label: "Commenter" },
    { id: "writer", label: "Writer" },
    { id: "owner", label: "Owner" },
  ],
});

registerEnumType({
  id: GOOGLE_DRIVE_PERMISSION_TYPE_ENUM_TYPE,
  label: "Google Drive Permission Type",
  category: "Google",
  values: [
    { id: "user", label: "User" },
    { id: "group", label: "Group" },
    { id: "domain", label: "Domain" },
    { id: "anyone", label: "Anyone" },
  ],
});
