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

export const SMARTRECRUITERS_ATTACHMENT_TYPE_ENUM_TYPE = "smartRecruitersAttachmentType";

registerEnumType({
  id: SMARTRECRUITERS_ATTACHMENT_TYPE_ENUM_TYPE,
  label: "SmartRecruiters Attachment Type",
  category: "SmartRecruiters",
  values: [
    { id: "RESUME", label: "Resume" },
    { id: "COVER_LETTER", label: "Cover Letter" },
    { id: "GENERIC_FILE", label: "Generic File" },
  ],
});

export const SMARTRECRUITERS_PROPERTY_CONTEXT_ENUM_TYPE = "smartRecruitersPropertyContext";

registerEnumType({
  id: SMARTRECRUITERS_PROPERTY_CONTEXT_ENUM_TYPE,
  label: "SmartRecruiters Property Context",
  category: "SmartRecruiters",
  values: [
    { id: "PROFILE", label: "Profile" },
    { id: "OFFER_FORM", label: "Offer Form" },
    { id: "HIRE_FORM", label: "Hire Form" },
    { id: "OFFER_APPROVAL_FORM", label: "Offer Approval Form" },
  ],
});

export const SMARTRECRUITERS_ONBOARDING_STATUS_ENUM_TYPE = "smartRecruitersOnboardingStatus";

registerEnumType({
  id: SMARTRECRUITERS_ONBOARDING_STATUS_ENUM_TYPE,
  label: "SmartRecruiters Onboarding Status",
  category: "SmartRecruiters",
  values: [
    { id: "READY_TO_ONBOARD", label: "Ready to Onboard" },
    { id: "ONBOARDING_SUCCESSFUL", label: "Onboarding Successful" },
    { id: "ONBOARDING_FAILED", label: "Onboarding Failed" },
  ],
});

export const SMARTRECRUITERS_ATTENDEE_STATUS_ENUM_TYPE = "smartRecruitersAttendeeStatus";

registerEnumType({
  id: SMARTRECRUITERS_ATTENDEE_STATUS_ENUM_TYPE,
  label: "SmartRecruiters Attendee Status",
  category: "SmartRecruiters",
  values: [
    { id: "accepted", label: "Accepted" },
    { id: "declined", label: "Declined" },
    { id: "pending", label: "Pending" },
    { id: "tentative", label: "Tentative" },
  ],
});

export const SMARTRECRUITERS_EVENT_STATE_ENUM_TYPE = "smartRecruitersEventState";

registerEnumType({
  id: SMARTRECRUITERS_EVENT_STATE_ENUM_TYPE,
  label: "SmartRecruiters Event State",
  category: "SmartRecruiters",
  values: [
    { id: "PAST", label: "Past" },
    { id: "ACTIVE", label: "Active" },
  ],
});

export const SMARTRECRUITERS_SELF_SCHEDULE_TYPE_ENUM_TYPE = "smartRecruitersSelfScheduleType";

registerEnumType({
  id: SMARTRECRUITERS_SELF_SCHEDULE_TYPE_ENUM_TYPE,
  label: "SmartRecruiters Self Schedule Type",
  category: "SmartRecruiters",
  values: [
    { id: "INDIVIDUAL", label: "Individual" },
    { id: "GROUP", label: "Group" },
  ],
});

export const SMARTRECRUITERS_TEMPLATE_HIRING_STAGE_ENUM_TYPE = "smartRecruitersTemplateHiringStage";

registerEnumType({
  id: SMARTRECRUITERS_TEMPLATE_HIRING_STAGE_ENUM_TYPE,
  label: "SmartRecruiters Template Hiring Stage",
  category: "SmartRecruiters",
  values: [
    { id: "NEW", label: "New" },
    { id: "IN_PROGRESS", label: "In Progress" },
    { id: "INTERVIEW", label: "Interview" },
    { id: "OFFER", label: "Offer" },
  ],
});

export const SMARTRECRUITERS_INTERVIEW_TEMPLATE_TYPE_ENUM_TYPE = "smartRecruitersInterviewTemplateType";

registerEnumType({
  id: SMARTRECRUITERS_INTERVIEW_TEMPLATE_TYPE_ENUM_TYPE,
  label: "SmartRecruiters Interview Template Type",
  category: "SmartRecruiters",
  values: [
    { id: "INDIVIDUAL", label: "Individual" },
    { id: "GROUP", label: "Group" },
  ],
});
