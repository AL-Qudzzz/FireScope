# AGENTS.md — AI Agent Operating Rules

## Mission
Build the MVP in `docs/PRD.md`: a global AOI-based burning-activity calendar that presents MODIS and VIIRS active-fire observations transparently.

## Read first
Read `README.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATA_DICTIONARY.md`, `docs/METHODOLOGY.md`, `docs/API_CONTRACT.md`, `docs/TESTING.md`, and `docs/DECISIONS.md` before making architectural or scientific changes.

## Hard scientific rules
- Never overwrite or mutate raw NASA source files.
- Preserve sensor, platform, instrument, acquisition time, collection/version, processing status, and native confidence.
- Never assume MODIS and VIIRS confidence values are equivalent.
- A hotspot is not automatically a confirmed fire incident.
- FRP (MW) is not burned area, perimeter, or direct fire size.
- No detection does not prove no fire occurred.
- Adding MODIS and VIIRS counts is not sensor normalization.
- Every derived metric needs formula, inputs, units, spatial unit, time window, and method version.
- Clearly label synthetic/demo data; never disguise it as NASA observations.

## Engineering rules
- Small, reviewable changes; typed Python and strict TypeScript.
- Separate ingestion, validation, canonicalization, aggregation, and serialization.
- Ingestion must be idempotent.
- Use UTC internally.
- Validate AOI and date ranges at API boundaries.
- Never commit API keys, Earthdata credentials, `.env`, or private tokens.
- Use `.env.example` with placeholder names only.
- Do not add dependencies/services without justification.
- Do not load all global raw points into the browser.
- Add tests for scientific transformations and bug fixes.

## Agent coordination
- One agent owns a file/module at a time.
- Agree on API interfaces before parallel frontend/backend work.
- Integrator owns schema/methodology changes.
- UI agents must not invent metric definitions or field names.
- Each agent reports files changed, assumptions, tests run, and unresolved risks.

## Workflow
1. Restate task and affected requirement.
2. Read relevant docs and inspect existing code.
3. Propose a short plan.
4. Implement smallest complete change.
5. Run tests/lint/type checks.
6. Review diff for secrets, unrelated edits, and raw-data mutation.
7. Report changes, tests, limitations, and follow-ups.

## Definition of done
Acceptance criteria met; tests pass or failures documented; no secrets; docs updated; outputs traceable; UI labels do not overstate scientific conclusions.

## Stop and ask
Stop if challenge rules/resources are unclear, product schemas differ, an unsupported assumption is required, a metric cannot be compared defensibly, provenance would be removed, or a dependency/license is unclear.

## Git discipline
Descriptive branches/commits; no force push; do not commit large raw datasets, caches, credentials, or build artifacts.

## Technical research authority
Before implementing scientific logic, read `docs/TECHNICAL_RESEARCH.md`. Treat its MVP recommendation (M1/M2) as the safe baseline. Do not implement M3/M4 observation-probability correction unless the integrator approves after reviewing the original paper, exact equations, code/license, required inputs, and validation plan. Never infer missing cloud/observation opportunity from hotspot CSV rows.
