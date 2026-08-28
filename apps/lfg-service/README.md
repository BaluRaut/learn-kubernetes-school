# lfg-service (NestJS)

Phase 1 (option **E**) of the [LFG platform design](../../docs/architecture-lfg.html), as running code:
control plane, per-grower silo isolation, country-scoped metric validation, Route-1 ingest with a
single `batch_id` commit boundary, and the zone-job queue with immutable window vintages.

Runs with **zero infrastructure** — silos are in-memory stores. Every production swap point is
marked with a comment: `SiloManager.forGrower()` → pg pool per grower, `x-user-sub` header →
JWKS-verified IdP token, the zone worker loop → SQS + KEDA pods.

```bash
npm install
npm start          # :4000
```

## The 5-minute demo

```bash
A='-H x-user-sub:idp|maria -H x-grower-id:grower_1042 -H content-type:application/json'

# Who am I? (multi-grower users get a picker from this)
curl -s localhost:4000/control-plane/me/memberships -H 'x-user-sub:idp|sam'

# Tenant guard: maria is not a member of grower_2001 -> 403
curl -s -o /dev/null -w '%{http_code}\n' localhost:4000/farms \
  -H 'x-user-sub:idp|maria' -H 'x-grower-id:grower_2001'

# Canonical entities (country lives on the farm)
curl -s $A -X POST localhost:4000/farms  -d '{"name":"Fazenda Norte","country":"BR"}'
curl -s $A -X POST localhost:4000/fields -d '{"farmId":"farm_1","name":"Talhao 7","externalRef":"T7"}'

# Mapping template (step 6 — what makes Route 2 possible)
curl -s $A -X POST localhost:4000/ingest/templates -d '{"country":"BR","columnMap":{
  "Talhao":"field.external_ref","Ano":"season.year","Cultura":"season.crop",
  "Prod":"metric.yield","Irrig":"metric.irrigation"}}'

# Ingest batch: good rows commit, bad rows reject per-row with reasons —
# note yield validated against the BR/soybean rule (max 400 sc/ha), not the global one
curl -s $A -X POST localhost:4000/ingest/batches -d '{"templateId":"tpl_1","source":"upload","rows":[
  {"Talhao":"T7","Ano":2024,"Cultura":"soybean","Prod":62,"Irrig":"pivot"},
  {"Talhao":"T99","Ano":2024,"Cultura":"soybean","Prod":60},
  {"Talhao":"T7","Ano":2024,"Cultura":"soybean","Prod":950}]}'

# A batch rolls back as a unit
curl -s $A -X POST localhost:4000/ingest/batches/batch_1/rollback

# Zone jobs: enqueue two rolling windows, watch vintages supersede
curl -s $A -X POST localhost:4000/zone-jobs -d '{"fieldId":"field_2","windowStart":2017,"windowEnd":2022}'
curl -s $A -X POST localhost:4000/zone-jobs -d '{"fieldId":"field_2","windowStart":2018,"windowEnd":2023}'
curl -s $A localhost:4000/fields/field_2/zoning            # latest window
curl -s $A 'localhost:4000/fields/field_2/zoning?all=true' # every vintage, superseded links intact
curl -s $A 'localhost:4000/metrics?metricKey=pd_spread'    # zone metrics as fact ROWS
```

## Layout

```
src/
├── control-plane/   # grower registry, memberships, metric_definition registry
├── tenancy/         # TenantGuard (WHO/WHICH/MAY) + SiloManager (pool per grower)
├── silos/           # canonical entities + metrics/zoning queries (tenant-scoped)
├── ingest/          # templates, batches: map -> resolve -> validate -> COMMIT (batch_id)
└── zones/           # zone-job queue: lanes, idempotency tuple, immutable vintages
```

Seeded: growers `grower_1042` (BR) / `grower_2001` (IN); users `idp|maria`, `idp|arjun`,
`idp|sam` (member of both); metric definitions incl. the country-scoped `yield` override.
