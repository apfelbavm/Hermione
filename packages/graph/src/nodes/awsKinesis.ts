import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, KINESIS_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { KINESIS_STREAM_MODE_ENUM_TYPE, KINESIS_SHARD_ITERATOR_TYPE_ENUM_TYPE, KINESIS_ENCRYPTION_TYPE_ENUM_TYPE, KINESIS_SCALING_TYPE_ENUM_TYPE } from "@hermione/graph/enum/kinesis";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below calls the exact same KinesisManager static method (packages/core/src/lib/
// kinesisManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — KinesisManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike the old two-layer split there is no separate functionLibraryAwsKinesis.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
// Same structure as nodes/twilio.ts.
//
// Shard lists, record batches, and tag maps are carried as JSON string pins rather than
// "map"/"struct" pins, since their shapes are arrays/nested objects of varying size — same
// convention as AwsdynamoDb.ts's items/keys/expression pins.
//
// KinesisManager now reaches the database directly, which pulls in better-sqlite3 and Node builtins
// — fine for execute(), which only ever runs server-side, but this file is still statically imported
// client-side too (for the node-creation menu), so a plain top-level import here would drag that
// whole chain into the browser bundle. Loaded with a runtime `import()` instead, ignored by both
// bundlers, so it's never even resolved for the client build; only ever actually called server-side,
// where it resolves normally.
async function loadKinesisManager(): Promise<typeof import("@hermione/core/lib/kinesisManager").KinesisManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/kinesisManager");
  return mod.KinesisManager;
}

const GROUP_NAME = "Request.AWS Kinesis";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.kinesis.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function streamNamePin() {
  return { id: "streamName", label: i18n.nodes.kinesis.__shared.pin_stream_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function execInPin() {
  return { id: "exec-in", label: "", type: "exec" as const, direction: "input" as const };
}

function execOutPin() {
  return { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec" as const, direction: "output" as const };
}

function successPin() {
  return { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean" as const, direction: "output" as const };
}

function errorPin() {
  return { id: "error", label: i18n.nodes.__shared.pin_error, type: "string" as const, direction: "output" as const };
}

registerNode({
  type: "kinesis.createStream",
  label: i18n.nodes.kinesis.createStream.label,
  description: i18n.nodes.kinesis.createStream.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "shardCount", label: i18n.nodes.kinesis.createStream.pin_shard_count, type: "number", direction: "input", defaultValue: 1, integer: true },
    { id: "streamMode", label: i18n.nodes.kinesis.createStream.pin_stream_mode, type: "enum", subType: KINESIS_STREAM_MODE_ENUM_TYPE, direction: "input", defaultValue: "ON_DEMAND", options: enumOptionIds(KINESIS_STREAM_MODE_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const streamMode = inputs.streamMode === "PROVISIONED" ? "PROVISIONED" : "ON_DEMAND";
    const result = await (await loadKinesisManager()).createStream(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), Number(inputs.shardCount) || 0, streamMode);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.createStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.shardCount}, ${inputs.streamMode});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.deleteStream",
  label: i18n.nodes.kinesis.deleteStream.label,
  description: i18n.nodes.kinesis.deleteStream.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "enforceConsumerDeletion", label: i18n.nodes.kinesis.deleteStream.pin_enforce_consumer_deletion, type: "boolean", direction: "input", defaultValue: false }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).deleteStream(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), Boolean(inputs.enforceConsumerDeletion));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.deleteStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.enforceConsumerDeletion});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.listStreams",
  label: i18n.nodes.kinesis.listStreams.label,
  description: i18n.nodes.kinesis.listStreams.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "exclusiveStartStreamName", label: i18n.nodes.kinesis.listStreams.pin_exclusive_start_stream_name, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.kinesis.__shared.pin_limit, type: "number", direction: "input", defaultValue: 0, integer: true },
    execOutPin(),
    successPin(),
    { id: "streamNames", label: i18n.nodes.kinesis.listStreams.pin_stream_names, type: "string", container: "array", direction: "output" },
    { id: "hasMoreStreams", label: i18n.nodes.kinesis.listStreams.pin_has_more_streams, type: "boolean", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).listStreams(String(inputs.credentialName ?? ""), String(inputs.exclusiveStartStreamName ?? ""), Number(inputs.limit) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.listStreams(${inputs.credentialName}, ${inputs.exclusiveStartStreamName}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, streamNames: `${v}.streamNames`, hasMoreStreams: `${v}.hasMoreStreams`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.describeStreamSummary",
  label: i18n.nodes.kinesis.describeStreamSummary.label,
  description: i18n.nodes.kinesis.describeStreamSummary.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    execOutPin(),
    successPin(),
    { id: "streamArn", label: i18n.nodes.kinesis.describeStreamSummary.pin_stream_arn, type: "string", direction: "output" },
    { id: "status", label: i18n.nodes.kinesis.describeStreamSummary.pin_status, type: "string", direction: "output" },
    { id: "streamMode", label: i18n.nodes.kinesis.describeStreamSummary.pin_stream_mode, type: "string", direction: "output" },
    { id: "retentionPeriodHours", label: i18n.nodes.kinesis.__shared.pin_retention_period_hours, type: "number", direction: "output" },
    { id: "openShardCount", label: i18n.nodes.kinesis.describeStreamSummary.pin_open_shard_count, type: "number", direction: "output" },
    { id: "encryptionType", label: i18n.nodes.kinesis.describeStreamSummary.pin_encryption_type, type: "string", direction: "output" },
    { id: "keyId", label: i18n.nodes.kinesis.describeStreamSummary.pin_key_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).describeStreamSummary(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.describeStreamSummary(${inputs.credentialName}, ${inputs.streamName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      streamArn: `${v}.streamArn`,
      status: `${v}.status`,
      streamMode: `${v}.streamMode`,
      retentionPeriodHours: `${v}.retentionPeriodHours`,
      openShardCount: `${v}.openShardCount`,
      encryptionType: `${v}.encryptionType`,
      keyId: `${v}.keyId`,
      error: `${v}.error`,
    };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.describeLimits",
  label: i18n.nodes.kinesis.describeLimits.label,
  description: i18n.nodes.kinesis.describeLimits.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    execOutPin(),
    successPin(),
    { id: "shardLimit", label: i18n.nodes.kinesis.describeLimits.pin_shard_limit, type: "number", direction: "output" },
    { id: "openShardCount", label: i18n.nodes.kinesis.describeLimits.pin_open_shard_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).describeLimits(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.describeLimits(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, shardLimit: `${v}.shardLimit`, openShardCount: `${v}.openShardCount`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.increaseStreamRetentionPeriod",
  label: i18n.nodes.kinesis.increaseStreamRetentionPeriod.label,
  description: i18n.nodes.kinesis.increaseStreamRetentionPeriod.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "retentionPeriodHours", label: i18n.nodes.kinesis.__shared.pin_retention_period_hours, type: "number", direction: "input", defaultValue: 24, integer: true }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).increaseStreamRetentionPeriod(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), Number(inputs.retentionPeriodHours) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.increaseStreamRetentionPeriod(${inputs.credentialName}, ${inputs.streamName}, ${inputs.retentionPeriodHours});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.decreaseStreamRetentionPeriod",
  label: i18n.nodes.kinesis.decreaseStreamRetentionPeriod.label,
  description: i18n.nodes.kinesis.decreaseStreamRetentionPeriod.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "retentionPeriodHours", label: i18n.nodes.kinesis.__shared.pin_retention_period_hours, type: "number", direction: "input", defaultValue: 24, integer: true }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).decreaseStreamRetentionPeriod(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), Number(inputs.retentionPeriodHours) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.decreaseStreamRetentionPeriod(${inputs.credentialName}, ${inputs.streamName}, ${inputs.retentionPeriodHours});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.updateShardCount",
  label: i18n.nodes.kinesis.updateShardCount.label,
  description: i18n.nodes.kinesis.updateShardCount.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "targetShardCount", label: i18n.nodes.kinesis.updateShardCount.pin_target_shard_count, type: "number", direction: "input", defaultValue: 1, integer: true },
    { id: "scalingType", label: i18n.nodes.kinesis.updateShardCount.pin_scaling_type, type: "enum", subType: KINESIS_SCALING_TYPE_ENUM_TYPE, direction: "input", defaultValue: "UNIFORM_SCALING", options: enumOptionIds(KINESIS_SCALING_TYPE_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    { id: "currentShardCount", label: i18n.nodes.kinesis.updateShardCount.pin_current_shard_count, type: "number", direction: "output" },
    { id: "targetShardCountResult", label: i18n.nodes.kinesis.updateShardCount.pin_target_shard_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).updateShardCount(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), Number(inputs.targetShardCount) || 0, "UNIFORM_SCALING");
    return { nextExec: "exec-out", outputs: { success: result.success, currentShardCount: result.currentShardCount, targetShardCountResult: result.targetShardCount, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.updateShardCount(${inputs.credentialName}, ${inputs.streamName}, ${inputs.targetShardCount}, ${inputs.scalingType});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, currentShardCount: `${v}.currentShardCount`, targetShardCountResult: `${v}.targetShardCount`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.listShards",
  label: i18n.nodes.kinesis.listShards.label,
  description: i18n.nodes.kinesis.listShards.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "exclusiveStartShardId", label: i18n.nodes.kinesis.listShards.pin_exclusive_start_shard_id, type: "string", direction: "input", defaultValue: "" },
    { id: "maxResults", label: i18n.nodes.kinesis.listShards.pin_max_results, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "nextToken", label: i18n.nodes.kinesis.listShards.pin_next_token, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "shards", label: i18n.nodes.kinesis.listShards.pin_shards, type: "string", direction: "output" },
    { id: "nextTokenOut", label: i18n.nodes.kinesis.listShards.pin_next_token, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).listShards(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.exclusiveStartShardId ?? ""), Number(inputs.maxResults) || 0, String(inputs.nextToken ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, shards: result.shardsJson, nextTokenOut: result.nextToken, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.listShards(${inputs.credentialName}, ${inputs.streamName}, ${inputs.exclusiveStartShardId}, ${inputs.maxResults}, ${inputs.nextToken});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, shards: `${v}.shardsJson`, nextTokenOut: `${v}.nextToken`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.mergeShards",
  label: i18n.nodes.kinesis.mergeShards.label,
  description: i18n.nodes.kinesis.mergeShards.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "shardToMerge", label: i18n.nodes.kinesis.mergeShards.pin_shard_to_merge, type: "string", direction: "input", defaultValue: "" },
    { id: "adjacentShardToMerge", label: i18n.nodes.kinesis.mergeShards.pin_adjacent_shard_to_merge, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).mergeShards(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.shardToMerge ?? ""), String(inputs.adjacentShardToMerge ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.mergeShards(${inputs.credentialName}, ${inputs.streamName}, ${inputs.shardToMerge}, ${inputs.adjacentShardToMerge});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.splitShard",
  label: i18n.nodes.kinesis.splitShard.label,
  description: i18n.nodes.kinesis.splitShard.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "shardToSplit", label: i18n.nodes.kinesis.splitShard.pin_shard_to_split, type: "string", direction: "input", defaultValue: "" },
    { id: "newStartingHashKey", label: i18n.nodes.kinesis.splitShard.pin_new_starting_hash_key, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).splitShard(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.shardToSplit ?? ""), String(inputs.newStartingHashKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.splitShard(${inputs.credentialName}, ${inputs.streamName}, ${inputs.shardToSplit}, ${inputs.newStartingHashKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.putRecord",
  label: i18n.nodes.kinesis.putRecord.label,
  description: i18n.nodes.kinesis.putRecord.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "data", label: i18n.nodes.kinesis.__shared.pin_data, type: "string", direction: "input", defaultValue: "" },
    { id: "partitionKey", label: i18n.nodes.kinesis.__shared.pin_partition_key, type: "string", direction: "input", defaultValue: "" },
    { id: "explicitHashKey", label: i18n.nodes.kinesis.__shared.pin_explicit_hash_key, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "shardId", label: i18n.nodes.kinesis.putRecord.pin_shard_id, type: "string", direction: "output" },
    { id: "sequenceNumber", label: i18n.nodes.kinesis.putRecord.pin_sequence_number, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).putRecord(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.data ?? ""), String(inputs.partitionKey ?? ""), String(inputs.explicitHashKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.putRecord(${inputs.credentialName}, ${inputs.streamName}, ${inputs.data}, ${inputs.partitionKey}, ${inputs.explicitHashKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, shardId: `${v}.shardId`, sequenceNumber: `${v}.sequenceNumber`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.putRecords",
  label: i18n.nodes.kinesis.putRecords.label,
  description: i18n.nodes.kinesis.putRecords.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "records", label: i18n.nodes.kinesis.putRecords.pin_records, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "failedRecordCount", label: i18n.nodes.kinesis.putRecords.pin_failed_record_count, type: "number", direction: "output" },
    { id: "resultRecords", label: i18n.nodes.kinesis.putRecords.pin_result_records, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).putRecords(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.records ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, failedRecordCount: result.failedRecordCount, resultRecords: result.recordsJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.putRecords(${inputs.credentialName}, ${inputs.streamName}, ${inputs.records});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, failedRecordCount: `${v}.failedRecordCount`, resultRecords: `${v}.recordsJson`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.getShardIterator",
  label: i18n.nodes.kinesis.getShardIterator.label,
  description: i18n.nodes.kinesis.getShardIterator.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "shardId", label: i18n.nodes.kinesis.__shared.pin_shard_id, type: "string", direction: "input", defaultValue: "" },
    { id: "shardIteratorType", label: i18n.nodes.kinesis.getShardIterator.pin_shard_iterator_type, type: "enum", subType: KINESIS_SHARD_ITERATOR_TYPE_ENUM_TYPE, direction: "input", defaultValue: "LATEST", options: enumOptionIds(KINESIS_SHARD_ITERATOR_TYPE_ENUM_TYPE) },
    { id: "startingSequenceNumber", label: i18n.nodes.kinesis.getShardIterator.pin_starting_sequence_number, type: "string", direction: "input", defaultValue: "" },
    { id: "timestamp", label: i18n.nodes.kinesis.getShardIterator.pin_timestamp, type: "number", direction: "input", defaultValue: 0, integer: true },
    execOutPin(),
    successPin(),
    { id: "shardIterator", label: i18n.nodes.kinesis.getShardIterator.pin_shard_iterator, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const validTypes = ["AT_SEQUENCE_NUMBER", "AFTER_SEQUENCE_NUMBER", "AT_TIMESTAMP", "TRIM_HORIZON", "LATEST"];
    const shardIteratorType = validTypes.includes(String(inputs.shardIteratorType)) ? (inputs.shardIteratorType as "AT_SEQUENCE_NUMBER" | "AFTER_SEQUENCE_NUMBER" | "AT_TIMESTAMP" | "TRIM_HORIZON" | "LATEST") : "LATEST";
    const result = await (await loadKinesisManager()).getShardIterator(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.shardId ?? ""), shardIteratorType, String(inputs.startingSequenceNumber ?? ""), Number(inputs.timestamp) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await KinesisManager.getShardIterator(${inputs.credentialName}, ${inputs.streamName}, ${inputs.shardId}, ${inputs.shardIteratorType}, ${inputs.startingSequenceNumber}, ${inputs.timestamp});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, shardIterator: `${v}.shardIterator`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.getRecords",
  label: i18n.nodes.kinesis.getRecords.label,
  description: i18n.nodes.kinesis.getRecords.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "shardIterator", label: i18n.nodes.kinesis.getRecords.pin_shard_iterator, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.kinesis.__shared.pin_limit, type: "number", direction: "input", defaultValue: 0, integer: true },
    execOutPin(),
    successPin(),
    { id: "records", label: i18n.nodes.kinesis.getRecords.pin_records, type: "string", direction: "output" },
    { id: "nextShardIterator", label: i18n.nodes.kinesis.getRecords.pin_next_shard_iterator, type: "string", direction: "output" },
    { id: "millisBehindLatest", label: i18n.nodes.kinesis.getRecords.pin_millis_behind_latest, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).getRecords(String(inputs.credentialName ?? ""), String(inputs.shardIterator ?? ""), Number(inputs.limit) || 0);
    return { nextExec: "exec-out", outputs: { success: result.success, records: result.recordsJson, nextShardIterator: result.nextShardIterator, millisBehindLatest: result.millisBehindLatest, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.getRecords(${inputs.credentialName}, ${inputs.shardIterator}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, records: `${v}.recordsJson`, nextShardIterator: `${v}.nextShardIterator`, millisBehindLatest: `${v}.millisBehindLatest`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.addTagsToStream",
  label: i18n.nodes.kinesis.addTagsToStream.label,
  description: i18n.nodes.kinesis.addTagsToStream.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "tags", label: i18n.nodes.kinesis.addTagsToStream.pin_tags, type: "string", direction: "input", defaultValue: "{}" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).addTagsToStream(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.tags ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.addTagsToStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.tags});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.removeTagsFromStream",
  label: i18n.nodes.kinesis.removeTagsFromStream.label,
  description: i18n.nodes.kinesis.removeTagsFromStream.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "tagKeys", label: i18n.nodes.kinesis.removeTagsFromStream.pin_tag_keys, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).removeTagsFromStream(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.tagKeys ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.removeTagsFromStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.tagKeys});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.listTagsForStream",
  label: i18n.nodes.kinesis.listTagsForStream.label,
  description: i18n.nodes.kinesis.listTagsForStream.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "exclusiveStartTagKey", label: i18n.nodes.kinesis.listTagsForStream.pin_exclusive_start_tag_key, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.kinesis.__shared.pin_limit, type: "number", direction: "input", defaultValue: 0, integer: true },
    execOutPin(),
    successPin(),
    { id: "tags", label: i18n.nodes.kinesis.listTagsForStream.pin_tags, type: "string", direction: "output" },
    { id: "hasMoreTags", label: i18n.nodes.kinesis.listTagsForStream.pin_has_more_tags, type: "boolean", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadKinesisManager()).listTagsForStream(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), String(inputs.exclusiveStartTagKey ?? ""), Number(inputs.limit) || 0);
    return { nextExec: "exec-out", outputs: { success: result.success, tags: result.tagsJson, hasMoreTags: result.hasMoreTags, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.listTagsForStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.exclusiveStartTagKey}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tags: `${v}.tagsJson`, hasMoreTags: `${v}.hasMoreTags`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.startStreamEncryption",
  label: i18n.nodes.kinesis.startStreamEncryption.label,
  description: i18n.nodes.kinesis.startStreamEncryption.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "encryptionType", label: i18n.nodes.kinesis.startStreamEncryption.pin_encryption_type, type: "enum", subType: KINESIS_ENCRYPTION_TYPE_ENUM_TYPE, direction: "input", defaultValue: "KMS", options: enumOptionIds(KINESIS_ENCRYPTION_TYPE_ENUM_TYPE) },
    { id: "keyId", label: i18n.nodes.kinesis.startStreamEncryption.pin_key_id, type: "string", direction: "input", defaultValue: "alias/aws/kinesis" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const encryptionType = inputs.encryptionType === "NONE" ? "NONE" : "KMS";
    const result = await (await loadKinesisManager()).startStreamEncryption(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), encryptionType, String(inputs.keyId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.startStreamEncryption(${inputs.credentialName}, ${inputs.streamName}, ${inputs.encryptionType}, ${inputs.keyId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});

registerNode({
  type: "kinesis.stopStreamEncryption",
  label: i18n.nodes.kinesis.stopStreamEncryption.label,
  description: i18n.nodes.kinesis.stopStreamEncryption.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    streamNamePin(),
    { id: "encryptionType", label: i18n.nodes.kinesis.stopStreamEncryption.pin_encryption_type, type: "enum", subType: KINESIS_ENCRYPTION_TYPE_ENUM_TYPE, direction: "input", defaultValue: "KMS", options: enumOptionIds(KINESIS_ENCRYPTION_TYPE_ENUM_TYPE) },
    { id: "keyId", label: i18n.nodes.kinesis.stopStreamEncryption.pin_key_id, type: "string", direction: "input", defaultValue: "alias/aws/kinesis" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const encryptionType = inputs.encryptionType === "NONE" ? "NONE" : "KMS";
    const result = await (await loadKinesisManager()).stopStreamEncryption(String(inputs.credentialName ?? ""), String(inputs.streamName ?? ""), encryptionType, String(inputs.keyId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await KinesisManager.stopStreamEncryption(${inputs.credentialName}, ${inputs.streamName}, ${inputs.encryptionType}, ${inputs.keyId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [KINESIS_MANAGER_IMPORT],
});
