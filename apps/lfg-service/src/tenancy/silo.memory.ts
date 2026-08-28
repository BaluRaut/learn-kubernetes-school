import { Farm, Field, FactRow, IngestBatch, MetricFilter, SiloRepo, ZoningVintage } from './silo.repo';

/** Zero-infrastructure adapter: everything in process memory. */
export class MemorySiloRepo implements SiloRepo {
  private farms = new Map<string, Farm>();
  private fields = new Map<string, Field>();
  private aliases = new Map<string, string>();
  private facts: FactRow[] = [];
  private batches = new Map<string, IngestBatch>();
  private vintages: ZoningVintage[] = [];
  private seq = 0;

  constructor(readonly growerId: string) {}

  async nextId(prefix: string): Promise<string> {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  async createFarm(name: string, country: string): Promise<Farm> {
    const farm = { id: await this.nextId('farm'), name, country };
    this.farms.set(farm.id, farm);
    return farm;
  }
  async listFarms() { return [...this.farms.values()]; }
  async getFarm(id: string) { return this.farms.get(id) ?? null; }

  async createField(f: Omit<Field, 'id'>): Promise<Field> {
    const field = { id: await this.nextId('field'), ...f };
    this.fields.set(field.id, field);
    return field;
  }
  async listFields() { return [...this.fields.values()]; }
  async getField(id: string) { return this.fields.get(id) ?? null; }
  async fieldByAlias(ref: string) { return this.aliases.get(ref) ?? null; }
  async setAlias(ref: string, fieldId: string) { this.aliases.set(ref, fieldId); }

  async insertFacts(rows: FactRow[]) { this.facts.push(...rows); }
  async queryMetrics(f: MetricFilter) {
    return this.facts.filter(
      (r) =>
        (!f.fieldId || r.fieldId === f.fieldId) &&
        (!f.metricKey || r.metricKey === f.metricKey) &&
        (!f.seasonYear || r.seasonYear === f.seasonYear),
    );
  }
  async deleteBatchRows(batchId: string) {
    const before = this.facts.length;
    this.facts = this.facts.filter((r) => r.batchId !== batchId);
    return before - this.facts.length;
  }

  async saveBatch(batch: IngestBatch) { this.batches.set(batch.id, batch); }
  async listBatches() { return [...this.batches.values()]; }
  async getBatch(id: string) { return this.batches.get(id) ?? null; }

  async insertVintage(v: ZoningVintage) { this.vintages.push(v); }
  async supersedeVintages(fieldId: string, ws: number, we: number, newId: string) {
    for (const v of this.vintages) {
      if (v.fieldId === fieldId && v.windowStart === ws && v.windowEnd === we && !v.supersededBy && v.id !== newId) {
        v.supersededBy = newId;
      }
    }
  }
  async listVintages(fieldId: string) { return this.vintages.filter((v) => v.fieldId === fieldId); }
}
