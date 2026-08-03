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

/** Every Kinesis node (stream management, shards, records, tags) needs the same boilerplate: build
 * a client from an access key pair, call one SDK method, and turn either a result or a thrown error
 * into a plain {success, error} shape. Centralized here once instead of repeated per node (see
 * nodes/kinesis.ts, which only wires pins to these methods) — same structure as DynamoDbManager. */

function kinesisErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

export interface KinesisTag {
  key: string;
  value: string;
}

export interface KinesisListTagsResult extends KinesisOpResult {
  tags: KinesisTag[];
  hasMoreTags: boolean;
}

export interface KinesisUpdateShardCountResult extends KinesisOpResult {
  currentShardCount: number;
  targetShardCount: number;
}

const managerCache = new Map<string, KinesisManager>();

export class KinesisManager {
  private readonly client: KinesisClient;

  constructor(accessKeyId: string, secretAccessKey: string, region: string, sessionToken: string, endpoint: string) {
    this.client = new KinesisClient({
      region: region || "us-east-1",
      endpoint: endpoint || undefined,
      credentials: { accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined },
    });
  }

  /** Reuses one KinesisManager (and its underlying client) per distinct credential instead of
   * building a fresh one per node execution — same reasoning as DynamoDbManager.forCredential. */
  static forCredential(accessKeyId: string, secretAccessKey: string, region: string, sessionToken: string, endpoint: string): KinesisManager {
    const cacheKey = [accessKeyId, secretAccessKey, region, sessionToken, endpoint].join("\u0000");
    let manager = managerCache.get(cacheKey);
    if (!manager) {
      manager = new KinesisManager(accessKeyId, secretAccessKey, region, sessionToken, endpoint);
      managerCache.set(cacheKey, manager);
    }
    return manager;
  }

  async createStream(streamName: string, shardCount: number, streamMode: StreamMode): Promise<KinesisOpResult> {
    try {
      await this.client.send(new CreateStreamCommand({ StreamName: streamName, ShardCount: streamMode === "PROVISIONED" ? shardCount || 1 : undefined, StreamModeDetails: { StreamMode: streamMode } }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async deleteStream(streamName: string, enforceConsumerDeletion: boolean): Promise<KinesisOpResult> {
    try {
      await this.client.send(new DeleteStreamCommand({ StreamName: streamName, EnforceConsumerDeletion: enforceConsumerDeletion }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async listStreams(exclusiveStartStreamName: string, limit: number): Promise<KinesisListStreamsResult> {
    try {
      const result = await this.client.send(new ListStreamsCommand({ ExclusiveStartStreamName: exclusiveStartStreamName || undefined, Limit: limit > 0 ? limit : undefined }));
      return { success: true, streamNames: result.StreamNames ?? [], hasMoreStreams: result.HasMoreStreams ?? false, error: "" };
    } catch (err) {
      return { success: false, streamNames: [], hasMoreStreams: false, error: kinesisErrorMessage(err) };
    }
  }

  async describeStreamSummary(streamName: string): Promise<KinesisStreamSummary> {
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
      return { success: false, ...empty, error: kinesisErrorMessage(err) };
    }
  }

  async describeLimits(): Promise<KinesisLimitsResult> {
    try {
      const result = await this.client.send(new DescribeLimitsCommand({}));
      return { success: true, shardLimit: result.ShardLimit ?? 0, openShardCount: result.OpenShardCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, shardLimit: 0, openShardCount: 0, error: kinesisErrorMessage(err) };
    }
  }

  async increaseStreamRetentionPeriod(streamName: string, retentionPeriodHours: number): Promise<KinesisOpResult> {
    try {
      await this.client.send(new IncreaseStreamRetentionPeriodCommand({ StreamName: streamName, RetentionPeriodHours: retentionPeriodHours }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async decreaseStreamRetentionPeriod(streamName: string, retentionPeriodHours: number): Promise<KinesisOpResult> {
    try {
      await this.client.send(new DecreaseStreamRetentionPeriodCommand({ StreamName: streamName, RetentionPeriodHours: retentionPeriodHours }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async updateShardCount(streamName: string, targetShardCount: number, scalingType: ScalingType): Promise<KinesisUpdateShardCountResult> {
    try {
      const result = await this.client.send(new UpdateShardCountCommand({ StreamName: streamName, TargetShardCount: targetShardCount, ScalingType: scalingType }));
      return { success: true, currentShardCount: result.CurrentShardCount ?? 0, targetShardCount: result.TargetShardCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, currentShardCount: 0, targetShardCount: 0, error: kinesisErrorMessage(err) };
    }
  }

  async listShards(streamName: string, exclusiveStartShardId: string, maxResults: number, nextToken: string): Promise<KinesisListShardsResult> {
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
      return { success: false, shards: [], nextToken: "", error: kinesisErrorMessage(err) };
    }
  }

  async mergeShards(streamName: string, shardToMerge: string, adjacentShardToMerge: string): Promise<KinesisOpResult> {
    try {
      await this.client.send(new MergeShardsCommand({ StreamName: streamName, ShardToMerge: shardToMerge, AdjacentShardToMerge: adjacentShardToMerge }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async splitShard(streamName: string, shardToSplit: string, newStartingHashKey: string): Promise<KinesisOpResult> {
    try {
      await this.client.send(new SplitShardCommand({ StreamName: streamName, ShardToSplit: shardToSplit, NewStartingHashKey: newStartingHashKey }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async putRecord(streamName: string, data: string, partitionKey: string, explicitHashKey: string): Promise<KinesisPutRecordResult> {
    try {
      const result = await this.client.send(new PutRecordCommand({ StreamName: streamName, Data: new TextEncoder().encode(data), PartitionKey: partitionKey, ExplicitHashKey: explicitHashKey || undefined }));
      return { success: true, shardId: result.ShardId ?? "", sequenceNumber: result.SequenceNumber ?? "", error: "" };
    } catch (err) {
      return { success: false, shardId: "", sequenceNumber: "", error: kinesisErrorMessage(err) };
    }
  }

  async putRecords(streamName: string, records: KinesisPutRecordsEntry[]): Promise<KinesisPutRecordsResult> {
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
      return { success: false, failedRecordCount: 0, records: [], error: kinesisErrorMessage(err) };
    }
  }

  async getShardIterator(streamName: string, shardId: string, shardIteratorType: ShardIteratorType, startingSequenceNumber: string, timestamp: number): Promise<KinesisShardIteratorResult> {
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
      return { success: false, shardIterator: "", error: kinesisErrorMessage(err) };
    }
  }

  async getRecords(shardIterator: string, limit: number): Promise<KinesisGetRecordsResult> {
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
      return { success: false, records: [], nextShardIterator: "", millisBehindLatest: 0, error: kinesisErrorMessage(err) };
    }
  }

  async addTagsToStream(streamName: string, tags: Record<string, string>): Promise<KinesisOpResult> {
    try {
      await this.client.send(new AddTagsToStreamCommand({ StreamName: streamName, Tags: tags }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async removeTagsFromStream(streamName: string, tagKeys: string[]): Promise<KinesisOpResult> {
    try {
      await this.client.send(new RemoveTagsFromStreamCommand({ StreamName: streamName, TagKeys: tagKeys }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async listTagsForStream(streamName: string, exclusiveStartTagKey: string, limit: number): Promise<KinesisListTagsResult> {
    try {
      const result = await this.client.send(new ListTagsForStreamCommand({ StreamName: streamName, ExclusiveStartTagKey: exclusiveStartTagKey || undefined, Limit: limit > 0 ? limit : undefined }));
      const tags: KinesisTag[] = (result.Tags ?? []).map((t) => ({ key: t.Key ?? "", value: t.Value ?? "" }));
      return { success: true, tags, hasMoreTags: result.HasMoreTags ?? false, error: "" };
    } catch (err) {
      return { success: false, tags: [], hasMoreTags: false, error: kinesisErrorMessage(err) };
    }
  }

  async startStreamEncryption(streamName: string, encryptionType: EncryptionType, keyId: string): Promise<KinesisOpResult> {
    try {
      await this.client.send(new StartStreamEncryptionCommand({ StreamName: streamName, EncryptionType: encryptionType, KeyId: keyId }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }

  async stopStreamEncryption(streamName: string, encryptionType: EncryptionType, keyId: string): Promise<KinesisOpResult> {
    try {
      await this.client.send(new StopStreamEncryptionCommand({ StreamName: streamName, EncryptionType: encryptionType, KeyId: keyId }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: kinesisErrorMessage(err) };
    }
  }
}
