import { registerStructType } from "@hermione/graph/engine/structRegistry";
import { i18n } from "@i18n";

export const MESSAGE_STRUCT_TYPE = "twilioMessage";
export const CALL_STRUCT_TYPE = "twilioCall";

registerStructType({
  id: MESSAGE_STRUCT_TYPE,
  label: i18n.nodes.twilio.message.label,
  category: "Twilio",
  fields: [
    { id: "sid", label: i18n.nodes.twilio.message.pin_sid, type: "string", defaultValue: "" },
    { id: "status", label: i18n.nodes.twilio.message.pin_status, type: "string", defaultValue: "" },
    { id: "body", label: i18n.nodes.twilio.message.pin_body, type: "string", defaultValue: "" },
    { id: "to", label: i18n.nodes.twilio.message.pin_to, type: "string", defaultValue: "" },
    { id: "from", label: i18n.nodes.twilio.message.pin_from, type: "string", defaultValue: "" },
    { id: "dateSent", label: i18n.nodes.twilio.message.pin_date_sent, type: "string", defaultValue: "" },
  ],
});

registerStructType({
  id: CALL_STRUCT_TYPE,
  label: i18n.nodes.twilio.call.label,
  category: "Twilio",
  fields: [
    { id: "sid", label: i18n.nodes.twilio.call.pin_sid, type: "string", defaultValue: "" },
    { id: "status", label: i18n.nodes.twilio.call.pin_status, type: "string", defaultValue: "" },
    { id: "duration", label: i18n.nodes.twilio.call.pin_duration, type: "string", defaultValue: "" },
    { id: "to", label: i18n.nodes.twilio.call.pin_to, type: "string", defaultValue: "" },
    { id: "from", label: i18n.nodes.twilio.call.pin_from, type: "string", defaultValue: "" },
  ],
});
