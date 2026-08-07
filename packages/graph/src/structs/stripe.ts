import { registerStructType } from "@hermione/graph/engine/structRegistry";
import { i18n } from "@i18n";

export const CHARGE_STRUCT_TYPE = "stripeCharge";

registerStructType({
  id: CHARGE_STRUCT_TYPE,
  label: i18n.nodes.stripe.charge.label,
  category: "Stripe",
  fields: [
    { id: "id", label: i18n.nodes.stripe.charge.pin_id, type: "string", defaultValue: "" },
    { id: "amount", label: i18n.nodes.stripe.charge.pin_amount, type: "number", defaultValue: 0 },
    { id: "currency", label: i18n.nodes.stripe.charge.pin_currency, type: "string", defaultValue: "" },
    { id: "status", label: i18n.nodes.stripe.charge.pin_status, type: "string", defaultValue: "" },
    { id: "description", label: i18n.nodes.stripe.charge.pin_description, type: "string", defaultValue: "" },
  ],
});

export const CUSTOMER_STRUCT_TYPE = "stripeCustomer";

registerStructType({
  id: CUSTOMER_STRUCT_TYPE,
  label: i18n.nodes.stripe.customer.label,
  category: "Stripe",
  fields: [
    { id: "id", label: i18n.nodes.stripe.customer.pin_id, type: "string", defaultValue: "" },
    { id: "email", label: i18n.nodes.stripe.customer.pin_email, type: "string", defaultValue: "" },
    { id: "name", label: i18n.nodes.stripe.customer.pin_name, type: "string", defaultValue: "" },
  ],
});
