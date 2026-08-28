import { Injectable, NotFoundException } from '@nestjs/common';
import { RegistryService } from '../control-plane/registry.service';
import { SiloManager, SiloStore } from '../tenancy/silo.manager';

export interface MappingTemplate {
  id: string;
  growerId: string;
  country: string;
  // source column -> canonical target: "field.external_ref" | "season.year"
  // | "season.crop" | "metric.<key>"
  columnMap: Record<string, string>;
  version: number;
}

export interface RejectRow { rowIndex: number; reason: string }

/**
 * RFC figure 2, condensed: map -> resolve entities -> validate -> COMMIT.
 * Both routes (UI upload / direct inject) call exactly this service — the UI
 * is just a client of it. Staging commits nothing; the commit boundary is the
 * only write, and every fact row is stamped with the batch id.
 */
@Injectable()
export class IngestService {
  private templates = new Map<string, MappingTemplate>();
  private templateSeq = 0;

  constructor(
    private readonly registry: RegistryService,
    private readonly silos: SiloManager,
  ) {}

  saveTemplate(growerId: string, country: string, columnMap: Record<string, string>): MappingTemplate {
    this.templateSeq += 1;
    const tpl: MappingTemplate = { id: `tpl_${this.templateSeq}`, growerId, country, columnMap, version: 1 };
    this.templates.set(tpl.id, tpl);
    return tpl;
  }

  listTemplates(growerId: string): MappingTemplate[] {
    // Templates are scoped per grower — never listed across growers.
    return [...this.templates.values()].filter((t) => t.growerId === growerId);
  }

  runBatch(
    silo: SiloStore,
    source: 'upload' | 'inject',
    templateId: string,
    rows: Record<string, unknown>[],
  ) {
    const tpl = this.templates.get(templateId);
    if (!tpl || tpl.growerId !== silo.growerId) throw new NotFoundException(`unknown template ${templateId}`);

    const batchId = this.silos.nextId(silo, 'batch');
    const rejects: RejectRow[] = [];
    const staged: { fieldId: string; seasonYear: number; crop: string; metricKey: string; value: unknown }[] = [];

    rows.forEach((row, i) => {
      // 1) map source columns -> canonical shape
      const mapped: Record<string, unknown> = {};
      for (const [col, target] of Object.entries(tpl.columnMap)) {
        if (row[col] !== undefined) mapped[target] = row[col];
      }

      // 2) resolve the field via entity_alias (their name -> our id)
      const ref = String(mapped['field.external_ref'] ?? '');
      const fieldId = silo.entityAliases.get(ref);
      if (!fieldId) {
        // Unknown names go to the resolution worklist; the row is rejected,
        // the batch is not blocked (route-2 behaviour).
        rejects.push({ rowIndex: i, reason: `unresolved field "${ref}" — queued to worklist` });
        return;
      }
      const field = silo.fields.get(fieldId)!;
      const farm = silo.farms.get(field.farmId)!;

      const seasonYear = Number(mapped['season.year']);
      const crop = String(mapped['season.crop'] ?? '');
      if (!seasonYear || !crop) {
        rejects.push({ rowIndex: i, reason: 'missing season.year or season.crop' });
        return;
      }

      // 3) validate every metric.* against the country-scoped dictionary.
      //    A row is all-or-nothing: one bad metric rejects the whole row.
      const rowStaged: typeof staged = [];
      for (const [target, value] of Object.entries(mapped)) {
        if (!target.startsWith('metric.')) continue;
        const key = target.slice('metric.'.length);
        const def = this.registry.defFor(key, farm.country, crop);
        if (!def) {
          rejects.push({ rowIndex: i, reason: `no metric_definition for "${key}" (${farm.country}/${crop})` });
          return;
        }
        if (def.valueType === 'number') {
          const n = Number(value);
          if (Number.isNaN(n)) return void rejects.push({ rowIndex: i, reason: `${key}: not a number` });
          if (def.min !== undefined && n < def.min) return void rejects.push({ rowIndex: i, reason: `${key}: ${n} < min ${def.min}` });
          if (def.max !== undefined && n > def.max) return void rejects.push({ rowIndex: i, reason: `${key}: ${n} > max ${def.max} ${def.unit ?? ''}`.trim() });
        }
        if (def.valueType === 'enum' && !def.enumValues?.includes(String(value))) {
          return void rejects.push({ rowIndex: i, reason: `${key}: "${value}" not in ${def.enumValues?.join('|')}` });
        }
        rowStaged.push({ fieldId, seasonYear, crop, metricKey: key, value });
      }
      staged.push(...rowStaged);
    });

    // 4) COMMIT — the only write; everything stamped with the batch id.
    for (const s of staged) silo.factRows.push({ ...s, batchId });
    const batch = {
      id: batchId,
      status: 'committed' as const,
      source,
      committedRows: staged.length,
      rejectedRows: rejects.length,
      createdAt: new Date().toISOString(),
    };
    silo.batches.set(batchId, batch);
    return { batch, rejects };
  }

  /** A batch rolls back as a unit — that is what batch_id buys. */
  rollback(silo: SiloStore, batchId: string) {
    const batch = silo.batches.get(batchId);
    if (!batch) throw new NotFoundException(`unknown batch ${batchId}`);
    const before = silo.factRows.length;
    silo.factRows = silo.factRows.filter((r) => r.batchId !== batchId);
    batch.status = 'rolled_back';
    return { batchId, removedRows: before - silo.factRows.length };
  }
}
