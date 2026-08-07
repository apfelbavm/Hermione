import { registerStructType } from "@hermione/graph/engine/structRegistry";
import { i18n } from "@i18n";

export const JIRA_ISSUE_STRUCT_TYPE = "jiraIssue";
export const JIRA_COMMENT_STRUCT_TYPE = "jiraComment";
export const JIRA_TRANSITION_STRUCT_TYPE = "jiraTransition";
export const JIRA_PROJECT_STRUCT_TYPE = "jiraProject";
export const JIRA_USER_STRUCT_TYPE = "jiraUser";

registerStructType({
  id: JIRA_ISSUE_STRUCT_TYPE,
  label: i18n.nodes.jira.issue.label,
  category: "Jira",
  fields: [
    { id: "id", label: i18n.nodes.jira.issue.pin_id, type: "string", defaultValue: "" },
    { id: "key", label: i18n.nodes.jira.issue.pin_key, type: "string", defaultValue: "" },
    { id: "summary", label: i18n.nodes.jira.issue.pin_summary, type: "string", defaultValue: "" },
    { id: "status", label: i18n.nodes.jira.issue.pin_status, type: "string", defaultValue: "" },
    { id: "issueType", label: i18n.nodes.jira.issue.pin_issue_type, type: "string", defaultValue: "" },
    { id: "url", label: i18n.nodes.jira.issue.pin_url, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: JIRA_COMMENT_STRUCT_TYPE,
  label: i18n.nodes.jira.comment.label,
  category: "Jira",
  fields: [
    { id: "id", label: i18n.nodes.jira.comment.pin_id, type: "string", defaultValue: "" },
    { id: "body", label: i18n.nodes.jira.comment.pin_body, type: "string", defaultValue: "" },
    { id: "author", label: i18n.nodes.jira.comment.pin_author, type: "string", defaultValue: "" },
    { id: "created", label: i18n.nodes.jira.comment.pin_created, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: JIRA_TRANSITION_STRUCT_TYPE,
  label: i18n.nodes.jira.transition.label,
  category: "Jira",
  fields: [
    { id: "id", label: i18n.nodes.jira.transition.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.jira.transition.pin_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: JIRA_PROJECT_STRUCT_TYPE,
  label: i18n.nodes.jira.project.label,
  category: "Jira",
  fields: [
    { id: "id", label: i18n.nodes.jira.project.pin_id, type: "string", defaultValue: "" },
    { id: "key", label: i18n.nodes.jira.project.pin_key, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.jira.project.pin_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: JIRA_USER_STRUCT_TYPE,
  label: i18n.nodes.jira.user.label,
  category: "Jira",
  fields: [
    { id: "accountId", label: i18n.nodes.jira.user.pin_account_id, type: "string", defaultValue: "" },
    { id: "username", label: i18n.nodes.jira.user.pin_username, type: "string", defaultValue: "" },
    { id: "displayName", label: i18n.nodes.jira.user.pin_display_name, type: "string", defaultValue: "" },
    { id: "emailAddress", label: i18n.nodes.jira.user.pin_email_address, type: "string", defaultValue: "" },
  ],
});
