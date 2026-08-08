import {
  KinesisClient,
  CreateStreamCommand,
  DeleteStreamCommand,
  ListStreamsCommand,
  DescribeStreamSummaryCommand,
  DescribeLimitsCommand,
  IncreaseStreamRetentionPeriodCommand,
  DecreaseStreamRetentionPeriodCommand,
  UpdateShardCountCommand,
  ListShardsCommand,
  MergeShardsCommand,
  SplitShardCommand,
  PutRecordCommand,
  PutRecordsCommand,
  GetShardIteratorCommand,
  GetRecordsCommand,
  AddTagsToStreamCommand,
  RemoveTagsFromStreamCommand,
  ListTagsForStreamCommand,
  StartStreamEncryptionCommand,
  StopStreamEncryptionCommand,
  type StreamMode,
  type ShardIteratorType,
  type EncryptionType,
  type ScalingType,
} from "@aws-sdk/client-kinesis";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { AwsAccessKeyCredentialData } from "@hermione/shared/types";

/** Every Kinesis node (stream management, shards, records, tags) needs the same boilerplate: build
 * a client from an access key pair, call one SDK method, and turn either a result or a thrown error
 * into a plain {success, error} shape. Centralized here once instead of repeated per node (see
 * nodes/awsKinesis.ts, which only wires pins to the static wrappers below) — same structure as
 * TwilioManager, which resolves its own credential from the vault directly. */

export type KinesisAuth = AwsAccessKeyCredentialData;

function parseJsonObject(json: string): Record<string, unknown> {
  if (!json) return {};
  const parsed: unknown = JSON.parse(json);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function parseJsonArray(json: string): unknown[] {
  if (!json) return [];
  const parsed: unknown = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [];
}

export interface KinesisOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface KinesisListStreamsResult extends KinesisOpResult {
  streamNames: string[];
  hasMoreStreams: boolean;
}

export interface KinesisStreamSummary extends KinesisOpResult {
  streamArn: string;
  status: string;
  streamMode: string;
  retentionPeriodHours: number;
  openShardCount: number;
  encryptionType: string;
  keyId: string;
}

export interface KinesisLimitsResult extends KinesisOpResult {
  shardLimit: number;
  openShardCount: number;
}

export interface KinesisShard {
  shardId: string;
  parentShardId: string;
  adjacentParentShardId: string;
  startingHashKey: string;
  endingHashKey: string;
}

export interface KinesisListShardsResult extends KinesisOpResult {
  shards: KinesisShard[];
  nextToken: string;
}

export interface KinesisListShardsJsonResult extends KinesisOpResult {
  shardsJson: string;
  nextToken: string;
}

export interface KinesisPutRecordResult extends KinesisOpResult {
  shardId: string;
  sequenceNumber: string;
}

export interface KinesisPutRecordsEntry {
  data: string;
  partitionKey: string;
  explicitHashKey?: string;
}

export interface KinesisPutRecordsResultEntry {
  sequenceNumber: string;
  shardId: string;
  errorCode: string;
  errorMessage: string;
}

export interface KinesisPutRecordsResult extends KinesisOpResult {
  failedRecordCount: number;
  records: KinesisPutRecordsResultEntry[];
}

export interface KinesisPutRecordsJsonResult extends KinesisOpResult {
  failedRecordCount: number;
  recordsJson: string;
}

export interface KinesisShardIteratorResult extends KinesisOpResult {
  shardIterator: string;
}

export interface KinesisRecord {
  sequenceNumber: string;
  partitionKey: string;
  data: string;
  approximateArrivalTimestamp: string;
}

export interface KinesisGetRecordsResult extends KinesisOpResult {
  records: KinesisRecord[];
  nextShardIterator: string;
  millisBehindLatest: number;
}

export interface KinesisGetRecordsJsonResult extends KinesisOpResult {
  recordsJson: string;
  nextShardIterator: string;
  millisBehindLatest: number;
}

export interface KinesisTag {
  key: string;
  value: string;
}

export interface KinesisListTagsResult extends KinesisOpResult {
  tags: KinesisTag[];
  hasMoreTags: boolean;
}

export interface KinesisListTagsJsonResult extends KinesisOpResult {
  tagsJson: string;
  hasMoreTags: boolean;
}

export interface KinesisUpdateShardCountResult extends KinesisOpResult {
  currentShardCount: number;
  targetShardCount: number;
}

const managerCache = new Map<string, KinesisManager>();

export class KinesisManager {
  private readonly client: KinesisClient;

  private constructor(accessKeyId: string, secretAccessKey: string, region: string, sessionToken: string, endpoint: string) {
    this.client = new KinesisClient({
      region: region || "us-east-1",
      endpoint: endpoint || undefined,
      credentials: { accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined },
    });
  }

  /** Reuses one KinesisManager (and its underlying client) per distinct credential instead of
   * building a fresh one per node execution — same reasoning as TwilioManager.getInstance. */
  static getInstance(auth: KinesisAuth): KinesisManager {
    const cacheKey = [auth.accessKeyId, auth.secretAccessKey, auth.region, auth.sessionToken, auth.endpoint].join(":");
    let manager = managerCache.get(cacheKey);
    if (!manager) {
      manager = new KinesisManager(auth.accessKeyId, auth.secretAccessKey, auth.region, auth.sessionToken, auth.endpoint);
      managerCache.set(cacheKey, manager);
    }
    return manager;
  }

  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: KinesisAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "awsAccessKey") return { ok: false, error: `Credential "${credentialName}" is not an AWS Access Key credential` };
    return { ok: true, auth: credRecord.data as AwsAccessKeyCredentialData };
  }

  static async createStream(credentialName: string, streamName: string, shardCount: number, streamMode: StreamMode): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).createStream(streamName, shardCount, streamMode);
  }

  static async deleteStream(credentialName: string, streamName: string, enforceConsumerDeletion: boolean): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).deleteStream(streamName, enforceConsumerDeletion);
  }

  static async listStreams(credentialName: string, exclusiveStartStreamName: string, limit: number): Promise<KinesisListStreamsResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, streamNames: [], hasMoreStreams: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).listStreams(exclusiveStartStreamName, limit);
  }

  static async describeStreamSummary(credentialName: string, streamName: string): Promise<KinesisStreamSummary> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, streamArn: "", status: "", streamMode: "", retentionPeriodHours: 0, openShardCount: 0, encryptionType: "", keyId: "", error: cred.error };
    return KinesisManager.getInstance(cred.auth).describeStreamSummary(streamName);
  }

  static async describeLimits(credentialName: string): Promise<KinesisLimitsResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, shardLimit: 0, openShardCount: 0, error: cred.error };
    return KinesisManager.getInstance(cred.auth).describeLimits();
  }

  static async increaseStreamRetentionPeriod(credentialName: string, streamName: string, retentionPeriodHours: number): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).increaseStreamRetentionPeriod(streamName, retentionPeriodHours);
  }

  static async decreaseStreamRetentionPeriod(credentialName: string, streamName: string, retentionPeriodHours: number): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).decreaseStreamRetentionPeriod(streamName, retentionPeriodHours);
  }

  static async updateShardCount(credentialName: string, streamName: string, targetShardCount: number, scalingType: ScalingType): Promise<KinesisUpdateShardCountResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, currentShardCount: 0, targetShardCount: 0, error: cred.error };
    return KinesisManager.getInstance(cred.auth).updateShardCount(streamName, targetShardCount, scalingType);
  }

  static async listShards(credentialName: string, streamName: string, exclusiveStartShardId: string, maxResults: number, nextToken: string): Promise<KinesisListShardsJsonResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, shardsJson: "[]", nextToken: "", error: cred.error };
    const result = await KinesisManager.getInstance(cred.auth).listShards(streamName, exclusiveStartShardId, maxResults, nextToken);
    return { success: result.success, shardsJson: JSON.stringify(result.shards), nextToken: result.nextToken, error: result.error };
  }

  static async mergeShards(credentialName: string, streamName: string, shardToMerge: string, adjacentShardToMerge: string): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).mergeShards(streamName, shardToMerge, adjacentShardToMerge);
  }

  static async splitShard(credentialName: string, streamName: string, shardToSplit: string, newStartingHashKey: string): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).splitShard(streamName, shardToSplit, newStartingHashKey);
  }

  static async putRecord(credentialName: string, streamName: string, data: string, partitionKey: string, explicitHashKey: string): Promise<KinesisPutRecordResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, shardId: "", sequenceNumber: "", error: cred.error };
    return KinesisManager.getInstance(cred.auth).putRecord(streamName, data, partitionKey, explicitHashKey);
  }

  static async putRecords(credentialName: string, streamName: string, recordsJson: string): Promise<KinesisPutRecordsJsonResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, failedRecordCount: 0, recordsJson: "[]", error: cred.error };
    const records = parseJsonArray(recordsJson) as KinesisPutRecordsEntry[];
    const result = await KinesisManager.getInstance(cred.auth).putRecords(streamName, records);
    return { success: result.success, failedRecordCount: result.failedRecordCount, recordsJson: JSON.stringify(result.records), error: result.error };
  }

  static async getShardIterator(credentialName: string, streamName: string, shardId: string, shardIteratorType: ShardIteratorType, startingSequenceNumber: string, timestamp: number): Promise<KinesisShardIteratorResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, shardIterator: "", error: cred.error };
    return KinesisManager.getInstance(cred.auth).getShardIterator(streamName, shardId, shardIteratorType, startingSequenceNumber, timestamp);
  }

  static async getRecords(credentialName: string, shardIterator: string, limit: number): Promise<KinesisGetRecordsJsonResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, recordsJson: "[]", nextShardIterator: "", millisBehindLatest: 0, error: cred.error };
    const result = await KinesisManager.getInstance(cred.auth).getRecords(shardIterator, limit);
    return { success: result.success, recordsJson: JSON.stringify(result.records), nextShardIterator: result.nextShardIterator, millisBehindLatest: result.millisBehindLatest, error: result.error };
  }

  static async addTagsToStream(credentialName: string, streamName: string, tagsJson: string): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).addTagsToStream(streamName, parseJsonObject(tagsJson) as Record<string, string>);
  }

  static async removeTagsFromStream(credentialName: string, streamName: string, tagKeysJson: string): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).removeTagsFromStream(streamName, parseJsonArray(tagKeysJson) as string[]);
  }

  static async listTagsForStream(credentialName: string, streamName: string, exclusiveStartTagKey: string, limit: number): Promise<KinesisListTagsJsonResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, tagsJson: "[]", hasMoreTags: false, error: cred.error };
    const result = await KinesisManager.getInstance(cred.auth).listTagsForStream(streamName, exclusiveStartTagKey, limit);
    return { success: result.success, tagsJson: JSON.stringify(result.tags), hasMoreTags: result.hasMoreTags, error: result.error };
  }

  static async startStreamEncryption(credentialName: string, streamName: string, encryptionType: EncryptionType, keyId: string): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).startStreamEncryption(streamName, encryptionType, keyId);
  }

  static async stopStreamEncryption(credentialName: string, streamName: string, encryptionType: EncryptionType, keyId: string): Promise<KinesisOpResult> {
    const cred = await KinesisManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return KinesisManager.getInstance(cred.auth).stopStreamEncryption(streamName, encryptionType, keyId);
  }

  private async createStream(streamName: string, shardCount: number, streamMode: StreamMode): Promise<KinesisOpResult> {
    try {
      await this.client.send(new CreateStreamCommand({ StreamName: streamName, ShardCount: streamMode === "PROVISIONED" ? shardCount || 1 : undefined, StreamModeDetails: { StreamMode: streamMode } }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async deleteStream(streamName: string, enforceConsumerDeletion: boolean): Promise<KinesisOpResult> {
    try {
      await this.client.send(new DeleteStreamCommand({ StreamName: streamName, EnforceConsumerDeletion: enforceConsumerDeletion }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async listStreams(exclusiveStartStreamName: string, limit: number): Promise<KinesisListStreamsResult> {
    try {
      const result = await this.client.send(new ListStreamsCommand({ ExclusiveStartStreamName: exclusiveStartStreamName || undefined, Limit: limit > 0 ? limit : undefined }));
      return { success: true, streamNames: result.StreamNames ?? [], hasMoreStreams: result.HasMoreStreams ?? false, error: "" };
    } catch (err) {
      return { success: false, streamNames: [], hasMoreStreams: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async describeStreamSummary(streamName: string): Promise<KinesisStreamSummary> {
    const empty = { streamArn: "", status: "", streamMode: "", retentionPeriodHours: 0, openShardCount: 0, encryptionType: "", keyId: "" };
    try {
      const result = await this.client.send(new DescribeStreamSummaryCommand({ StreamName: streamName }));
      const summary = result.StreamDescriptionSummary;
      return {
        success: true,
        streamArn: summary?.StreamARN ?? "",
        status: summary?.StreamStatus ?? "",
        streamMode: summary?.StreamModeDetails?.StreamMode ?? "",
        retentionPeriodHours: summary?.RetentionPeriodHours ?? 0,
        openShardCount: summary?.OpenShardCount ?? 0,
        encryptionType: summary?.EncryptionType ?? "NONE",
        keyId: summary?.KeyId ?? "",
        error: "",
      };
    } catch (err) {
      return { success: false, ...empty, error: KinesisManager.errorMessage(err) };
    }
  }

  private async describeLimits(): Promise<KinesisLimitsResult> {
    try {
      const result = await this.client.send(new DescribeLimitsCommand({}));
      return { success: true, shardLimit: result.ShardLimit ?? 0, openShardCount: result.OpenShardCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, shardLimit: 0, openShardCount: 0, error: KinesisManager.errorMessage(err) };
    }
  }

  private async increaseStreamRetentionPeriod(streamName: string, retentionPeriodHours: number): Promise<KinesisOpResult> {
    try {
      await this.client.send(new IncreaseStreamRetentionPeriodCommand({ StreamName: streamName, RetentionPeriodHours: retentionPeriodHours }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async decreaseStreamRetentionPeriod(streamName: string, retentionPeriodHours: number): Promise<KinesisOpResult> {
    try {
      await this.client.send(new DecreaseStreamRetentionPeriodCommand({ StreamName: streamName, RetentionPeriodHours: retentionPeriodHours }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async updateShardCount(streamName: string, targetShardCount: number, scalingType: ScalingType): Promise<KinesisUpdateShardCountResult> {
    try {
      const result = await this.client.send(new UpdateShardCountCommand({ StreamName: streamName, TargetShardCount: targetShardCount, ScalingType: scalingType }));
      return { success: true, currentShardCount: result.CurrentShardCount ?? 0, targetShardCount: result.TargetShardCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, currentShardCount: 0, targetShardCount: 0, error: KinesisManager.errorMessage(err) };
    }
  }

  private async listShards(streamName: string, exclusiveStartShardId: string, maxResults: number, nextToken: string): Promise<KinesisListShardsResult> {
    try {
      const result = await this.client.send(
        new ListShardsCommand({
          StreamName: nextToken ? undefined : streamName || undefined,
          ExclusiveStartShardId: nextToken ? undefined : exclusiveStartShardId || undefined,
          MaxResults: maxResults > 0 ? maxResults : undefined,
          NextToken: nextToken || undefined,
        }),
      );
      const shards: KinesisShard[] = (result.Shards ?? []).map((s) => ({
        shardId: s.ShardId ?? "",
        parentShardId: s.ParentShardId ?? "",
        adjacentParentShardId: s.AdjacentParentShardId ?? "",
        startingHashKey: s.HashKeyRange?.StartingHashKey ?? "",
        endingHashKey: s.HashKeyRange?.EndingHashKey ?? "",
      }));
      return { success: true, shards, nextToken: result.NextToken ?? "", error: "" };
    } catch (err) {
      return { success: false, shards: [], nextToken: "", error: KinesisManager.errorMessage(err) };
    }
  }

  private async mergeShards(streamName: string, shardToMerge: string, adjacentShardToMerge: string): Promise<KinesisOpResult> {
    try {
      await this.client.send(new MergeShardsCommand({ StreamName: streamName, ShardToMerge: shardToMerge, AdjacentShardToMerge: adjacentShardToMerge }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async splitShard(streamName: string, shardToSplit: string, newStartingHashKey: string): Promise<KinesisOpResult> {
    try {
      await this.client.send(new SplitShardCommand({ StreamName: streamName, ShardToSplit: shardToSplit, NewStartingHashKey: newStartingHashKey }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async putRecord(streamName: string, data: string, partitionKey: string, explicitHashKey: string): Promise<KinesisPutRecordResult> {
    try {
      const result = await this.client.send(new PutRecordCommand({ StreamName: streamName, Data: new TextEncoder().encode(data), PartitionKey: partitionKey, ExplicitHashKey: explicitHashKey || undefined }));
      return { success: true, shardId: result.ShardId ?? "", sequenceNumber: result.SequenceNumber ?? "", error: "" };
    } catch (err) {
      return { success: false, shardId: "", sequenceNumber: "", error: KinesisManager.errorMessage(err) };
    }
  }

  private async putRecords(streamName: string, records: KinesisPutRecordsEntry[]): Promise<KinesisPutRecordsResult> {
    try {
      const result = await this.client.send(
        new PutRecordsCommand({
          StreamName: streamName,
          Records: records.map((r) => ({ Data: new TextEncoder().encode(r.data), PartitionKey: r.partitionKey, ExplicitHashKey: r.explicitHashKey || undefined })),
        }),
      );
      const entries: KinesisPutRecordsResultEntry[] = (result.Records ?? []).map((r) => ({ sequenceNumber: r.SequenceNumber ?? "", shardId: r.ShardId ?? "", errorCode: r.ErrorCode ?? "", errorMessage: r.ErrorMessage ?? "" }));
      return { success: true, failedRecordCount: result.FailedRecordCount ?? 0, records: entries, error: "" };
    } catch (err) {
      return { success: false, failedRecordCount: 0, records: [], error: KinesisManager.errorMessage(err) };
    }
  }

  private async getShardIterator(streamName: string, shardId: string, shardIteratorType: ShardIteratorType, startingSequenceNumber: string, timestamp: number): Promise<KinesisShardIteratorResult> {
    try {
      const result = await this.client.send(
        new GetShardIteratorCommand({
          StreamName: streamName,
          ShardId: shardId,
          ShardIteratorType: shardIteratorType,
          StartingSequenceNumber: startingSequenceNumber || undefined,
          Timestamp: timestamp > 0 ? new Date(timestamp) : undefined,
        }),
      );
      return { success: true, shardIterator: result.ShardIterator ?? "", error: "" };
    } catch (err) {
      return { success: false, shardIterator: "", error: KinesisManager.errorMessage(err) };
    }
  }

  private async getRecords(shardIterator: string, limit: number): Promise<KinesisGetRecordsResult> {
    try {
      const result = await this.client.send(new GetRecordsCommand({ ShardIterator: shardIterator, Limit: limit > 0 ? limit : undefined }));
      const decoder = new TextDecoder();
      const records: KinesisRecord[] = (result.Records ?? []).map((r) => ({
        sequenceNumber: r.SequenceNumber ?? "",
        partitionKey: r.PartitionKey ?? "",
        data: r.Data ? decoder.decode(r.Data) : "",
        approximateArrivalTimestamp: r.ApproximateArrivalTimestamp ? r.ApproximateArrivalTimestamp.toISOString() : "",
      }));
      return { success: true, records, nextShardIterator: result.NextShardIterator ?? "", millisBehindLatest: result.MillisBehindLatest ?? 0, error: "" };
    } catch (err) {
      return { success: false, records: [], nextShardIterator: "", millisBehindLatest: 0, error: KinesisManager.errorMessage(err) };
    }
  }

  private async addTagsToStream(streamName: string, tags: Record<string, string>): Promise<KinesisOpResult> {
    try {
      await this.client.send(new AddTagsToStreamCommand({ StreamName: streamName, Tags: tags }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async removeTagsFromStream(streamName: string, tagKeys: string[]): Promise<KinesisOpResult> {
    try {
      await this.client.send(new RemoveTagsFromStreamCommand({ StreamName: streamName, TagKeys: tagKeys }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async listTagsForStream(streamName: string, exclusiveStartTagKey: string, limit: number): Promise<KinesisListTagsResult> {
    try {
      const result = await this.client.send(new ListTagsForStreamCommand({ StreamName: streamName, ExclusiveStartTagKey: exclusiveStartTagKey || undefined, Limit: limit > 0 ? limit : undefined }));
      const tags: KinesisTag[] = (result.Tags ?? []).map((t) => ({ key: t.Key ?? "", value: t.Value ?? "" }));
      return { success: true, tags, hasMoreTags: result.HasMoreTags ?? false, error: "" };
    } catch (err) {
      return { success: false, tags: [], hasMoreTags: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async startStreamEncryption(streamName: string, encryptionType: EncryptionType, keyId: string): Promise<KinesisOpResult> {
    try {
      await this.client.send(new StartStreamEncryptionCommand({ StreamName: streamName, EncryptionType: encryptionType, KeyId: keyId }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }

  private async stopStreamEncryption(streamName: string, encryptionType: EncryptionType, keyId: string): Promise<KinesisOpResult> {
    try {
      await this.client.send(new StopStreamEncryptionCommand({ StreamName: streamName, EncryptionType: encryptionType, KeyId: keyId }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: KinesisManager.errorMessage(err) };
    }
  }
}
