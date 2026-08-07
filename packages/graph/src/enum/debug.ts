import { registerEnumType } from "@hermione/graph/engine/enumRegistry";

export const DEBUG_LOG_FORMAT_ENUM_TYPE = "debugLogFormat";

registerEnumType({
  id: DEBUG_LOG_FORMAT_ENUM_TYPE,
  label: "Debug Log Format",
  category: "Debug",
  values: [
    { id: "json", label: "JSON" },
    { id: "xml", label: "XML" },
    { id: "csv", label: "CSV" },
  ],
});
