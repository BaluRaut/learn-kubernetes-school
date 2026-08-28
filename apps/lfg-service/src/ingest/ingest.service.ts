import { Injectable, NotFoundException } from '@nestjs/common';
import { RegistryService } from '../control-plane/registry.service';
import { AwsService } from '../aws/aws.service';
import { FactRow, SiloRepo } from '../tenancy/silo.repo';

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
 * only write, and every fact row is stamped with the batch id. The raw payload
 * is archived to S3 under the grower's own prefix before commit (provenance +
 * the replay-from-raw recovery path).
 */
@Injectable()
export class IngestService {
  private templates = new Map<string, MappingTemplate>();
  private templateSeq = 0;

  constructor(
    private readonly registry: RegistryService,
    private readonly aws: AwsService,
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

  async runBatch(
    repo: SiloRepo,
    source: 'upload' | 'inject',
    templateId: string,
    rows: Record<string, unknown>[],
  ) {
    const tpl = this.templates.get(templateId);
    if (!tpl || tpl.growerId !== repo.growerId) throw new NotFoundException(`unknown template ${templateId}`);

    const batchId = await repo.nextId('batch');
    // Raw file lands in the grower's S3 prefix BEFORE anything is committed.
    const rawLocation = await this.aws.putRaw(repo.growerId, `raw/${batchId}.json`, { templateId, source, rows });

    const rejects: RejectRow[] = [];
    const staged: FactRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // 1) map source columns -> canonical shape
      const mapped: Record<string, unknown> = {};
      for (const [col, target] of Object.entries(tpl.columnMap)) {
        if (row[col] !== undefined) mapped[target] = row[col];
      }

      // 2) resolve the field via entity_alias (their name -> our id)
      const ref = String(mapped['field.external_ref'] ?? '');
      const fieldId = await repo.fieldByAlias(ref);
      if (!fieldId) {
        // Unknown names go to the resolution worklist; the row is rejected,
        // the batch is not blocked (route-2 behaviour).
        rejects.push({ rowIndex: i, reason: `unresolved field "${ref}" — queued to worklist` });
        continue;
      }
      const field = (await repo.getField(fieldId))!;
      const farm = (await repo.getFarm(field.farmId))!;

      const seasonYear = Number(mapped['season.year']);
      const crop = String(mapped['season.crop'] ?? '');
      if (!seasonYear || !crop) {
        rejects.push({ rowIndex: i, reason: 'missing season.year or season.crop' });
        continue;
      }

      // 3) validate every metric.* against the country-scoped dictionary.
      //    A row is all-or-nothing: one bad metric rejects the whole row.
      const rowStaged: FactRow[] = [];
      let rowError: string | null = null;
      for (const [target, value] of Object.entries(mapped)) {
        if (!target.startsWith('metric.')) continue;
        const key = target.slice('metric.'.length);
        const def = this.registry.defFor(key, farm.country, crop);
        if (!def) { rowError = `no metric_definition for "${key}" (${farm.country}/${crop})`; break; }
        if (def.valueType === 'number') {
          const n = Number(value);
          if (Number.isNaN(n)) { rowError = `${key}: not a number`; break; }
          if (def.min !== undefined && n < def.min) { rowError = `${key}: ${n} < min ${def.min}`; break; }
          if (def.max !== undefined && n > def.max) { rowError = `${key}: ${n} > max ${def.max} ${def.unit ?? ''}`.trim(); break; }
        }
        if (def.valueType === 'enum' && !def.enumValues?.includes(String(value))) {
          rowError = `${key}: "${value}" not in ${def.enumValues?.join('|')}`; break;
        }
        rowStaged.push({ fieldId, seasonYear, crop, metricKey: key, value, batchId });
      }
      if (rowError) rejects.push({ rowIndex: i, reason: rowError });
      else staged.push(...rowStaged);
    }

    // 4) COMMIT — the only write; one transaction, everything stamped batch_id.
    await repo.insertFacts(staged);
    const batch = {
      id: batchId,
      status: 'committed' as const,
      source,
      committedRows: staged.length,
      rejectedRows: rejects.length,
      createdAt: new Date().toISOString(),
    };
    await repo.saveBatch(batch);
    return { batch, rejects, rawLocation };
  }

  /** A batch rolls back as a unit — that is what batch_id buys. */
  async rollback(repo: SiloRepo, batchId: string) {
    const batch = await repo.getBatch(batchId);
    if (!batch) throw new NotFoundException(`unknown batch ${batchId}`);
    const removedRows = await repo.deleteBatchRows(batchId);
    await repo.saveBatch({ ...batch, status: 'rolled_back' });
    return { batchId, removedRows };
  }
}
