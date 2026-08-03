import { registerStructType } from "../engine/structRegistry";
import { i18n } from "@i18n";

export const DYNAMODB_TABLE_DESCRIPTION_STRUCT_TYPE = "dynamoDbTableDescription";

registerStructType({
  id: DYNAMODB_TABLE_DESCRIPTION_STRUCT_TYPE,
  label: i18n.nodes.dynamoDb.tableDescription.label,
  category: "AWS DynamoDB",
  fields: [
    { id: "status", label: i18n.nodes.dynamoDb.tableDescription.pin_status, type: "string", defaultValue: "" },
    { id: "itemCount", label: i18n.nodes.dynamoDb.tableDescription.pin_item_count, type: "number", defaultValue: 0 },
    { id: "sizeBytes", label: i18n.nodes.dynamoDb.tableDescription.pin_size_bytes, type: "number", defaultValue: 0 },
    { id: "partitionKeyName", label: i18n.nodes.dynamoDb.__shared.pin_partition_key_name, type: "string", defaultValue: "" },
    { id: "partitionKeyType", label: i18n.nodes.dynamoDb.__shared.pin_partition_key_type, type: "string", defaultValue: "" },
    { id: "sortKeyName", label: i18n.nodes.dynamoDb.__shared.pin_sort_key_name, type: "string", defaultValue: "" },
    { id: "sortKeyType", label: i18n.nodes.dynamoDb.__shared.pin_sort_key_type, type: "string", defaultValue: "" },
    { id: "billingMode", label: i18n.nodes.dynamoDb.__shared.pin_billing_mode, type: "string", defaultValue: "" },
    { id: "readCapacityUnits", label: i18n.nodes.dynamoDb.__shared.pin_read_capacity_units, type: "number", defaultValue: 0 },
    { id: "writeCapacityUnits", label: i18n.nodes.dynamoDb.__shared.pin_write_capacity_units, type: "number", defaultValue: 0 },
  ],
});
