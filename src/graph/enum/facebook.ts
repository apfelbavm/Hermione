import { registerEnumType } from "../engine/enumRegistry";

export const FACEBOOK_CAMPAIGN_OBJECTIVE_ENUM_TYPE = "facebookCampaignObjective";
export const FACEBOOK_CAMPAIGN_STATUS_ENUM_TYPE = "facebookCampaignStatus";
export const FACEBOOK_INSIGHTS_PERIOD_ENUM_TYPE = "facebookInsightsPeriod";

registerEnumType({
  id: FACEBOOK_CAMPAIGN_OBJECTIVE_ENUM_TYPE,
  label: "Facebook Campaign Objective",
  category: "Facebook",
  values: [
    { id: "OUTCOME_AWARENESS", label: "Awareness" },
    { id: "OUTCOME_TRAFFIC", label: "Traffic" },
    { id: "OUTCOME_ENGAGEMENT", label: "Engagement" },
    { id: "OUTCOME_LEADS", label: "Leads" },
    { id: "OUTCOME_APP_PROMOTION", label: "App Promotion" },
    { id: "OUTCOME_SALES", label: "Sales" },
  ],
});

registerEnumType({
  id: FACEBOOK_CAMPAIGN_STATUS_ENUM_TYPE,
  label: "Facebook Campaign Status",
  category: "Facebook",
  values: [
    { id: "ACTIVE", label: "Active" },
    { id: "PAUSED", label: "Paused" },
    { id: "DELETED", label: "Deleted" },
    { id: "ARCHIVED", label: "Archived" },
  ],
});

registerEnumType({
  id: FACEBOOK_INSIGHTS_PERIOD_ENUM_TYPE,
  label: "Facebook Insights Period",
  category: "Facebook",
  values: [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "days_28", label: "28 Days" },
    { id: "month", label: "Month" },
    { id: "lifetime", label: "Lifetime" },
  ],
});
