import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { SiloManager } from '../tenancy/silo.manager';
import { SiloRepo } from '../tenancy/silo.repo';
import { AwsService } from '../aws/aws.service';

export interface ZoneJob {
  id: string;
  growerId: string;
  fieldId: string;
  windowStart: number;
  windowEnd: number;
  methodVersion: string;
  lane: 'interactive' | 'backfill';
  status: 'queued' | 'computing' | 'committed' | 'failed';
  error?: string;
  vintageId?: string;
  createdAt: string;
}

/**
 * The §13 zone-data job queue. Two transports, one worker:
 *   AWS mode    -> messages go through REAL SQS queues (LocalStack locally,
 *                  actual SQS in production — identical SDK calls); the tick
 *                  loop stands in for KEDA-scaled worker pods.
 *   memory mode -> a plain array.
 * Job status lives in the control plane (zone_jobs table in production;
 * a map here). The commit shape is the real one either way: a NEW immutable
 * vintage, the previous version superseded — never edited.
 */
@Injectable()
export class ZoneJobsService implements OnModuleDestroy {
  private readonly log = new Logger('zone-jobs');
  private jobs = new Map<string, ZoneJob>();
  private memQueue: string[] = [];
  private seq = 0;
  private timer: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly silos: SiloManager,
    private readonly aws: AwsService,
  ) {
    this.timer = setInterval(() => void this.tick(), 500);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async enqueue(repo: SiloRepo, input: {
    fieldId: string; windowStart: number; windowEnd: number;
    methodVersion?: string; lane?: 'interactive' | 'backfill';
  }): Promise<ZoneJob> {
    if (!(await repo.getField(input.fieldId))) throw new NotFoundException(`unknown field ${input.fieldId}`);
    const methodVersion = input.methodVersion ?? 'v1';

    // Idempotency: the tuple short-circuits if this exact version is already in flight/committed.
    const existing = [...this.jobs.values()].find(
      (j) =>
        j.growerId === repo.growerId &&
        j.fieldId === input.fieldId &&
        j.windowStart === input.windowStart &&
        j.windowEnd === input.windowEnd &&
        j.methodVersion === methodVersion &&
        j.status !== 'failed',
    );
    if (existing) return existing;

    this.seq += 1;
    const job: ZoneJob = {
      id: `zj_${this.seq}`,
      growerId: repo.growerId,
      fieldId: input.fieldId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      methodVersion,
      lane: input.lane ?? 'interactive',
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);

    if (this.aws.enabled) {
      // The queue carries a REFERENCE, never row data — silo discipline holds.
      await this.aws.sendZoneJob(job.lane, { jobId: job.id });
    } else if (job.lane === 'interactive') {
      this.memQueue.unshift(job.id); // interactive jumps the backfill queue
    } else {
      this.memQueue.push(job.id);
    }
    return job;
  }

  get(repo: SiloRepo, id: string): ZoneJob {
    const job = this.jobs.get(id);
    if (!job || job.growerId !== repo.growerId) throw new NotFoundException(`unknown job ${id}`);
    return job;
  }

  list(repo: SiloRepo): ZoneJob[] {
    return [...this.jobs.values()].filter((j) => j.growerId === repo.growerId);
  }

  /** One worker tick = one message. Interactive queue polled first. */
  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      let jobId: string | undefined;
      let ack: (() => Promise<void>) | undefined;

      if (this.aws.enabled) {
        const msg = await this.aws.receiveZoneJob();
        if (msg) { jobId = msg.payload.jobId; ack = msg.ack; }
      } else {
        jobId = this.memQueue.shift();
      }
      if (!jobId) return;

      const job = this.jobs.get(jobId);
      if (!job) { await ack?.(); return; }
      job.status = 'computing';
      try {
        await this.compute(job);
        job.status = 'committed';
      } catch (err) {
        // Production: SQS visibility timeout retries this, then DLQ + alarm.
        job.status = 'failed';
        job.error = (err as Error).message;
        this.log.error(`job ${job.id} failed: ${job.error}`);
      }
      await ack?.(); // delete the message only after the outcome is recorded
    } finally {
      this.busy = false;
    }
  }

  private async compute(job: ZoneJob) {
    const repo = await this.silos.forGrower(job.growerId);
    const vintageId = await repo.nextId('vintage');

    // "Compute": deterministic fake zones + zone metrics (PD spread etc.).
    // Production: imagery fetch (cached in S3) + zone derivation.
    const zones = [0.32, 0.55, 0.13].map((share, i) => ({
      geometry: { type: 'Polygon', note: `zone ${i + 1} placeholder` },
      metrics: { area_share: share, pd: 0.35 + i * 0.18 },
    }));
    const pds = zones.map((z) => z.metrics.pd);

    await repo.insertVintage({
      id: vintageId,
      fieldId: job.fieldId,
      windowStart: job.windowStart,
      windowEnd: job.windowEnd,
      zones,
      batchId: `zone_${job.id}`,
      createdAt: new Date().toISOString(),
    });
    // Supersede any previous vintage of the same window — never edit it.
    await repo.supersedeVintages(job.fieldId, job.windowStart, job.windowEnd, vintageId);

    // Derived zone-level metrics land as fact rows too (fig-4 fan-out in SQL).
    const spread = Math.max(...pds) - Math.min(...pds);
    const weighted = zones.reduce((acc, z) => acc + z.metrics.pd * z.metrics.area_share, 0);
    await repo.insertFacts([
      { fieldId: job.fieldId, seasonYear: job.windowEnd, crop: '-', metricKey: 'pd_spread', value: Number(spread.toFixed(3)), batchId: `zone_${job.id}` },
      { fieldId: job.fieldId, seasonYear: job.windowEnd, crop: '-', metricKey: 'weighted_pd', value: Number(weighted.toFixed(3)), batchId: `zone_${job.id}` },
    ]);
    job.vintageId = vintageId;
  }
}
