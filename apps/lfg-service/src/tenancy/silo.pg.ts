import { Pool } from 'pg';
import { Farm, Field, FactRow, IngestBatch, MetricFilter, SiloRepo, ZoningVintage } from './silo.repo';

/**
 * The REAL silo pattern on a local Postgres server:
 *   - one DATABASE per grower, created on first touch (provisioning)
 *   - migrations applied per silo (the catalog-driven migration job, inlined)
 *   - one small connection pool per silo, cached (pool-per-grower)
 * A connection to grower A's database physically cannot read grower B.
 */
const MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS farms (
    id text PRIMARY KEY, name text NOT NULL, country text NOT NULL);
  CREATE TABLE IF NOT EXISTS fields (
    id text PRIMARY KEY, farm_id text NOT NULL REFERENCES farms(id),
    name text NOT NULL, external_ref text, boundary jsonb);
  CREATE TABLE IF NOT EXISTS entity_aliases (
    ref text PRIMARY KEY, field_id text NOT NULL REFERENCES fields(id));
  CREATE TABLE IF NOT EXISTS fact_rows (
    field_id text NOT NULL REFERENCES fields(id),
    season_year int NOT NULL, crop text NOT NULL,
    metric_key text NOT NULL, value jsonb, batch_id text NOT NULL);
  CREATE INDEX IF NOT EXISTS fact_rows_batch ON fact_rows(batch_id);
  CREATE INDEX IF NOT EXISTS fact_rows_metric ON fact_rows(metric_key, season_year);
  CREATE TABLE IF NOT EXISTS batches (
    id text PRIMARY KEY, status text NOT NULL, source text NOT NULL,
    committed_rows int NOT NULL, rejected_rows int NOT NULL, created_at timestamptz NOT NULL);
  CREATE TABLE IF NOT EXISTS vintages (
    id text PRIMARY KEY, field_id text NOT NULL REFERENCES fields(id),
    window_start int NOT NULL, window_end int NOT NULL,
    zones jsonb NOT NULL, batch_id text NOT NULL,
    superseded_by text, created_at timestamptz NOT NULL);
  CREATE SEQUENCE IF NOT EXISTS silo_seq;
`;

export class PgSiloRepo implements SiloRepo {
  constructor(readonly growerId: string, private readonly pool: Pool) {}

  /** Provision + migrate + pool — the whole silo lifecycle in one call. */
  static async provision(adminUrl: string, growerId: string): Promise<PgSiloRepo> {
    if (!/^[a-z][a-z0-9_]*$/.test(growerId)) throw new Error(`unsafe grower id: ${growerId}`);
    const admin = new Pool({ connectionString: adminUrl, max: 2 });
    try {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [growerId]);
      if (exists.rowCount === 0) {
        // CREATE DATABASE cannot be parameterized; id is regex-validated above.
        await admin.query(`CREATE DATABASE ${growerId}`);
      }
    } finally {
      await admin.end();
    }
    const siloUrl = new URL(adminUrl);
    siloUrl.pathname = `/${growerId}`;
    // Small pool per silo (design doc §4): 5 connections, LRU-capped upstream.
    const pool = new Pool({ connectionString: siloUrl.toString(), max: 5 });
    await pool.query(MIGRATIONS);
    return new PgSiloRepo(growerId, pool);
  }

  async nextId(prefix: string): Promise<string> {
    const r = await this.pool.query(`SELECT nextval('silo_seq') AS n`);
    return `${prefix}_${r.rows[0].n}`;
  }

  async createFarm(name: string, country: string): Promise<Farm> {
    const id = await this.nextId('farm');
    await this.pool.query('INSERT INTO farms (id, name, country) VALUES ($1, $2, $3)', [id, name, country]);
    return { id, name, country };
  }
  async listFarms(): Promise<Farm[]> {
    const r = await this.pool.query('SELECT id, name, country FROM farms ORDER BY id');
    return r.rows;
  }
  async getFarm(id: string): Promise<Farm | null> {
    const r = await this.pool.query('SELECT id, name, country FROM farms WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  }

  async createField(f: Omit<Field, 'id'>): Promise<Field> {
    const id = await this.nextId('field');
    await this.pool.query(
      'INSERT INTO fields (id, farm_id, name, external_ref, boundary) VALUES ($1, $2, $3, $4, $5)',
      [id, f.farmId, f.name, f.externalRef ?? null, f.boundary ? JSON.stringify(f.boundary) : null],
    );
    return { id, ...f };
  }
  async listFields(): Promise<Field[]> {
    const r = await this.pool.query('SELECT id, farm_id, name, external_ref, boundary FROM fields ORDER BY id');
    return r.rows.map(this.rowToField);
  }
  async getField(id: string): Promise<Field | null> {
    const r = await this.pool.query('SELECT id, farm_id, name, external_ref, boundary FROM fields WHERE id = $1', [id]);
    return r.rows[0] ? this.rowToField(r.rows[0]) : null;
  }
  private rowToField(row: any): Field {
    return { id: row.id, farmId: row.farm_id, name: row.name, externalRef: row.external_ref ?? undefined, boundary: row.boundary ?? undefined };
  }
  async fieldByAlias(ref: string): Promise<string | null> {
    const r = await this.pool.query('SELECT field_id FROM entity_aliases WHERE ref = $1', [ref]);
    return r.rows[0]?.field_id ?? null;
  }
  async setAlias(ref: string, fieldId: string): Promise<void> {
    await this.pool.query(
      'INSERT INTO entity_aliases (ref, field_id) VALUES ($1, $2) ON CONFLICT (ref) DO UPDATE SET field_id = $2',
      [ref, fieldId],
    );
  }

  async insertFacts(rows: FactRow[]): Promise<void> {
    if (!rows.length) return;
    // One transaction = the commit boundary.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        await client.query(
          'INSERT INTO fact_rows (field_id, season_year, crop, metric_key, value, batch_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [r.fieldId, r.seasonYear, r.crop, r.metricKey, JSON.stringify(r.value), r.batchId],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async queryMetrics(f: MetricFilter): Promise<FactRow[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (f.fieldId) { params.push(f.fieldId); clauses.push(`field_id = $${params.length}`); }
    if (f.metricKey) { params.push(f.metricKey); clauses.push(`metric_key = $${params.length}`); }
    if (f.seasonYear) { params.push(f.seasonYear); clauses.push(`season_year = $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const r = await this.pool.query(
      `SELECT field_id, season_year, crop, metric_key, value, batch_id FROM fact_rows ${where} ORDER BY season_year DESC`,
      params,
    );
    return r.rows.map((row) => ({
      fieldId: row.field_id, seasonYear: row.season_year, crop: row.crop,
      metricKey: row.metric_key, value: row.value, batchId: row.batch_id,
    }));
  }
  async deleteBatchRows(batchId: string): Promise<number> {
    const r = await this.pool.query('DELETE FROM fact_rows WHERE batch_id = $1', [batchId]);
    return r.rowCount ?? 0;
  }

  async saveBatch(b: IngestBatch): Promise<void> {
    await this.pool.query(
      `INSERT INTO batches (id, status, source, committed_rows, rejected_rows, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET status = $2`,
      [b.id, b.status, b.source, b.committedRows, b.rejectedRows, b.createdAt],
    );
  }
  async listBatches(): Promise<IngestBatch[]> {
    const r = await this.pool.query('SELECT * FROM batches ORDER BY created_at DESC');
    return r.rows.map(this.rowToBatch);
  }
  async getBatch(id: string): Promise<IngestBatch | null> {
    const r = await this.pool.query('SELECT * FROM batches WHERE id = $1', [id]);
    return r.rows[0] ? this.rowToBatch(r.rows[0]) : null;
  }
  private rowToBatch(row: any): IngestBatch {
    return {
      id: row.id, status: row.status, source: row.source,
      committedRows: row.committed_rows, rejectedRows: row.rejected_rows,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    };
  }

  async insertVintage(v: ZoningVintage): Promise<void> {
    await this.pool.query(
      `INSERT INTO vintages (id, field_id, window_start, window_end, zones, batch_id, superseded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [v.id, v.fieldId, v.windowStart, v.windowEnd, JSON.stringify(v.zones), v.batchId, v.supersededBy ?? null, v.createdAt],
    );
  }
  async supersedeVintages(fieldId: string, ws: number, we: number, newId: string): Promise<void> {
    await this.pool.query(
      `UPDATE vintages SET superseded_by = $4
       WHERE field_id = $1 AND window_start = $2 AND window_end = $3
         AND superseded_by IS NULL AND id <> $4`,
      [fieldId, ws, we, newId],
    );
  }
  async listVintages(fieldId: string): Promise<ZoningVintage[]> {
    const r = await this.pool.query('SELECT * FROM vintages WHERE field_id = $1', [fieldId]);
    return r.rows.map((row) => ({
      id: row.id, fieldId: row.field_id, windowStart: row.window_start, windowEnd: row.window_end,
      zones: row.zones, batchId: row.batch_id, supersededBy: row.superseded_by ?? undefined,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));
  }
}
