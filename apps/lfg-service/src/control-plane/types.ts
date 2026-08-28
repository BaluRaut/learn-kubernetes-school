// Control-plane records — reference data only. No grower rows live here.

export interface Grower {
  id: string;          // "grower_1042"
  name: string;
  region: string;      // silo placement, e.g. "us-east-1"
  tier: 'pooled' | 'dedicated';
  createdAt: string;
}

export type Role = 'platform_admin' | 'grower_admin' | 'agronomist' | 'viewer';

export interface Membership {
  sub: string;         // the external IdP's subject — we never mint our own identity
  growerId: string;
  role: Role;
}

export interface MetricDefinition {
  key: string;             // "yield" | "pd_spread" | ...
  unit: string | null;     // "kg/ha" | "%" | null
  valueType: 'number' | 'text' | 'enum' | 'boolean';
  min?: number;
  max?: number;
  enumValues?: string[];
  crop?: string;           // scoped to a crop when set
  country?: string;        // scoped to a country when set (multi-country extension)
  sinceSeason: number;     // dictionary is versioned by season
}
