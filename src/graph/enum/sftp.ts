import { registerEnumType } from "../engine/enumRegistry";

export const SFTP_EXISTING_FILE_MODE_ENUM_TYPE = "sftpExistingFileMode";

registerEnumType({
  id: SFTP_EXISTING_FILE_MODE_ENUM_TYPE,
  label: "SFTP Existing File Mode",
  category: "SFTP",
  values: [
    { id: "Overwrite", label: "Overwrite" },
    { id: "Append", label: "Append" },
    { id: "Fail", label: "Fail" },
    { id: "Ignore", label: "Ignore" },
  ],
});
