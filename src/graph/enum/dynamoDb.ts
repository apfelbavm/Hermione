import { registerEnumType } from "../engine/enumRegistry";

export const DYNAMODB_ATTRIBUTE_TYPE_ENUM_TYPE = "dynamoDbAttributeType";
export const DYNAMODB_BILLING_MODE_ENUM_TYPE = "dynamoDbBillingMode";
export const DYNAMODB_RETURN_VALUES_PUT_ENUM_TYPE = "dynamoDbReturnValuesPut";
export const DYNAMODB_RETURN_VALUES_UPDATE_ENUM_TYPE = "dynamoDbReturnValuesUpdate";

registerEnumType({
  id: DYNAMODB_ATTRIBUTE_TYPE_ENUM_TYPE,
  label: "DynamoDB Attribute Type",
  category: "AWS DynamoDB",
  values: [
    { id: "S", label: "String" },
    { id: "N", label: "Number" },
    { id: "B", label: "Binary" },
  ],
});

registerEnumType({
  id: DYNAMODB_BILLING_MODE_ENUM_TYPE,
  label: "DynamoDB Billing Mode",
  category: "AWS DynamoDB",
  values: [
    { id: "PAY_PER_REQUEST", label: "On-Demand (Pay Per Request)" },
    { id: "PROVISIONED", label: "Provisioned" },
  ],
});

registerEnumType({
  id: DYNAMODB_RETURN_VALUES_PUT_ENUM_TYPE,
  label: "DynamoDB Return Values (Put/Delete)",
  category: "AWS DynamoDB",
  values: [
    { id: "NONE", label: "None" },
    { id: "ALL_OLD", label: "All Old Attributes" },
  ],
});

registerEnumType({
  id: DYNAMODB_RETURN_VALUES_UPDATE_ENUM_TYPE,
  label: "DynamoDB Return Values (Update)",
  category: "AWS DynamoDB",
  values: [
    { id: "NONE", label: "None" },
    { id: "ALL_OLD", label: "All Old Attributes" },
    { id: "UPDATED_OLD", label: "Updated Old Attributes" },
    { id: "ALL_NEW", label: "All New Attributes" },
    { id: "UPDATED_NEW", label: "Updated New Attributes" },
  ],
});
