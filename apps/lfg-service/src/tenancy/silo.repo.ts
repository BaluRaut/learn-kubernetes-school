// The silo contract. Request code gets ONE grower's repo — there is no API
// on it that can reach another grower. Both adapters (memory / Postgres)
// honour the same shape, so the domain code never knows which one it has.

export interface Farm { id: string; name: string; country: string }
export interface Field { id: string; farmId: string; name: string; externalRef?: string; boundary?: unknown }
export interface FactRow {
  fieldId: string; seasonYear: number; crop: string;
  metricKey: string; value: unknown; batchId: string;
}
export interface ZoningVintage {
  id: string; fieldId: string; windowStart: number; windowEnd: number;
  zones: { geometry: unknown; metrics: Record<string, number> }[];
  batchId: string; supersededBy?: string; createdAt: string;
}
export interface IngestBatch {
  id: string; status: 'committed' | 'rolled_back'; source: 'upload' | 'inject';
  committedRows: number; rejectedRows: number; createdAt: string;
}

export interface MetricFilter { fieldId?: string; metricKey?: string; seasonYear?: number }

export interface SiloRepo {
  readonly growerId: string;

  nextId(prefix: string): Promise<string>;

  createFarm(name: string, country: string): Promise<Farm>;
  listFarms(): Promise<Farm[]>;
  getFarm(id: string): Promise<Farm | null>;

  createField(f: Omit<Field, 'id'>): Promise<Field>;
  listFields(): Promise<Field[]>;
  getField(id: string): Promise<Field | null>;
  fieldByAlias(ref: string): Promise<string | null>;
  setAlias(ref: string, fieldId: string): Promise<void>;

  insertFacts(rows: FactRow[]): Promise<void>;
  queryMetrics(filter: MetricFilter): Promise<FactRow[]>;
  deleteBatchRows(batchId: string): Promise<number>;

  saveBatch(batch: IngestBatch): Promise<void>;
  listBatches(): Promise<IngestBatch[]>;
  getBatch(id: string): Promise<IngestBatch | null>;

  insertVintage(v: ZoningVintage): Promise<void>;
  supersedeVintages(fieldId: string, windowStart: number, windowEnd: number, newId: string): Promise<void>;
  listVintages(fieldId: string): Promise<ZoningVintage[]>;
}
