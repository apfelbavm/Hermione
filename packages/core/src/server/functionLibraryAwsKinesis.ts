import { KinesisManager, type KinesisPutRecordsEntry } from "../lib/kinesisManager.ts";
import type { StreamMode, ShardIteratorType, EncryptionType, ScalingType } from "@aws-sdk/client-kinesis";

/** Compile-time-only counterpart of nodes/kinesis.ts's execute() vault lookup
 * (resolveKinesisCredential) — the compiled/deployed script has no access to the Credential Vault
 * database, only the interpreter does, so it reads the same credential's access key back from
 * environment variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming
 * credentialEnv.ts's applyCredentialEnvVars writes. Never called by the interpreter — genuinely
 * different credential-sourcing behavior, not duplicated logic (same split as
 * functionLibraryAwsDynamoDb.ts's dynamoDbManagerFromEnv). */
function kinesisManagerFromEnv(credentialName: string): { ok: true; manager: KinesisManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "awsAccessKey") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not an AWS Access Key credential` };
  return {
    ok: true,
    manager: KinesisManager.forCredential(process.env[`${prefix}_ACCESS_KEY_ID`] || "", process.env[`${prefix}_SECRET_ACCESS_KEY`] || "", process.env[`${prefix}_REGION`] || "", process.env[`${prefix}_SESSION_TOKEN`] || "", process.env[`${prefix}_ENDPOINT`] || ""),
  };
}

export async function kinesisCreateStream(credentialName: string, streamName: string, shardCount: number, streamMode: StreamMode) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.createStream(streamName, shardCount, streamMode);
}

export async function kinesisDeleteStream(credentialName: string, streamName: string, enforceConsumerDeletion: boolean) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteStream(streamName, enforceConsumerDeletion);
}

export async function kinesisListStreams(credentialName: string, exclusiveStartStreamName: string, limit: number) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, streamNames: [], hasMoreStreams: false, error: cred.error };
  return cred.manager.listStreams(exclusiveStartStreamName, limit);
}

export async function kinesisDescribeStreamSummary(credentialName: string, streamName: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, streamArn: "", status: "", streamMode: "", retentionPeriodHours: 0, openShardCount: 0, encryptionType: "", keyId: "", error: cred.error };
  return cred.manager.describeStreamSummary(streamName);
}

export async function kinesisDescribeLimits(credentialName: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, shardLimit: 0, openShardCount: 0, error: cred.error };
  return cred.manager.describeLimits();
}

export async function kinesisIncreaseStreamRetentionPeriod(credentialName: string, streamName: string, retentionPeriodHours: number) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.increaseStreamRetentionPeriod(streamName, retentionPeriodHours);
}

export async function kinesisDecreaseStreamRetentionPeriod(credentialName: string, streamName: string, retentionPeriodHours: number) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.decreaseStreamRetentionPeriod(streamName, retentionPeriodHours);
}

export async function kinesisUpdateShardCount(credentialName: string, streamName: string, targetShardCount: number, scalingType: ScalingType) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, currentShardCount: 0, targetShardCount: 0, error: cred.error };
  return cred.manager.updateShardCount(streamName, targetShardCount, scalingType);
}

export async function kinesisListShards(credentialName: string, streamName: string, exclusiveStartShardId: string, maxResults: number, nextToken: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, shardsJson: "[]", nextToken: "", error: cred.error };
  const result = await cred.manager.listShards(streamName, exclusiveStartShardId, maxResults, nextToken);
  return { success: result.success, shardsJson: JSON.stringify(result.shards), nextToken: result.nextToken, error: result.error };
}

export async function kinesisMergeShards(credentialName: string, streamName: string, shardToMerge: string, adjacentShardToMerge: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.mergeShards(streamName, shardToMerge, adjacentShardToMerge);
}

export async function kinesisSplitShard(credentialName: string, streamName: string, shardToSplit: string, newStartingHashKey: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.splitShard(streamName, shardToSplit, newStartingHashKey);
}

export async function kinesisPutRecord(credentialName: string, streamName: string, data: string, partitionKey: string, explicitHashKey: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, shardId: "", sequenceNumber: "", error: cred.error };
  return cred.manager.putRecord(streamName, data, partitionKey, explicitHashKey);
}

export async function kinesisPutRecords(credentialName: string, streamName: string, recordsJson: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, failedRecordCount: 0, recordsJson: "[]", error: cred.error };
  const records = (recordsJson ? (JSON.parse(recordsJson) as unknown) : []) as KinesisPutRecordsEntry[];
  const result = await cred.manager.putRecords(streamName, Array.isArray(records) ? records : []);
  return { success: result.success, failedRecordCount: result.failedRecordCount, recordsJson: JSON.stringify(result.records), error: result.error };
}

export async function kinesisGetShardIterator(credentialName: string, streamName: string, shardId: string, shardIteratorType: ShardIteratorType, startingSequenceNumber: string, timestamp: number) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, shardIterator: "", error: cred.error };
  return cred.manager.getShardIterator(streamName, shardId, shardIteratorType, startingSequenceNumber, timestamp);
}

export async function kinesisGetRecords(credentialName: string, shardIterator: string, limit: number) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, recordsJson: "[]", nextShardIterator: "", millisBehindLatest: 0, error: cred.error };
  const result = await cred.manager.getRecords(shardIterator, limit);
  return { success: result.success, recordsJson: JSON.stringify(result.records), nextShardIterator: result.nextShardIterator, millisBehindLatest: result.millisBehindLatest, error: result.error };
}

export async function kinesisAddTagsToStream(credentialName: string, streamName: string, tagsJson: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  const parsed: unknown = tagsJson ? JSON.parse(tagsJson) : {};
  const tags = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  return cred.manager.addTagsToStream(streamName, tags);
}

export async function kinesisRemoveTagsFromStream(credentialName: string, streamName: string, tagKeysJson: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  const parsed: unknown = tagKeysJson ? JSON.parse(tagKeysJson) : [];
  return cred.manager.removeTagsFromStream(streamName, Array.isArray(parsed) ? (parsed as string[]) : []);
}

export async function kinesisListTagsForStream(credentialName: string, streamName: string, exclusiveStartTagKey: string, limit: number) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, tagsJson: "[]", hasMoreTags: false, error: cred.error };
  const result = await cred.manager.listTagsForStream(streamName, exclusiveStartTagKey, limit);
  return { success: result.success, tagsJson: JSON.stringify(result.tags), hasMoreTags: result.hasMoreTags, error: result.error };
}

export async function kinesisStartStreamEncryption(credentialName: string, streamName: string, encryptionType: EncryptionType, keyId: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.startStreamEncryption(streamName, encryptionType, keyId);
}

export async function kinesisStopStreamEncryption(credentialName: string, streamName: string, encryptionType: EncryptionType, keyId: string) {
  const cred = kinesisManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.stopStreamEncryption(streamName, encryptionType, keyId);
}
