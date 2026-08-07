import { registerStructType } from "@hermione/graph/engine/structRegistry";
import { i18n } from "@i18n";

export const SALESFORCE_DESCRIBE_FIELD_STRUCT_TYPE = "salesforceDescribeField";

registerStructType({
  id: SALESFORCE_DESCRIBE_FIELD_STRUCT_TYPE,
  label: i18n.nodes.salesforce.describeField.label,
  category: "Salesforce",
  fields: [
    { id: "name", label: i18n.nodes.salesforce.describeField.pin_name, type: "string", defaultValue: "" },
    { id: "label", label: i18n.nodes.salesforce.describeField.pin_label, type: "string", defaultValue: "" },
    { id: "type", label: i18n.nodes.salesforce.describeField.pin_type, type: "string", defaultValue: "" },
  ],
});
