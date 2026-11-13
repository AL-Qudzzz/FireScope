# Decision Log

Use this template:
- ID / Date / Status (Proposed, Accepted, Superseded)
- Context
- Decision
- Alternatives
- Consequences
- Evidence/sources

## Initial decisions
### D-001 — Preserve sensor provenance
**Accepted.** Retain sensor, platform, instrument, collection, processing version/status, native confidence, and retrieval metadata for every observation.

### D-002 — Do not equate confidence values
**Accepted.** Keep MODIS and VIIRS confidence native in MVP.

### D-003 — Calendar-first product
**Accepted.** AOI burning-activity calendar is the central experience because it directly addresses the challenge objective.

### D-004 — Start at M1/M2
**Proposed.** MVP can show common-bin aggregation and comparative views. Corrected cross-sensor metrics are optional and require validation.

### D-005 — DuckDB + Parquet
**Proposed.** Start without PostGIS unless persistent multi-user spatial queries justify it.
