# Master Build Prompt — FireScope

> Use this prompt in the coding agent opened at the FireScope project repository. It is written for an agent that can inspect files, use installed skills, edit code, run tests, and preview the application.

---

## ROLE

Act as a senior full-stack engineer, geospatial product designer, scientific-data engineer, and technical lead. Build **FireScope**, a global AOI-based active-fire observation analysis application, according to the project documents and `DESIGN.md`.

You are not building a generic map dashboard. The primary experience is an **area-of-interest burning-activity calendar**, supported by a map, sensor-separated time series, time-bin detail, dynamic source status, and transparent methodology.

## AUTHORITATIVE INPUTS — READ BEFORE CODING

Read these files fully before architecture or scientific changes:

1. `AGENTS.md`
2. `README.md`
3. `PRD.md`
4. `ARCHITECTURE.md`
5. `DATA_DICTIONARY.md`
6. `METHODOLOGY.md`
7. `API_CONTRACT.md`
8. `TECHNICAL_RESEARCH.md`
9. `NASA_DATA_SOURCES.md`
10. `TESTING.md`
11. `DECISIONS.md`
12. `HACKATHON_EXECUTION.md`
13. `DESIGN.md`
14. `PROJECT_GRAPH.md`

If actual repository code conflicts with a proposed document, inspect and report the conflict before changing contracts. `AGENTS.md` scientific hard rules take precedence over convenience or visual design.

## SKILL WORKFLOW

Use the skills as separate tools with separate responsibilities. Do not replace one with another.

### 1. Graphify — build the project knowledge graph

- Check whether the official Graphify skill/CLI is already installed. Do not reinstall it if available.
- If missing, follow the current official installation documentation. Current package instructions use Python 3.10+ and the `graphifyy` package; the CLI/skill name remains `graphify`. A common isolated install is `uv tool install graphifyy`, followed by `graphify install --project --platform codex` for a Codex project installation. If using another agent, select its documented platform.
- Invoke the installed skill on the FireScope project workspace (for example `/graphify .`). Make sure raw data, credentials, caches, generated graph output, virtual environments, and build directories are excluded according to the current skill's documented configuration; do not invent unsupported CLI flags.
- Generate and preserve the actual interactive `graphify-out/graph.html`, `graphify-out/graph.json`, and `graphify-out/GRAPH_REPORT.md`. Wiki export is optional.
- Ask Graphify to identify high-connectivity concepts, document dependencies, inferred/ambiguous claims, and connections between requirements, scientific methods, API fields, backend modules, and frontend surfaces.
- Preserve Graphify's `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` edge labels. Verify inferred claims against the source documents before implementing them.
- Use Graphify queries to identify: (a) the end-to-end calendar path, (b) scientific guardrails affecting each metric, (c) the full provenance path, and (d) unresolved/ambiguous requirements.
- Do not edit `graph.json` to make the graph appear more complete. Refresh it after significant code/doc changes using the skill's documented update workflow.

### 2. Archify — create validated system architecture diagrams

- Check whether the Archify skill is already installed. If it is missing, use the documented skill installer for the active coding agent. For Codex, the project-scoped installation form is commonly `npx -y skills add tt-a1i/archify --skill archify --agent codex --copy --yes`; confirm current official instructions before executing.
- Use Archify's **native diagram workflow**, not a generic text response. It supports architecture and dataflow diagrams and exports self-contained HTML.
- Create at least two artifacts:
  1. `firescope-architecture.html` — clients, React surfaces, MapLibre, ECharts, FastAPI, DuckDB/Parquet, NASA source boundary, and ingestion/analytics modules.
  2. `firescope-dataflow.html` — source acquisition through immutable raw storage, parsing, validation, canonicalization, lifecycle/QA, separate aggregation, persistence, API, and UI.
- Read the installed skill's current schema/example references before authoring. Use real repository evidence for implemented components; use a distinct proposed/planned style for components that are not implemented yet.
- Follow the Archify `finalize` flow and require a passing validation/delivery/browser-check receipt before claiming the diagrams are validated. Save candidate JSON and standalone HTML under `.archify/`.
- Do not use Archify as a replacement for the interactive application UI. It is for architecture/workflow/dataflow diagrams.

### 3. Impeccable — define and implement the frontend visual system

- Check the installed Impeccable skill version and read its current `SKILL.md` and relevant references. Install only if missing, using the official instructions for the active agent.
- Run the Impeccable context step once for this project session from the skill's actual installed path. On Windows without `sh`, use the documented `.cmd` launcher.
- Treat this application screen as **Operate** mode. Follow `reference/new-work.md` and `reference/operate.md` for a new dashboard/workspace. Follow the current skill's mandatory concept/direction workflow when it applies; do not skip required approvals or invent a visual world that conflicts with this brief.
- Use `DESIGN.md` as the durable design-system source of truth. It establishes the proposed **Field Atlas** direction: restrained, light-first, calm, cartographic, and information-dense only where useful.
- Use the NASA FIRMS screenshot only as a reference for map/AOI affordances and spatial context. Do not copy its branding, red-heavy header, control placement, or map-only hierarchy. Do not use NASA's logo as FireScope branding.
- Before any frontend UI edit, follow the skill's required quality-floor instructions. After implementation, run appropriate Impeccable critique/audit/polish/adapt steps and inspect the actual rendered UI at desktop, tablet, and mobile widths and in light/dark themes.
- Familiar, accessible controls and consistent interaction states outrank novelty. No gratuitous motion, generic gradients, glassmorphism, decorative fire motifs, or unlabelled icon-only actions.

## PRODUCT OBJECTIVE

Build an application that enables users to:

1. Select an AOI globally (P0: presets and validated bounding box; add polygon only when its API contract and backend validation exist).
2. Choose a date range and aggregation granularity.
3. Explore a burning-activity calendar as the primary analysis surface.
4. Compare MODIS and VIIRS counts independently, preserving VIIRS platform and MODIS Terra/Aqua identity.
5. Inspect a selected time bin's detailed records, native confidence values, FRP summary, processing state, and provenance.
6. Explore a map of the same query, using bounded/clustered observations rather than loading all global raw points.
7. Review dynamic NASA source/platform freshness, processing status, and retrieval timestamp.
8. Read a clear explanation of methods and limitations.

## SCIENTIFIC AND DATA GUARDRAILS — NON-NEGOTIABLE

- Never overwrite or mutate raw NASA source files. Store exact source files and checksums.
- Preserve sensor, platform, instrument, acquisition time, collection/version, processing status, native confidence, source retrieval timestamp, checksum, and original attributes.
- Never assume MODIS numeric confidence (0–100) is equivalent to VIIRS categorical confidence.
- A hotspot is not automatically a confirmed incident, unique fire, perimeter, ignition point, or burned area.
- FRP is Fire Radiative Power in MW. It is not burned area, perimeter, or direct total fire size.
- A no-detection bin does not prove there was no fire. Distinguish missing source data from zero detections in available records.
- Adding MODIS and VIIRS counts is not sensor normalization. Do not call pooled counts “harmonized counts.”
- MVP scientific level is M1/M2: common AOI/time-bin aggregation with sensor/platform-specific outputs and comparative views without correction.
- Do not implement M3/M4 observation-probability, cloud, FRP-operator, or cross-sensor correction unless the integrator first reviews the original paper/equations, required inputs, code license, and validation plan. Never invent missing cloud/observation opportunity from hotspot CSV rows.
- Do not sum NRT and Standard copies of the same underlying observation. Retain source snapshots and implement idempotent exact-identity/supersession handling.
- Use UTC internally. Display local calendar dates only when the AOI timezone and bin boundaries are explicitly defined.
- Every derived metric must carry formula, inputs, units, spatial unit, time window, method ID/version, source products, processing state, and provenance.
- Label synthetic/demo data everywhere users could mistake it for NASA observations.

## TARGET TECHNICAL STACK

Follow the existing repository first. If it does not already contain a reasoned alternative, use the documented provisional stack:

- Frontend: React + TypeScript + Vite.
- Mapping: MapLibre GL JS.
- Charts: Apache ECharts.
- Backend: Python + FastAPI + Pydantic.
- Data processing: Pandas, NumPy, SciPy; add GeoPandas/Shapely only where justified.
- Storage: DuckDB + Parquet.
- PostGIS only if a demonstrated persistent multi-user spatial-query requirement justifies it.

Do not add libraries, databases, hosted services, or infrastructure without explaining the need. Keep strict TypeScript and typed Python. Keep API schemas synchronized with frontend types.

## REQUIRED WORKFLOW

### Phase 0 — repository reconnaissance

1. Restate the implementation goal and the PRD requirements affected.
2. Inspect the repository tree, current runtime, package managers, existing pages/components, API modules, schemas, data fixtures, and tests.
3. Read all authoritative files above, including the full technical research document.
4. Run Graphify and review its report/graph before changing architecture.
5. Create/update Archify architecture and dataflow diagrams based on evidence. Mark proposed modules separately from implemented modules.
6. Run Impeccable context and its Operate-mode new-work process. Reconcile the proposed design with actual code/tokens/assets; do not assume greenfield if an existing visual system is present.
7. Produce a short implementation plan with file ownership, agreed API interfaces, assumptions, risks, and test plan.

### Phase 1 — data foundation

1. Verify the exact NASA FIRMS product/platform CSV headers against the current product-specific attribute table and the current VIIRS Collection 2 guide.
2. Verify the official challenge Resources tab manually in a browser before claiming the full list has been satisfied.
3. Implement data acquisition with bounded requests, retry/backoff, caching, rate-limit awareness, and MAP_KEY in environment variables only.
4. Respect the FIRMS Area API 1–5 day query window and transaction constraints documented in the current project research; re-check official limits before release.
5. Archive raw files immutably with source URL/product/platform/collection/processing state/retrieved-at/checksum manifest.
6. Implement separate product parsers, schema validation, UTC time parsing (including zero-padded HHMM), canonicalization, and source-row preservation.
7. Preserve raw attributes, native confidence scheme, FRP, scan/track, day/night, collection/version, and processing status.
8. Implement exact duplicate handling and NRT-to-Standard supersession without proximity-only deduplication or double counting.
9. Keep ingestion idempotent and record schema drift explicitly.

### Phase 2 — analytical vertical slice

Implement one complete path for at least two geographically distinct AOIs:

`NASA source → raw archive → parse/validate → canonical observation → sensor/platform QA → AOI/time-bin aggregation → DuckDB/Parquet → API response → UI`

- Implement M1 aggregation and M2 comparison only.
- Aggregate MODIS and VIIRS separately in common AOI/time bins.
- Preserve MODIS platform and VIIRS platform identity.
- Implement FRP summaries with statistic, MW, sensor/platform, filters, and valid-record count.
- Include data/platform availability and source retrieval time.
- Ensure `sensor=ALL` returns sensor-separated values.
- Include method ID/version and provenance on every analytic result.

### Phase 3 — API

Use base path `/api/v1` and the current `API_CONTRACT.md` unless a reviewed change is necessary.

Required endpoints:
- `GET /health`
- `GET /api/v1/data/status`
- `GET /api/v1/analytics/calendar`
- `GET /api/v1/observations` (bounded and cursor-paginated)

Validate date ranges, AOI/bbox, granularity, sensor/platform, limits, and cursors at the boundary. Return clear typed 4xx errors. Do not return hardcoded example freshness as live status.

If a proposed contract field is scientifically misleading (for example, a label that suggests a pooled count is harmonized), coordinate the change across backend schema, frontend types, tests, and `API_CONTRACT.md` in one reviewed change.

### Phase 4 — frontend implementation

Implement the `DESIGN.md` specification. Minimum page composition:

- Compact FireScope app header and collapsible navigation.
- AOI selection and shared filter toolbar.
- Visible source freshness/status strip.
- Separate MODIS and VIIRS summary cards.
- Calendar as the largest primary analysis surface.
- MapLibre preview and AOI boundary using the same filters.
- Sensor-separated ECharts time series.
- Selected time-bin drawer with platform, native confidence, FRP, processing, and provenance detail.
- Methodology/source access.

All panels must be driven by one shared query state. Do not show fake counters, fake live status, fabricated hotspots, or nonfunctional controls.

**Visual quality requirements:**
- Field Atlas theme from `DESIGN.md`; default light, optional fully supported dark theme.
- Consistent MODIS amber and VIIRS blue identity, plus non-color cues.
- Keep fire red for hotspot emphasis, not general chrome.
- Use restrained spacing, typography, borders, and purposeful status color.
- All buttons, filters, calendar cells, map controls, drawers, chart controls, and tables need real behavior and accessible states.
- Build loading skeletons, no-data, no-source, partial-source, failed-query, and demo-data states.
- No decorative animations or heavy visual effects.

### Phase 5 — P1 historical intelligence (only after P0 works)

If the baseline data and time allow:
- Add like-for-like seasonal/monthly comparisons.
- Add robust baseline and unusual-activity indicator using a documented method, years, sensor/platform composition, and incomplete-period handling.
- Clearly label this as unusual activity relative to a baseline, not a prediction or alert.
- Add CSV export containing metric definitions, filters, source/method provenance, and units.

Do not let P1 delay a reliable P0 vertical slice.

### Phase 6 — QA, review, and delivery

1. Run backend unit and API tests.
2. Run frontend unit/component tests, lint, type checks, and E2E demo checklist.
3. Include hand-calculated fixtures for AOI inclusion (including boundary points), UTC conversion, time-bin edges, sensor-specific counts, FRP null/valid count, duplicate lifecycle, baseline MAD=0, and missing-data behavior.
4. Verify that raw inputs remain unchanged and checksums match.
5. Verify the UI doesn't use normalized/confounded metrics at M1/M2.
6. Run Graphify update after significant docs/code changes and ensure its output is not stale.
7. Run Archify finalization for every diagram; save passing receipts.
8. Run Impeccable critique/audit/polish/adapt checks and manually inspect desktop/tablet/mobile, light/dark, keyboard focus, and error states.
9. Review the diff for secrets, `.env`, MAP_KEY, Earthdata credentials, large raw files, generated caches, and unrelated edits.
10. Update `README.md`, `DESIGN.md`, `ARCHITECTURE.md`, `API_CONTRACT.md`, `TESTING.md`, `NASA_DATA_SOURCES.md`, and `DECISIONS.md` as needed.

## REPOSITORY AND FILE ORGANIZATION

Honor existing structure when present. The planned structure is:

```text
FireScope/
├── AGENTS.md
├── README.md
├── PRD.md
├── DESIGN.md
├── PROJECT_GRAPH.md
├── ARCHITECTURE.md
├── DATA_DICTIONARY.md
├── METHODOLOGY.md
├── API_CONTRACT.md
├── TECHNICAL_RESEARCH.md
├── NASA_DATA_SOURCES.md
├── TESTING.md
├── DECISIONS.md
├── HACKATHON_EXECUTION.md
├── .env.example
├── frontend/
│   └── src/{app,components,features,services,types,styles}/
├── backend/
│   ├── app/{api,core,ingestion,schemas,services,analytics}/
│   └── tests/
├── data/{raw,processed,sample}/
├── scripts/ingest/
├── graphify-out/
└── .archify/
```

Ignore raw and processed data, caches, generated build output, secrets, and local virtual environments in Git. Commit only small documented test fixtures where permitted.

## AGENT COORDINATION

If multi-agent execution is available:

- Integrator owns architecture, schema/methodology decisions, API contracts, and merges.
- Data agent owns ingestion/parsers/canonical schema within the approved contract.
- Science agent owns aggregation/FRP/baselines and validation; cannot change method without integrator review.
- Frontend agent owns UI implementation; cannot invent metrics or field names.
- QA/research agent owns source verification, tests, and demo checklist.
- One agent owns a file/module at a time. Freeze API interfaces before parallel frontend/backend implementation.
- Each agent reports files changed, assumptions, tests run, and unresolved risks.

## DEFINITION OF DONE

The project is complete only when:

- The P0 user journey works end-to-end for at least two distinct AOIs.
- The calendar is the central experience and all views share one query state.
- MODIS and VIIRS remain separate and fully traceable.
- Data status is dynamic, and empty/missing/error/demo states are honest.
- Scientific transformations are deterministic, versioned, and tested.
- Raw source data remains immutable and no credentials are committed.
- UI has been inspected at shipping sizes, in both themes and across responsive breakpoints.
- Graphify knowledge graph and report are generated from the actual project workspace.
- Archify architecture and dataflow HTML diagrams pass their validation/delivery/browser checks.
- Documentation and the final demo narrative are updated.

## FINAL RESPONSE FORMAT

When implementation is complete, report:

1. What was built and which P0 requirements are satisfied.
2. Key architecture and UX decisions.
3. Files/modules changed.
4. Data sources and verification status.
5. Tests, type checks, lint, and visual checks executed (with exact outcomes).
6. Graphify outputs and Archify artifacts/validation receipts.
7. Known limitations, unresolved assumptions, and next P1 work.

Do not claim tests, NASA live access, skill execution, visual validation, or diagram validation unless you actually ran them and observed successful results.
