import { registerEnumType } from "../engine/enumRegistry";

export const DROPBOX_WRITE_MODE_ENUM_TYPE = "dropboxWriteMode";
export const DROPBOX_ACCESS_LEVEL_ENUM_TYPE = "dropboxAccessLevel";

registerEnumType({
  id: DROPBOX_WRITE_MODE_ENUM_TYPE,
  label: "Dropbox Write Mode",
  category: "Dropbox",
  values: [
    { id: "add", label: "Add" },
    { id: "overwrite", label: "Overwrite" },
  ],
});

registerEnumType({
  id: DROPBOX_ACCESS_LEVEL_ENUM_TYPE,
  label: "Dropbox Access Level",
  category: "Dropbox",
  values: [
    { id: "editor", label: "Editor" },
    { id: "viewer", label: "Viewer" },
  ],
});
