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
