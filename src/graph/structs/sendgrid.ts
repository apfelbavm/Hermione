import { registerStructType } from "../engine/structRegistry";
import { i18n } from "@i18n";

export const CONTACT_STRUCT_TYPE = "sendGridContact";
export const API_KEY_STRUCT_TYPE = "sendGridApiKeySummary";
export const CONTACT_LIST_STRUCT_TYPE = "sendGridContactList";
export const BOUNCE_STRUCT_TYPE = "sendGridBounceEvent";
export const SPAM_REPORT_STRUCT_TYPE = "sendGridSpamReport";
export const GLOBAL_UNSUBSCRIBE_STRUCT_TYPE = "sendGridGlobalUnsubscribe";
export const EMAIL_STAT_STRUCT_TYPE = "sendGridEmailStat";
export const VERIFIED_SENDER_STRUCT_TYPE = "sendGridVerifiedSender";

registerStructType({
  id: CONTACT_STRUCT_TYPE,
  label: i18n.nodes.sendgrid.contact.label,
  category: "SendGrid",
  fields: [
    { id: "id", label: i18n.nodes.sendgrid.contact.pin_id, type: "string", defaultValue: "" },
    { id: "email", label: i18n.nodes.sendgrid.contact.pin_email, type: "string", defaultValue: "" },
    { id: "firstName", label: i18n.nodes.sendgrid.contact.pin_first_name, type: "string", defaultValue: "" },
    { id: "lastName", label: i18n.nodes.sendgrid.contact.pin_last_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: API_KEY_STRUCT_TYPE,
  label: i18n.nodes.sendgrid.apiKeySummary.label,
  category: "SendGrid",
  fields: [
    { id: "id", label: i18n.nodes.sendgrid.apiKeySummary.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.sendgrid.apiKeySummary.pin_name, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CONTACT_LIST_STRUCT_TYPE,
  label: i18n.nodes.sendgrid.contactList.label,
  category: "SendGrid",
  fields: [
    { id: "id", label: i18n.nodes.sendgrid.contactList.pin_id, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.sendgrid.contactList.pin_name, type: "string", defaultValue: "" },
    { id: "contactCount", label: i18n.nodes.sendgrid.contactList.pin_contact_count, type: "number", defaultValue: 0 },
  ],
});

registerStructType({
  id: BOUNCE_STRUCT_TYPE,
  label: i18n.nodes.sendgrid.bounceEvent.label,
  category: "SendGrid",
  fields: [
    { id: "email", label: i18n.nodes.sendgrid.bounceEvent.pin_email, type: "string", defaultValue: "" },
    { id: "reason", label: i18n.nodes.sendgrid.bounceEvent.pin_reason, type: "string", defaultValue: "" },
    { id: "status", label: i18n.nodes.sendgrid.bounceEvent.pin_status, type: "string", defaultValue: "" },
    { id: "createdAt", label: i18n.nodes.sendgrid.bounceEvent.pin_created_at, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: SPAM_REPORT_STRUCT_TYPE,
  label: i18n.nodes.sendgrid.spamReport.label,
  category: "SendGrid",
  fields: [
    { id: "email", label: i18n.nodes.sendgrid.spamReport.pin_email, type: "string", defaultValue: "" },
    { id: "createdAt", label: i18n.nodes.sendgrid.spamReport.pin_created_at, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: GLOBAL_UNSUBSCRIBE_STRUCT_TYPE,
  label: i18n.nodes.sendgrid.globalUnsubscribe.label,
  category: "SendGrid",
  fields: [
    { id: "email", label: i18n.nodes.sendgrid.globalUnsubscribe.pin_email, type: "string", defaultValue: "" },
    { id: "createdAt", label: i18n.nodes.sendgrid.globalUnsubscribe.pin_created_at, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: EMAIL_STAT_STRUCT_TYPE,
  label: i18n.nodes.sendgrid.emailStat.label,
  category: "SendGrid",
  fields: [
    { id: "date", label: i18n.nodes.sendgrid.emailStat.pin_date, type: "string", defaultValue: "" },
    { id: "requests", label: i18n.nodes.sendgrid.emailStat.pin_requests, type: "number", defaultValue: 0 },
    { id: "delivered", label: i18n.nodes.sendgrid.emailStat.pin_delivered, type: "number", defaultValue: 0 },
    { id: "opens", label: i18n.nodes.sendgrid.emailStat.pin_opens, type: "number", defaultValue: 0 },
    { id: "clicks", label: i18n.nodes.sendgrid.emailStat.pin_clicks, type: "number", defaultValue: 0 },
    { id: "bounces", label: i18n.nodes.sendgrid.emailStat.pin_bounces, type: "number", defaultValue: 0 },
    { id: "spamReports", label: i18n.nodes.sendgrid.emailStat.pin_spam_reports, type: "number", defaultValue: 0 },
  ],
});

registerStructType({
  id: VERIFIED_SENDER_STRUCT_TYPE,
  label: i18n.nodes.sendgrid.verifiedSender.label,
  category: "SendGrid",
  fields: [
    { id: "id", label: i18n.nodes.sendgrid.verifiedSender.pin_id, type: "string", defaultValue: "" },
    { id: "nickname", label: i18n.nodes.sendgrid.verifiedSender.pin_nickname, type: "string", defaultValue: "" },
    { id: "fromEmail", label: i18n.nodes.sendgrid.verifiedSender.pin_from_email, type: "string", defaultValue: "" },
    { id: "verified", label: i18n.nodes.sendgrid.verifiedSender.pin_verified, type: "boolean", defaultValue: false },
  ],
});
