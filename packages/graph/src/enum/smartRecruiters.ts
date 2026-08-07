import { registerEnumType } from "@hermione/graph/engine/enumRegistry";

export const SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE = "smartRecruitersHttpMethod";

registerEnumType({
  id: SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE,
  label: "SmartRecruiters HTTP Method",
  category: "SmartRecruiters",
  values: [
    { id: "GET", label: "GET" },
    { id: "POST", label: "POST" },
    { id: "PUT", label: "PUT" },
    { id: "PATCH", label: "PATCH" },
    { id: "DELETE", label: "DELETE" },
  ],
});

export const SMARTRECRUITERS_JOB_STATUS_ENUM_TYPE = "smartRecruitersJobStatus";

registerEnumType({
  id: SMARTRECRUITERS_JOB_STATUS_ENUM_TYPE,
  label: "SmartRecruiters Job Status",
  category: "SmartRecruiters",
  values: [
    { id: "CREATED", label: "Created" },
    { id: "SOURCING", label: "Sourcing" },
    { id: "FILLED", label: "Filled" },
    { id: "INTERVIEW", label: "Interview" },
    { id: "OFFER", label: "Offer" },
    { id: "CANCELLED", label: "Cancelled" },
    { id: "ON_HOLD", label: "On Hold" },
  ],
});

export const SMARTRECRUITERS_HIRING_TEAM_ROLE_ENUM_TYPE = "smartRecruitersHiringTeamRole";

registerEnumType({
  id: SMARTRECRUITERS_HIRING_TEAM_ROLE_ENUM_TYPE,
  label: "SmartRecruiters Hiring Team Role",
  category: "SmartRecruiters",
  values: [
    { id: "HIRING_MANAGER", label: "Hiring Manager" },
    { id: "INTERVIEW_TEAM", label: "Interview Team" },
    { id: "RECRUITER", label: "Recruiter" },
    { id: "EXECUTIVE", label: "Executive" },
    { id: "COORDINATOR", label: "Coordinator" },
  ],
});

export const SMARTRECRUITERS_POSITION_TYPE_ENUM_TYPE = "smartRecruitersPositionType";

registerEnumType({
  id: SMARTRECRUITERS_POSITION_TYPE_ENUM_TYPE,
  label: "SmartRecruiters Position Type",
  category: "SmartRecruiters",
  values: [
    { id: "NEW", label: "New" },
    { id: "REPLACEMENT", label: "Replacement" },
  ],
});

export const SMARTRECRUITERS_JOB_AD_POSTING_VISIBILITY_ENUM_TYPE = "smartRecruitersJobAdPostingVisibility";

registerEnumType({
  id: SMARTRECRUITERS_JOB_AD_POSTING_VISIBILITY_ENUM_TYPE,
  label: "SmartRecruiters Job Ad Posting Visibility",
  category: "SmartRecruiters",
  values: [
    { id: "PUBLIC", label: "Public" },
    { id: "INTERNAL", label: "Internal" },
  ],
});
