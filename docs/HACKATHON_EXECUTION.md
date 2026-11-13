# Hackathon Execution Plan

## First 30–60 minutes
1. Reopen challenge page and inspect Resources tab.
2. Copy exact resources into `NASA_DATA_SOURCES.md`.
3. Confirm eligibility and submission requirements.
4. Select one official NASA resource for first ingestion.
5. Verify collection, platform, coverage, schema, authentication, attribution.
6. Freeze MVP scope and assign module owners.

## Phase A — Data path
Download a small sample; inspect headers, values, nulls, date/time encoding, version fields; preserve raw file; implement parser and schema tests.

## Phase B — Analytical path
Choose one AOI and period; aggregate MODIS and VIIRS separately into common time bins; verify with hand calculations; attach method/provenance.

## Phase C — UX
Build AOI selection, calendar, sensor-separated chart, day detail, methodology/provenance.

## Phase D — Historical intelligence
Add seasonal baseline only if data/time permit. Label unusual activity relative to baseline, never as prediction.

## Phase E — Validate and submit
Test two global AOIs; verify NASA citations/attribution; clean deployment; demo fallback; prepare screenshots/video and clear explanation.

## Suggested AI-agent split
| Role | Owns | Must not |
|---|---|---|
| Integrator (Codex/human) | architecture, contracts, merges | silently change science |
| Data agent | ingestion, schema, provenance | normalize confidence without approval |
| Science agent | aggregation, baseline, validation | claim unvalidated harmonization |
| Frontend agent | map, calendar, charts | invent fields/metrics |
| QA/research | sources, tests, compliance | rely on undocumented claims |

## Coordination
One shared AGENTS.md; one task per module; freeze API contract before parallel work; integrator owns schema/methodology; each agent reports changes, tests, assumptions, risks; avoid concurrent edits to same files.

## Demo fallback
If live access fails, use a small documented NASA sample if permitted. Show retrieval timestamp/status. Never disguise synthetic records as NASA data.

## Submission narrative
Problem → sensor differences → AOI calendar → recent/historical insights → method and limitations → NASA resources and attribution.
