import { registerEnumType } from "../engine/enumRegistry";

export const JIRA_VALIDATE_QUERY_ENUM_TYPE = "jiraValidateQuery";

registerEnumType({
  id: JIRA_VALIDATE_QUERY_ENUM_TYPE,
  label: "Jira JQL Validation",
  category: "Jira",
  values: [
    { id: "strict", label: "Strict" },
    { id: "warn", label: "Warn" },
    { id: "none", label: "None" },
  ],
});
