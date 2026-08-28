import { Injectable } from '@nestjs/common';

/** Everything one grower owns. In production: one Postgres database per grower. */
export interface SiloStore {
  growerId: string;
  farms: Map<string, Farm>;
  fields: Map<string, Field>;
  factRows: FactRow[];              // field_season_metric — metrics as ROWS
  zoningVintages: ZoningVintage[];  // variability_window versions, immutable
  entityAliases: Map<string, string>; // "their name" -> our field id
  batches: Map<string, IngestBatch>;
  seq: number;
}

export interface Farm { id: string; name: string; country: string }
export interface Field { id: string; farmId: string; name: string; externalRef?: string; boundary?: unknown }
export interface FactRow {
  fieldId: string;
  seasonYear: number;
  crop: string;
  metricKey: string;
  value: unknown;
  batchId: string;                  // provenance on EVERY fact row
}
export interface ZoningVintage {
  id: string;
  fieldId: string;
  windowStart: number;
  windowEnd: number;
  zones: { geometry: unknown; metrics: Record<string, number> }[];
  batchId: string;
  supersededBy?: string;
  createdAt: string;
}
export interface IngestBatch {
  id: string;
  status: 'committed' | 'rolled_back';
  source: 'upload' | 'inject';
  committedRows: number;
  rejectedRows: number;
  createdAt: string;
}

/**
 * Pool-per-grower, the §4 core trick. Here each "pool" is an in-memory store;
 * in production forGrower() returns a cached pg.Pool built from the catalog's
 * host + Secrets Manager credentials, LRU-capped (~200 pools).
 *
 * The isolation property this preserves either way: request code receives ONE
 * grower's handle and has no API that can reach another grower's data.
 */
@Injectable()
export class SiloManager {
  private silos = new Map<string, SiloStore>();

  forGrower(growerId: string): SiloStore {
    let silo = this.silos.get(growerId);
    if (!silo) {
      silo = {
        growerId,
        farms: new Map(),
        fields: new Map(),
        factRows: [],
        zoningVintages: [],
        entityAliases: new Map(),
        batches: new Map(),
        seq: 0,
      };
      this.silos.set(growerId, silo);
    }
    return silo;
  }

  nextId(silo: SiloStore, prefix: string): string {
    silo.seq += 1;
    return `${prefix}_${silo.seq}`;
  }
}
