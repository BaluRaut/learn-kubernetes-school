import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Grower, Membership, MetricDefinition, Role } from './types';

/**
 * The control plane: grower registry, memberships, metric-definition registry.
 * In production each of these is a table in the control plane's own Postgres;
 * here they are in-memory maps so the service runs with zero infrastructure.
 */
@Injectable()
export class RegistryService {
  private growers = new Map<string, Grower>();
  private memberships: Membership[] = [];
  private metricDefs: MetricDefinition[] = [];

  constructor() {
    this.seed();
  }

  // ---- growers -------------------------------------------------------------
  listGrowers(): Grower[] {
    return [...this.growers.values()];
  }

  getGrower(id: string): Grower {
    const g = this.growers.get(id);
    if (!g) throw new NotFoundException(`unknown grower ${id}`);
    return g;
  }

  /** Onboarding = registry row + silo provisioning + first membership, one workflow. */
  onboardGrower(input: { id: string; name: string; region: string; adminSub: string }): Grower {
    if (this.growers.has(input.id)) throw new ConflictException(`grower ${input.id} exists`);
    const grower: Grower = {
      id: input.id,
      name: input.name,
      region: input.region,
      tier: 'pooled',
      createdAt: new Date().toISOString(),
    };
    this.growers.set(grower.id, grower);
    this.addMembership(input.adminSub, grower.id, 'grower_admin');
    // In production this step also: creates the silo database + user,
    // runs migrations, stores the secret. See design doc §14 (M1).
    return grower;
  }

  // ---- memberships ---------------------------------------------------------
  addMembership(sub: string, growerId: string, role: Role) {
    this.getGrower(growerId);
    this.memberships.push({ sub, growerId, role });
  }

  membershipsOf(sub: string): Membership[] {
    return this.memberships.filter((m) => m.sub === sub);
  }

  /** The per-request check behind the tenant guard. Cached ~60 s in production. */
  membershipFor(sub: string, growerId: string): Membership | undefined {
    return this.memberships.find((m) => m.sub === sub && m.growerId === growerId);
  }

  // ---- metric definitions --------------------------------------------------
  listMetricDefs(filter?: { country?: string; crop?: string }): MetricDefinition[] {
    return this.metricDefs.filter(
      (d) =>
        (!filter?.country || !d.country || d.country === filter.country) &&
        (!filter?.crop || !d.crop || d.crop === filter.crop),
    );
  }

  addMetricDef(def: MetricDefinition) {
    this.metricDefs.push(def);
  }

  /** Resolve the definition that governs a metric key for a given country+crop. */
  defFor(key: string, country: string, crop: string): MetricDefinition | undefined {
    // Most specific wins: country+crop scoped > crop scoped > global.
    const candidates = this.metricDefs.filter(
      (d) =>
        d.key === key &&
        (!d.country || d.country === country) &&
        (!d.crop || d.crop === crop),
    );
    return candidates.sort(
      (a, b) =>
        Number(!!b.country) + Number(!!b.crop) - (Number(!!a.country) + Number(!!a.crop)),
    )[0];
  }

  // ---- demo seed -----------------------------------------------------------
  private seed() {
    this.growers.set('grower_1042', {
      id: 'grower_1042', name: 'Boa Terra Farms', region: 'sa-east-1', tier: 'pooled',
      createdAt: new Date().toISOString(),
    });
    this.growers.set('grower_2001', {
      id: 'grower_2001', name: 'Deccan Agro Group', region: 'ap-south-1', tier: 'pooled',
      createdAt: new Date().toISOString(),
    });
    this.memberships.push(
      { sub: 'idp|maria', growerId: 'grower_1042', role: 'grower_admin' },
      { sub: 'idp|arjun', growerId: 'grower_2001', role: 'grower_admin' },
      { sub: 'idp|sam', growerId: 'grower_1042', role: 'agronomist' },
      { sub: 'idp|sam', growerId: 'grower_2001', role: 'viewer' }, // multi-grower user
    );
    this.metricDefs.push(
      { key: 'yield', unit: 'kg/ha', valueType: 'number', min: 0, max: 30000, sinceSeason: 2020 },
      // Same key, different rule per country — the multi-country extension:
      { key: 'yield', unit: 'sc/ha', valueType: 'number', min: 0, max: 400, country: 'BR', crop: 'soybean', sinceSeason: 2020 },
      { key: 'protein_pct', unit: '%', valueType: 'number', min: 0, max: 60, crop: 'soybean', sinceSeason: 2021 },
      { key: 'pd_spread', unit: null, valueType: 'number', min: 0, max: 1, sinceSeason: 2020 },
      { key: 'weighted_pd', unit: null, valueType: 'number', min: 0, max: 1, sinceSeason: 2020 },
      { key: 'irrigation', unit: null, valueType: 'enum', enumValues: ['none', 'drip', 'pivot', 'flood'], sinceSeason: 2020 },
    );
  }
}
