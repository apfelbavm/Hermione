import { registerStructType } from "../../engine/structRegistry";
import { i18n } from "@i18n";

export const ISSUE_STRUCT_TYPE = "githubIssue";
export const PULL_REQUEST_STRUCT_TYPE = "githubPullRequest";
export const CREATE_RESULT_STRUCT_TYPE = "githubCreateResult";
export const MERGE_RESULT_STRUCT_TYPE = "githubMergeResult";
export const FILE_CONTENT_STRUCT_TYPE = "githubFileContent";
export const FILE_WRITE_RESULT_STRUCT_TYPE = "githubFileWriteResult";

registerStructType({
  id: ISSUE_STRUCT_TYPE,
  label: i18n.nodes.github.issue.label,
  category: "GitHub",
  fields: [
    { id: "number", label: i18n.nodes.github.__shared.pin_number, type: "number", defaultValue: 0 },
    { id: "title", label: i18n.nodes.github.__shared.pin_title, type: "string", defaultValue: "" },
    { id: "state", label: i18n.nodes.github.__shared.pin_state, type: "string", defaultValue: "" },
    { id: "url", label: i18n.nodes.github.__shared.pin_url, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: PULL_REQUEST_STRUCT_TYPE,
  label: i18n.nodes.github.pullRequest.label,
  category: "GitHub",
  fields: [
    { id: "number", label: i18n.nodes.github.__shared.pin_number, type: "number", defaultValue: 0 },
    { id: "title", label: i18n.nodes.github.__shared.pin_title, type: "string", defaultValue: "" },
    { id: "state", label: i18n.nodes.github.__shared.pin_state, type: "string", defaultValue: "" },
    { id: "url", label: i18n.nodes.github.__shared.pin_url, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CREATE_RESULT_STRUCT_TYPE,
  label: i18n.nodes.github.createResult.label,
  category: "GitHub",
  fields: [
    { id: "number", label: i18n.nodes.github.__shared.pin_number, type: "number", defaultValue: 0 },
    {
      id: "url",
      label: i18n.nodes.github.__shared.pin_url,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: MERGE_RESULT_STRUCT_TYPE,
  label: i18n.nodes.github.mergeResult.label,
  category: "GitHub",
  fields: [
    {
      id: "merged",
      label: i18n.nodes.github.mergePullRequest.pin_merged,
      type: "boolean",
      defaultValue: false,
    },
    {
      id: "sha",
      label: i18n.nodes.github.__shared.pin_sha,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: FILE_CONTENT_STRUCT_TYPE,
  label: i18n.nodes.github.fileContent.label,
  category: "GitHub",
  fields: [
    {
      id: "content",
      label: i18n.nodes.github.__shared.pin_content,
      type: "string",
      defaultValue: "",
    },
    {
      id: "sha",
      label: i18n.nodes.github.__shared.pin_sha,
      type: "string",
      defaultValue: "",
    },
  ],
});

registerStructType({
  id: FILE_WRITE_RESULT_STRUCT_TYPE,
  label: i18n.nodes.github.fileWriteResult.label,
  category: "GitHub",
  fields: [
    {
      id: "sha",
      label: i18n.nodes.github.createOrUpdateFile.pin_result_sha,
      type: "string",
      defaultValue: "",
    },
    {
      id: "commitSha",
      label: i18n.nodes.github.createOrUpdateFile.pin_commit_sha,
      type: "string",
      defaultValue: "",
    },
  ],
});
