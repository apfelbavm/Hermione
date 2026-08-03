import { registerEnumType } from "../engine/enumRegistry";

export const KINESIS_STREAM_MODE_ENUM_TYPE = "kinesisStreamMode";
export const KINESIS_SHARD_ITERATOR_TYPE_ENUM_TYPE = "kinesisShardIteratorType";
export const KINESIS_ENCRYPTION_TYPE_ENUM_TYPE = "kinesisEncryptionType";
export const KINESIS_SCALING_TYPE_ENUM_TYPE = "kinesisScalingType";

registerEnumType({
  id: KINESIS_STREAM_MODE_ENUM_TYPE,
  label: "Kinesis Stream Mode",
  category: "AWS Kinesis",
  values: [
    { id: "ON_DEMAND", label: "On-Demand" },
    { id: "PROVISIONED", label: "Provisioned" },
  ],
});

registerEnumType({
  id: KINESIS_SHARD_ITERATOR_TYPE_ENUM_TYPE,
  label: "Kinesis Shard Iterator Type",
  category: "AWS Kinesis",
  values: [
    { id: "AT_SEQUENCE_NUMBER", label: "At Sequence Number" },
    { id: "AFTER_SEQUENCE_NUMBER", label: "After Sequence Number" },
    { id: "AT_TIMESTAMP", label: "At Timestamp" },
    { id: "TRIM_HORIZON", label: "Trim Horizon" },
    { id: "LATEST", label: "Latest" },
  ],
});

registerEnumType({
  id: KINESIS_ENCRYPTION_TYPE_ENUM_TYPE,
  label: "Kinesis Encryption Type",
  category: "AWS Kinesis",
  values: [
    { id: "NONE", label: "None" },
    { id: "KMS", label: "KMS" },
  ],
});

registerEnumType({
  id: KINESIS_SCALING_TYPE_ENUM_TYPE,
  label: "Kinesis Scaling Type",
  category: "AWS Kinesis",
  values: [{ id: "UNIFORM_SCALING", label: "Uniform Scaling" }],
});
