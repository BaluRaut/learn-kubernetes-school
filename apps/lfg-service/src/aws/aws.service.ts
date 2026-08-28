import { Injectable, Logger } from '@nestjs/common';
import { S3Client, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  SQSClient, CreateQueueCommand, GetQueueUrlCommand,
  SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { SecretsManagerClient, CreateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { cfg } from '../config';

export const RAW_BUCKET = 'lfg-raw';
export const QUEUES = { interactive: 'lfg-zone-interactive', backfill: 'lfg-zone-backfill' } as const;

/**
 * One thin AWS wrapper. Locally the endpoint is LocalStack (http://localhost:4566);
 * in production the endpoint override disappears and the SAME calls hit real AWS.
 * When no endpoint is configured, callers get no-ops (memory mode).
 */
@Injectable()
export class AwsService {
  private readonly log = new Logger('aws');
  readonly enabled = cfg.aws;
  private s3?: S3Client;
  private sqs?: SQSClient;
  private secrets?: SecretsManagerClient;
  private queueUrls = new Map<string, string>();

  constructor() {
    if (!this.enabled) return;
    const common = {
      region: cfg.awsRegion,
      endpoint: cfg.awsEndpoint,
      credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test' },
    };
    this.s3 = new S3Client({ ...common, forcePathStyle: true }); // path-style for LocalStack
    this.sqs = new SQSClient(common);
    this.secrets = new SecretsManagerClient(common);
  }

  /** Idempotent bootstrap: bucket + both zone queues. */
  async ensureInfra(): Promise<void> {
    if (!this.enabled) return;
    await this.s3!.send(new CreateBucketCommand({ Bucket: RAW_BUCKET })).catch((e) => {
      if (!/BucketAlready/.test(String(e.name))) throw e;
    });
    for (const name of Object.values(QUEUES)) {
      await this.sqs!.send(new CreateQueueCommand({ QueueName: name }));
      const { QueueUrl } = await this.sqs!.send(new GetQueueUrlCommand({ QueueName: name }));
      this.queueUrls.set(name, QueueUrl!);
    }
    this.log.log(`LocalStack/AWS ready: s3://${RAW_BUCKET}, queues ${Object.values(QUEUES).join(', ')}`);
  }

  /** Raw batch payloads land under the grower's own prefix (per-silo S3 discipline). */
  async putRaw(growerId: string, key: string, body: unknown): Promise<string | null> {
    if (!this.enabled) return null;
    const Key = `${growerId}/${key}`;
    await this.s3!.send(new PutObjectCommand({
      Bucket: RAW_BUCKET, Key, Body: JSON.stringify(body), ContentType: 'application/json',
    }));
    return `s3://${RAW_BUCKET}/${Key}`;
  }

  /** Provisioning writes the silo's credentials where the app will read them. */
  async createSiloSecret(growerId: string, value: Record<string, string>): Promise<void> {
    if (!this.enabled) return;
    await this.secrets!
      .send(new CreateSecretCommand({ Name: `lfg/${growerId}/db`, SecretString: JSON.stringify(value) }))
      .catch((e) => {
        if (!/ResourceExists/.test(String(e.name))) throw e;
      });
  }

  async sendZoneJob(lane: keyof typeof QUEUES, payload: unknown): Promise<void> {
    await this.sqs!.send(new SendMessageCommand({
      QueueUrl: this.queueUrls.get(QUEUES[lane])!,
      MessageBody: JSON.stringify(payload),
    }));
  }

  /** Interactive first, then backfill — bulk never starves a waiting user. */
  async receiveZoneJob(): Promise<{ payload: any; ack: () => Promise<void> } | null> {
    for (const name of [QUEUES.interactive, QUEUES.backfill]) {
      const url = this.queueUrls.get(name);
      if (!url) continue;
      const r = await this.sqs!.send(new ReceiveMessageCommand({ QueueUrl: url, MaxNumberOfMessages: 1, WaitTimeSeconds: 0 }));
      const msg = r.Messages?.[0];
      if (msg) {
        return {
          payload: JSON.parse(msg.Body!),
          ack: async () => {
            await this.sqs!.send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: msg.ReceiptHandle! }));
          },
        };
      }
    }
    return null;
  }
}
