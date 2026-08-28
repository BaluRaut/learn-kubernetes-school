import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { SiloManager, SiloStore } from '../tenancy/silo.manager';

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
 * The §13 zone-data job queue, in miniature. Production mapping:
 *   queue array        -> SQS (two queues: interactive + backfill, plus DLQ)
 *   tick() interval    -> KEDA-scaled worker pods consuming messages
 *   idempotency check  -> same tuple (grower, field, window, method_version)
 *   fake compute       -> imagery fetch + zone derivation
 * The commit shape is the real one: a NEW immutable vintage, the previous
 * version superseded — never edited.
 */
@Injectable()
export class ZoneJobsService implements OnModuleDestroy {
  private jobs = new Map<string, ZoneJob>();
  private queue: string[] = [];
  private seq = 0;
  private timer: NodeJS.Timeout;

  constructor(private readonly silos: SiloManager) {
    this.timer = setInterval(() => this.tick(), 500);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  enqueue(silo: SiloStore, input: {
    fieldId: string; windowStart: number; windowEnd: number;
    methodVersion?: string; lane?: 'interactive' | 'backfill';
  }): ZoneJob {
    if (!silo.fields.has(input.fieldId)) throw new NotFoundException(`unknown field ${input.fieldId}`);
    const methodVersion = input.methodVersion ?? 'v1';

    // Idempotency: the tuple short-circuits if this exact version already committed.
    const existing = [...this.jobs.values()].find(
      (j) =>
        j.growerId === silo.growerId &&
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
      growerId: silo.growerId,
      fieldId: input.fieldId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      methodVersion,
      lane: input.lane ?? 'interactive',
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    // Interactive jobs jump the backfill queue — bulk never starves a waiting user.
    if (job.lane === 'interactive') this.queue.unshift(job.id);
    else this.queue.push(job.id);
    return job;
  }

  get(silo: SiloStore, id: string): ZoneJob {
    const job = this.jobs.get(id);
    if (!job || job.growerId !== silo.growerId) throw new NotFoundException(`unknown job ${id}`);
    return job;
  }

  list(silo: SiloStore): ZoneJob[] {
    return [...this.jobs.values()].filter((j) => j.growerId === silo.growerId);
  }

  /** One worker tick = one message. */
  private tick() {
    const id = this.queue.shift();
    if (!id) return;
    const job = this.jobs.get(id)!;
    job.status = 'computing';
    try {
      const silo = this.silos.forGrower(job.growerId);
      const vintageId = this.silos.nextId(silo, 'vintage');

      // "Compute": deterministic fake zones + zone metrics (PD spread etc.).
      const zones = [0.32, 0.55, 0.13].map((share, i) => ({
        geometry: { type: 'Polygon', note: `zone ${i + 1} placeholder` },
        metrics: { area_share: share, pd: 0.35 + i * 0.18 },
      }));
      const pds = zones.map((z) => z.metrics.pd);
      const vintage = {
        id: vintageId,
        fieldId: job.fieldId,
        windowStart: job.windowStart,
        windowEnd: job.windowEnd,
        zones,
        batchId: `zone_${job.id}`,
        createdAt: new Date().toISOString(),
      };

      // Supersede any previous vintage of the same window — never edit it.
      for (const v of silo.zoningVintages) {
        if (v.fieldId === job.fieldId && v.windowStart === job.windowStart &&
            v.windowEnd === job.windowEnd && !v.supersededBy) {
          v.supersededBy = vintageId;
        }
      }
      silo.zoningVintages.push(vintage);

      // Derived zone-level metrics land as fact rows too (fig-4 fan-out in SQL).
      const spread = Math.max(...pds) - Math.min(...pds);
      const weighted = zones.reduce((acc, z) => acc + z.metrics.pd * z.metrics.area_share, 0);
      const field = silo.fields.get(job.fieldId)!;
      void field;
      silo.factRows.push(
        { fieldId: job.fieldId, seasonYear: job.windowEnd, crop: '-', metricKey: 'pd_spread', value: Number(spread.toFixed(3)), batchId: vintage.batchId },
        { fieldId: job.fieldId, seasonYear: job.windowEnd, crop: '-', metricKey: 'weighted_pd', value: Number(weighted.toFixed(3)), batchId: vintage.batchId },
      );

      job.vintageId = vintageId;
      job.status = 'committed';
    } catch (err) {
      // Production: retries + DLQ. Here: mark failed with the reason.
      job.status = 'failed';
      job.error = (err as Error).message;
    }
  }
}
