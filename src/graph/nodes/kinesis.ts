import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_KINESIS_IMPORT } from "../engine/compileUtils";
import { KinesisManager } from "../../lib/kinesisManager";
import type { AwsAccessKeyCredentialData } from "../../credentials/types";
import { KINESIS_STREAM_MODE_ENUM_TYPE, KINESIS_SHARD_ITERATOR_TYPE_ENUM_TYPE, KINESIS_ENCRYPTION_TYPE_ENUM_TYPE, KINESIS_SCALING_TYPE_ENUM_TYPE } from "../enum/kinesis";
import { enumOptionIds } from "../engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over KinesisManager (src/lib/kinesisManager.ts),
// which owns the actual SDK calls and error normalization — this file only ever translates pins to
// method arguments and method results back to pins. Same structure/conventions as nodes/dynamoDb.ts.
//
// Every operation node takes a Credential Name directly (no separate auth/refresh node): each
// resolves the named vault entry and hands its access key pair to KinesisManager.forCredential,
// which caches the underlying KinesisClient — see kinesisManager.ts.
//
// Shard lists, record batches, and tag maps are carried as JSON string pins rather than
// "map"/"struct" pins, since their shapes are arrays/nested objects of varying size — same
// convention as dynamoDb.ts's items/keys/expression pins.
//
// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibraryKinesis.kinesis*` wrapper (see server/functionLibraryKinesis.ts), which reads the
// credential's access key back from environment variables instead of the vault — same split as
// dynamoDb.ts's execute()/compileExecute().

const GROUP_NAME = "Request.AWS Kinesis";

function parseJsonArray(json: unknown): unknown[] {
  const str = String(json ?? "");
  if (!str) return [];
  try {
    const parsed: unknown = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(json: unknown): Record<string, unknown> {
  const str = String(json ?? "");
  if (!str) return {};
  try {
    const parsed: unknown = JSON.parse(str);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

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

/** Shared by every Kinesis node — looks up a named Credential Vault entry and returns its access
 * key data, or a clear error if the name is wrong/missing. */
function resolveKinesisCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: AwsAccessKeyCredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type !== "awsAccessKey") return { ok: false, error: `Credential "${credentialName}" is not an AWS Access Key credential` };
  return { ok: true, data: credential.data as AwsAccessKeyCredentialData };
}

function managerFor(ctx: ExecutionContext, credentialName: string): { ok: true; manager: KinesisManager } | { ok: false; error: string } {
  const resolved = resolveKinesisCredential(ctx, credentialName);
  if (!resolved.ok) return resolved;
  const data = resolved.data;
  return { ok: true, manager: KinesisManager.forCredential(data.accessKeyId, data.secretAccessKey, data.region, data.sessionToken, data.endpoint) };
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const streamMode = inputs.streamMode === "PROVISIONED" ? "PROVISIONED" : "ON_DEMAND";
    const result = await resolved.manager.createStream(String(inputs.streamName ?? ""), Number(inputs.shardCount) || 0, streamMode);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisCreateStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.shardCount}, ${inputs.streamMode});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
});

registerNode({
  type: "kinesis.deleteStream",
  label: i18n.nodes.kinesis.deleteStream.label,
  description: i18n.nodes.kinesis.deleteStream.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "enforceConsumerDeletion", label: i18n.nodes.kinesis.deleteStream.pin_enforce_consumer_deletion, type: "boolean", direction: "input", defaultValue: false }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.deleteStream(String(inputs.streamName ?? ""), Boolean(inputs.enforceConsumerDeletion));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisDeleteStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.enforceConsumerDeletion});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, streamNames: [], hasMoreStreams: false, error: resolved.error } };
    const result = await resolved.manager.listStreams(String(inputs.exclusiveStartStreamName ?? ""), Number(inputs.limit) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisListStreams(${inputs.credentialName}, ${inputs.exclusiveStartStreamName}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, streamNames: `${v}.streamNames`, hasMoreStreams: `${v}.hasMoreStreams`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, streamArn: "", status: "", streamMode: "", retentionPeriodHours: 0, openShardCount: 0, encryptionType: "", keyId: "", error: resolved.error } };
    const result = await resolved.manager.describeStreamSummary(String(inputs.streamName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisDescribeStreamSummary(${inputs.credentialName}, ${inputs.streamName});`, ...compileFrom("exec-out")],
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
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, shardLimit: 0, openShardCount: 0, error: resolved.error } };
    const result = await resolved.manager.describeLimits();
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisDescribeLimits(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, shardLimit: `${v}.shardLimit`, openShardCount: `${v}.openShardCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
});

registerNode({
  type: "kinesis.increaseStreamRetentionPeriod",
  label: i18n.nodes.kinesis.increaseStreamRetentionPeriod.label,
  description: i18n.nodes.kinesis.increaseStreamRetentionPeriod.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "retentionPeriodHours", label: i18n.nodes.kinesis.__shared.pin_retention_period_hours, type: "number", direction: "input", defaultValue: 24, integer: true }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.increaseStreamRetentionPeriod(String(inputs.streamName ?? ""), Number(inputs.retentionPeriodHours) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisIncreaseStreamRetentionPeriod(${inputs.credentialName}, ${inputs.streamName}, ${inputs.retentionPeriodHours});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
});

registerNode({
  type: "kinesis.decreaseStreamRetentionPeriod",
  label: i18n.nodes.kinesis.decreaseStreamRetentionPeriod.label,
  description: i18n.nodes.kinesis.decreaseStreamRetentionPeriod.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "retentionPeriodHours", label: i18n.nodes.kinesis.__shared.pin_retention_period_hours, type: "number", direction: "input", defaultValue: 24, integer: true }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.decreaseStreamRetentionPeriod(String(inputs.streamName ?? ""), Number(inputs.retentionPeriodHours) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisDecreaseStreamRetentionPeriod(${inputs.credentialName}, ${inputs.streamName}, ${inputs.retentionPeriodHours});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, currentShardCount: 0, targetShardCountResult: 0, error: resolved.error } };
    const result = await resolved.manager.updateShardCount(String(inputs.streamName ?? ""), Number(inputs.targetShardCount) || 0, "UNIFORM_SCALING");
    return { nextExec: "exec-out", outputs: { success: result.success, currentShardCount: result.currentShardCount, targetShardCountResult: result.targetShardCount, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisUpdateShardCount(${inputs.credentialName}, ${inputs.streamName}, ${inputs.targetShardCount}, ${inputs.scalingType});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, currentShardCount: `${v}.currentShardCount`, targetShardCountResult: `${v}.targetShardCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, shards: "[]", nextTokenOut: "", error: resolved.error } };
    const result = await resolved.manager.listShards(String(inputs.streamName ?? ""), String(inputs.exclusiveStartShardId ?? ""), Number(inputs.maxResults) || 0, String(inputs.nextToken ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, shards: JSON.stringify(result.shards), nextTokenOut: result.nextToken, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisListShards(${inputs.credentialName}, ${inputs.streamName}, ${inputs.exclusiveStartShardId}, ${inputs.maxResults}, ${inputs.nextToken});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, shards: `${v}.shardsJson`, nextTokenOut: `${v}.nextToken`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.mergeShards(String(inputs.streamName ?? ""), String(inputs.shardToMerge ?? ""), String(inputs.adjacentShardToMerge ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisMergeShards(${inputs.credentialName}, ${inputs.streamName}, ${inputs.shardToMerge}, ${inputs.adjacentShardToMerge});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.splitShard(String(inputs.streamName ?? ""), String(inputs.shardToSplit ?? ""), String(inputs.newStartingHashKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisSplitShard(${inputs.credentialName}, ${inputs.streamName}, ${inputs.shardToSplit}, ${inputs.newStartingHashKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, shardId: "", sequenceNumber: "", error: resolved.error } };
    const result = await resolved.manager.putRecord(String(inputs.streamName ?? ""), String(inputs.data ?? ""), String(inputs.partitionKey ?? ""), String(inputs.explicitHashKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisPutRecord(${inputs.credentialName}, ${inputs.streamName}, ${inputs.data}, ${inputs.partitionKey}, ${inputs.explicitHashKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, shardId: `${v}.shardId`, sequenceNumber: `${v}.sequenceNumber`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, failedRecordCount: 0, resultRecords: "[]", error: resolved.error } };
    const records = parseJsonArray(inputs.records) as { data: string; partitionKey: string; explicitHashKey?: string }[];
    const result = await resolved.manager.putRecords(String(inputs.streamName ?? ""), records);
    return { nextExec: "exec-out", outputs: { success: result.success, failedRecordCount: result.failedRecordCount, resultRecords: JSON.stringify(result.records), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisPutRecords(${inputs.credentialName}, ${inputs.streamName}, ${inputs.records});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, failedRecordCount: `${v}.failedRecordCount`, resultRecords: `${v}.recordsJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, shardIterator: "", error: resolved.error } };
    const validTypes = ["AT_SEQUENCE_NUMBER", "AFTER_SEQUENCE_NUMBER", "AT_TIMESTAMP", "TRIM_HORIZON", "LATEST"];
    const shardIteratorType = validTypes.includes(String(inputs.shardIteratorType)) ? (inputs.shardIteratorType as "AT_SEQUENCE_NUMBER" | "AFTER_SEQUENCE_NUMBER" | "AT_TIMESTAMP" | "TRIM_HORIZON" | "LATEST") : "LATEST";
    const result = await resolved.manager.getShardIterator(String(inputs.streamName ?? ""), String(inputs.shardId ?? ""), shardIteratorType, String(inputs.startingSequenceNumber ?? ""), Number(inputs.timestamp) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisGetShardIterator(${inputs.credentialName}, ${inputs.streamName}, ${inputs.shardId}, ${inputs.shardIteratorType}, ${inputs.startingSequenceNumber}, ${inputs.timestamp});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, shardIterator: `${v}.shardIterator`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, records: "[]", nextShardIterator: "", millisBehindLatest: 0, error: resolved.error } };
    const result = await resolved.manager.getRecords(String(inputs.shardIterator ?? ""), Number(inputs.limit) || 0);
    return { nextExec: "exec-out", outputs: { success: result.success, records: JSON.stringify(result.records), nextShardIterator: result.nextShardIterator, millisBehindLatest: result.millisBehindLatest, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisGetRecords(${inputs.credentialName}, ${inputs.shardIterator}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, records: `${v}.recordsJson`, nextShardIterator: `${v}.nextShardIterator`, millisBehindLatest: `${v}.millisBehindLatest`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
});

registerNode({
  type: "kinesis.addTagsToStream",
  label: i18n.nodes.kinesis.addTagsToStream.label,
  description: i18n.nodes.kinesis.addTagsToStream.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "tags", label: i18n.nodes.kinesis.addTagsToStream.pin_tags, type: "string", direction: "input", defaultValue: "{}" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.addTagsToStream(String(inputs.streamName ?? ""), parseJsonObject(inputs.tags) as Record<string, string>);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisAddTagsToStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.tags});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
});

registerNode({
  type: "kinesis.removeTagsFromStream",
  label: i18n.nodes.kinesis.removeTagsFromStream.label,
  description: i18n.nodes.kinesis.removeTagsFromStream.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), streamNamePin(), { id: "tagKeys", label: i18n.nodes.kinesis.removeTagsFromStream.pin_tag_keys, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.removeTagsFromStream(String(inputs.streamName ?? ""), parseJsonArray(inputs.tagKeys) as string[]);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisRemoveTagsFromStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.tagKeys});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, tags: "[]", hasMoreTags: false, error: resolved.error } };
    const result = await resolved.manager.listTagsForStream(String(inputs.streamName ?? ""), String(inputs.exclusiveStartTagKey ?? ""), Number(inputs.limit) || 0);
    return { nextExec: "exec-out", outputs: { success: result.success, tags: JSON.stringify(result.tags), hasMoreTags: result.hasMoreTags, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisListTagsForStream(${inputs.credentialName}, ${inputs.streamName}, ${inputs.exclusiveStartTagKey}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tags: `${v}.tagsJson`, hasMoreTags: `${v}.hasMoreTags`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const encryptionType = inputs.encryptionType === "NONE" ? "NONE" : "KMS";
    const result = await resolved.manager.startStreamEncryption(String(inputs.streamName ?? ""), encryptionType, String(inputs.keyId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisStartStreamEncryption(${inputs.credentialName}, ${inputs.streamName}, ${inputs.encryptionType}, ${inputs.keyId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const encryptionType = inputs.encryptionType === "NONE" ? "NONE" : "KMS";
    const result = await resolved.manager.stopStreamEncryption(String(inputs.streamName ?? ""), encryptionType, String(inputs.keyId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryKinesis.kinesisStopStreamEncryption(${inputs.credentialName}, ${inputs.streamName}, ${inputs.encryptionType}, ${inputs.keyId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_KINESIS_IMPORT],
});
