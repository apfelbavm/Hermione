import { registerEnumType } from "../engine/enumRegistry";

export const GITHUB_STATE_ENUM_TYPE = "githubState";
export const GITHUB_MERGE_METHOD_ENUM_TYPE = "githubMergeMethod";

registerEnumType({
  id: GITHUB_STATE_ENUM_TYPE,
  label: "GitHub Issue/PR State",
  category: "GitHub",
  values: [
    { id: "open", label: "Open" },
    { id: "closed", label: "Closed" },
    { id: "all", label: "All" },
  ],
});

registerEnumType({
  id: GITHUB_MERGE_METHOD_ENUM_TYPE,
  label: "GitHub Merge Method",
  category: "GitHub",
  values: [
    { id: "merge", label: "Merge" },
    { id: "squash", label: "Squash" },
    { id: "rebase", label: "Rebase" },
  ],
});
