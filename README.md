# FireScope — Active Fire Intelligence & AOI Burning-Activity Calendar

**Challenge:** NASA Space Apps 2026 — Harmonization of MODIS and VIIRS Hot Spots  
**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · Leaflet · Express · DuckDB · Apache Parquet  
**Data Baseline:** NASA FIRMS Open Data Streams (24h Live), NASA EONET v3 Wildfires, & Official NASA FIRMS Historical Archives (`2001-01-01` – `2026-11-12`)

---

## 1. Overview & Mission

**FireScope** is a full-stack geospatial intelligence workspace and Area-of-Interest (AOI) burning-activity calendar designed to explore, compare, and contextualize **MODIS Collection 6.1** (`Terra`, `Aqua`) and **VIIRS Collection 2** (`Suomi-NPP`, `NOAA-20`, `NOAA-21`) active-fire observations with strict scientific transparency.

Rather than flattening distinct satellite sensors into an unvalidated single number or serving a map-only hotspot viewer, FireScope makes the **AOI burning-activity calendar** a first-class analytical workflow while preserving sensor identity, native confidence semantics, processing status (`STANDARD` vs `NRT`), acquisition timestamps in UTC, and full data provenance.

### Three Core Product Pillars
1. **Live & Recent Global Monitoring:** Streams global 24-hour NASA FIRMS active-fire CSV feeds (`MODIS C6.1`, `VIIRS S-NPP`, `VIIRS NOAA-20`, `VIIRS NOAA-21`) plus NASA EONET v3 wildfire context, with viewport-bounded spatial sampling, offshore oil/gas flare filtering, and selectable grid/cluster aggregation.
2. **Deep Historical AOI Intelligence (`2001–2026`):** Powered by an embedded **DuckDB + Apache Parquet** analytical engine indexing **8,913,218 canonical observations** (`2,955,260` daily grid buckets and `737,959` recent Oct–Nov 2026 records) from immutable NASA FIRMS historical archives over Indonesia, alongside explicit demo baseline fixtures for non-Parquet global regions.
3. **Trustworthy Scientific Harmonization:** Enforces `M0_RAW`, `M1_AGGREGATED`, and `M2_COMPARATIVE` analytical methods. Sensor series stay strictly separated, pre-2012 periods without VIIRS coverage are never averaged into VIIRS baselines, and unvalidated observation-probability corrections (`M3`/`M4`) remain intentionally disabled.

---

## 2. Key Features

### P0 — Core MVP Capabilities
- **FR-01 Global Map & AOI Selection:** Interactive horizontally wrapped world map (`MapCanvas`) supporting preset AOIs, custom bounding-box (`BBOX`) drawing/entry, and URL-validated coordinates (`EPSG:4326` / WGS84).
- **FR-02 Synchronized UTC Date-Range Filtering:** Unified `start_date`..`end_date` controls (`YYYY-MM-DD`, UTC internally) with quick presets (`24h Live FIRMS`, `Oct–Nov 2026 Daily`, `2024–2026 Monthly`).
- **FR-03 Burning-Activity Calendar:** Daily, weekly, and monthly heatmaps (`CalendarHeatmap`) displaying detection counts or cumulative FRP (`MW`) per UTC time bin.
- **FR-04 Sensor & Platform Separation:** Side-by-side sensor summaries and `SensorComparisonChart` (`MODIS` vs `VIIRS` and `5-Platform Split`: Terra, Aqua, S-NPP, NOAA-20, NOAA-21) with explicit scale notes.
- **FR-05 Time-Bin & Observation Inspector:** `SelectedBinDetail` & `ObservationInspector` showing per-sensor `sum_mw`, `mean_mw`, `median_mw`, `p90_mw`, `max_mw` (marked `N/A (daily agg)` for pre-aggregated daily Parquet bins), paginated canonical records, native confidence (`0–100` for MODIS, `low|nominal|high` for VIIRS), and SHA-256 provenance.
- **FR-06 Methodology & Limitations Reference:** Built-in reference view explaining `M0`/`M1`/`M2`, platform launch/retirement windows (including `VIIRS S-NPP` archive end `2026-11-02`), and why counts differ across 1 km MODIS vs 375 m VIIRS.
- **FR-07 Live Data Freshness & Source Status:** Real-time `/api/v1/data/status` banner and modal reporting live FIRMS connection status, `STANDARD` vs `NRT` replacement lag (~5 months), Parquet manifest metadata, and explicit Demo/Snapshot labeling when applicable.

### P1 — Comparative & Analytical Capabilities
- **FR-08 Historical Period & Year-over-Year (YoY) Comparison (`Compare History`):** Like-for-like comparison of two UTC date windows (e.g., El Niño 2015 vs 2023 or Jul–Nov 2025 vs Jul–Nov 2026) with separate MODIS/VIIRS deltas, leap-day (`02-29`) safe alignment, multi-year YoY benchmark tables, and platform-era transition warnings (`NOAA-20` from `2018-04-01`, `NOAA-21` from `2023-03-01`, `NRT` vs `STANDARD`).
- **FR-09 Unusual-Activity Seasonal Baseline:** Documented Median / MAD robust z-score (`z*`) comparison against multi-year historical baselines, filtering out pre-operational years (e.g., pre-2012 for VIIRS) and marking partial current UTC months as `Incomplete UTC period`.
- **FR-10 Provenance-Complete CSV Export:** One-click CSV export of calendar aggregates and comparison tables embedding formula definitions, spatial units, temporal windows, method version, and SHA-256 provenance headers.
- **Multi-AOI Side-by-Side Comparison (`Compare Regions`):** Compares two AOIs simultaneously over identical UTC windows with raw counts, normalized hotspot density per `1,000 km²`, unequal-area warnings, and synchronized dual-sensor time-bin traces.
- **Selectable Map Grid & Cluster Layer (`Points / Grid / Cluster`):** Server-side `0.25°`, `0.5°`, `1.0°`, and `2.0°` WGS84 spatial grid aggregation (`/api/v1/map/grid`, capped at `<= 1,500` cells) and viewport spatial sampling (`/api/v1/map/hotspots`, capped at `4,500` points).

### P2 — Workflow & Context Enhancements
- **Persistent Saved AOIs:** Browser-persisted (`localStorage`) custom AOI CRUD (save, load, rename, delete) synced into selectors and comparison dropdowns.
- **Optional Periodic Auto-Refresh:** User-toggleable automatic background polling alongside server-side live FIRMS caching.
- **Contextual Map Overlays:** Toggleable Solar Terminator (day/night boundary), verified offshore flare mask toggle (`exclude_offshore`), and NASA EONET v3 wildfire event context markers.
- **Blocked Research Scope (`M3`/`M4`):** Observation-probability and cloud/overpass gap-filling (`M3`/`M4`) remain strictly disabled until external cloud/overpass products are scientifically validated.

---

## 3. Architecture & Directory Structure

```text
.
├── server.ts                        # Express + Vite middleware server (port 3000) & REST API (/api/v1/*)
├── index.html                       # Web app entry HTML
├── vite.config.ts                   # Vite + React + Tailwind v4 configuration
├── tsconfig.json                    # Strict TypeScript compiler configuration
├── package.json                     # Dependencies and npm scripts
├── .env.example                     # Environment variable template (never commit .env)
├── metadata.json                    # Application metadata & capability declarations
├── AGENTS.md                        # AI agent & scientific engineering guardrails
├── MANIFEST.json                    # Documentation & research metadata registry
├── docs/                            # Project specifications, methodology, contracts & release audits
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── API_CONTRACT.md
│   ├── DATA_DICTIONARY.md
│   ├── METHODOLOGY.md
│   ├── TECHNICAL_RESEARCH.md
│   ├── NASA_DATA_SOURCES.md
│   ├── TESTING.md
│   ├── WHITEBOX_TESTING_REPORT.md
│   ├── RELEASE_READINESS.md
│   ├── FINAL_QA_REPORT.md
│   ├── RESPONSIVE_UI_AUDIT.md
│   ├── RESPONSIVE_QA_REPORT.md
│   ├── SECURITY_AUDIT.md
│   ├── SCIENTIFIC_DATA_AUDIT.md
│   ├── DEPLOYMENT.md
│   ├── RELEASE_NOTES.md
│   ├── DESIGN.md
│   ├── DECISIONS.md
│   ├── BUILD_PROMPT.md
│   ├── PROJECT_GRAPH.md
│   └── HACKATHON_EXECUTION.md
├── scripts/
│   └── buildParquet.ts              # Idempotent DuckDB ETL converting immutable data/raw/*.zip -> Parquet + manifest
├── data/
│   ├── raw/                         # Immutable NASA FIRMS ZIP archives (never mutated at runtime)
│   │   ├── DL_FIRE_M-C61_844378.zip # MODIS C6.1 Archive + NRT (2001-01-01..2026-11-12)
│   │   ├── DL_FIRE_SV-C2_844381.zip # VIIRS S-NPP C2 Archive + NRT (2012-01-20..2026-11-02)
│   │   ├── DL_FIRE_J1V-C2_844379.zip# VIIRS NOAA-20 C2 Archive + NRT (2018-04-01..2026-11-12)
│   │   └── DL_FIRE_J2V-C2_844380.zip# VIIRS NOAA-21 C2 Archive + NRT (2023-03-01..2026-11-12)
│   └── processed/
│       ├── daily_aggregates.parquet       # 2,955,260 daily 0.25° x sensor x platform x status buckets
│       ├── recent_observations_2026.parquet # 737,959 canonical observations (Oct 2026 – Nov 12, 2026)
│       └── parquet_manifest.json          # Spatial extent, date bounds, platform coverage, SHA-256 checksums
└── src/
    ├── App.tsx                      # Top-level application state, URL/tab sync, API orchestration
    ├── main.tsx                     # React 19 mount entry
    ├── index.css                    # Tailwind CSS v4 (@import "tailwindcss") & design tokens
    ├── types/
    │   └── firescope.ts             # Shared strict TypeScript contracts for client & server
    ├── science/
    │   ├── fireScience.ts           # M0/M1 pure transforms: UTC parsing, NRT->STANDARD dedup, FRP, offshore mask
    │   ├── comparisonScience.ts     # M2 transforms: FR-08 YoY, FR-09 Median/MAD, Multi-AOI, 0.25° grid agg
    │   └── fireScience.test.ts      # 24 unit & DuckDB integration tests (node:test via tsx)
    ├── services/
    │   ├── parquetService.ts        # DuckDB read-only queries against data/processed/*.parquet
    │   ├── firmsLiveService.ts      # NASA FIRMS 24h CSV & Area API ingestion, viewport sampling, live caching
    │   ├── eonetLiveService.ts      # NASA EONET v3 wildfire event stream ingestion
    │   └── firescopeApi.ts          # Typed frontend API client
    ├── data/
    │   └── firmsArchiveData.ts      # Preset AOIs, platform registry, non-Parquet demo snapshot fixtures
    ├── utils/
    │   └── savedAois.ts             # LocalStorage persistence helper for custom Saved AOIs
    └── components/
        ├── GlobalHeader.tsx
        ├── PrimaryNavigationDrawer.tsx
        ├── MapCanvas.tsx
        ├── ToolPanels.tsx
        ├── CalendarHeatmap.tsx
        ├── SelectedBinDetail.tsx
        ├── SensorComparisonChart.tsx
        ├── ObservationInspector.tsx
        ├── ComparisonPanels.tsx
        └── ReferencePages.tsx
```

---

## 4. Scientific Guardrails & Data Provenance

All analytical modules adhere to strict rules documented in `AGENTS.md` and `docs/METHODOLOGY.md`:

1. **No Raw File Mutation:** Files in `data/raw/*.zip` and `data/processed/*` are strictly read-only at runtime. Every source ZIP and extracted CSV carries a recorded SHA-256 checksum inside `data/processed/parquet_manifest.json`.
2. **Strict Confidence Separation:**
   - **MODIS C6.1:** Native numeric confidence `0–100` (bucketed in Parquet queries as `<30`, `≥30`, `≥80`).
   - **VIIRS C2:** Native categorical confidence `low | nominal | high`.
   - MODIS numeric confidence is never mapped onto a shared probability scale with VIIRS categories.
3. **No Sensor Count Pooling Claimed as Harmonized:** MODIS (1 km nominal) and VIIRS (375 m nominal) counts are always displayed as separate series. Any pooled reference count is explicitly labeled `pooled_observation_count` and never presented as a normalized fire count.
4. **Hotspot ≠ Fire Incident / Burned Area:** A hotspot indicates a thermal anomaly detected during a satellite overpass—not a unique fire, ignition point, perimeter, or confirmed incident. **FRP (MW)** measures instantaneous radiative heat output, not burned area.
5. **NRT → STANDARD Supersession:** `STANDARD` science-quality records supersede `NRT` copies for the same observation without aggressive spatial-proximity merging that would erase genuine adjacent hotspots.
6. **Honest `NO_SOURCE_DATA` vs Zero Detections:** Missing platform records (such as `VIIRS S-NPP` archive ending `2026-11-02`, pre-2012 VIIRS dates, or failed live fetches) are surfaced distinctly from zero detections.
7. **Pre-Aggregated FRP Honesty:** `daily_aggregates.parquet` computes exact `sum_mw`, `mean_mw`, and `max_mw`, returning `median_mw: null` and `p90_mw: null` when aggregating multi-day/month Parquet buckets instead of approximating them.

---

## 5. Setup & Installation

### Prerequisites
- **Node.js** `>= 20.x` (tested with Node 22 types and ESM + `tsx`)
- **npm** (or `bun`, lockfile provided)
- **`unzip`** CLI utility (only required if regenerating Parquet archives from `data/raw/*.zip` via `scripts/buildParquet.ts`)
- Optional: **NASA FIRMS `MAP_KEY`** (free from [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/area/)) for authenticated Area API requests. Without `FIRMS_MAP_KEY`, FireScope still streams NASA FIRMS 24h Open Data CSV feeds and NASA EONET v3 events, falling back to checksummed snapshot fixtures only if offline.

### Step 1 — Clone & Install Dependencies
```bash
git clone <repository-url>
cd firescope
npm install
```

### Step 2 — Configure Environment Variables
Copy `.env.example` to `.env` (never commit `.env` or real API keys):

```bash
cp .env.example .env
```

Available variables in `.env.example`:

| Variable | Required | Description |
|---|---|---|
| `FIRMS_MAP_KEY` | Optional | Server-side NASA FIRMS Area API key (`YOUR_NASA_FIRMS_MAP_KEY_HERE` triggers Open Data / Snapshot mode). |
| `GEMINI_API_KEY` | Optional | Reserved runtime environment variable per workspace template (not required for core FireScope NASA analytics). |
| `APP_URL` | Optional | Public URL where the application is hosted. |

> **Security Note:** Never expose `FIRMS_MAP_KEY` via `VITE_*` client environment variables; all NASA FIRMS fetches are proxied server-side by `server.ts`.

### Step 3 — Verify or Rebuild Parquet Historical Archives
The repository includes pre-built DuckDB Parquet outputs in `data/processed/`:
- `daily_aggregates.parquet` (`2,955,260` rows, ~20.7 MB)
- `recent_observations_2026.parquet` (`737,959` rows, ~12.1 MB)
- `parquet_manifest.json`

If you replace or refresh the immutable ZIP archives in `data/raw/` and want to rebuild the Parquet files from scratch (verifying SHA-256 checksums, deduplicating exact/NRT records, and regenerating `parquet_manifest.json`):

```bash
npx tsx scripts/buildParquet.ts
```

*(Expect ~30–90 seconds depending on CPU/disk while DuckDB ingests ~8.91 million CSV rows via `/tmp/firescope_raw_extract`.)*

### Step 4 — Run in Development Mode
Starts the Express backend API + Vite middleware server on **port 3000** (`http://localhost:3000`):

```bash
npm run dev
```

### Step 5 — Build & Run in Production Mode
Compile the frontend bundle (`dist/`) and start the Express server serving static assets and `/api/v1/*`:

```bash
npm run build
NODE_ENV=production npm start
```

---

## 6. Testing, Linting & Verification

| Check | Command | Coverage |
|---|---|---|
| **Unit & Integration Tests** | `npx tsx --test src/science/fireScience.test.ts` | **24 test cases**: UTC parsing, MODIS/VIIRS schema preservation, NRT→STANDARD supersession, FRP aggregation, FR-08 YoY & leap-day alignment, FR-09 Median/MAD & pre-2012 exclusion, Multi-AOI extent normalization, 0.25° Parquet quadrant boundary additivity, offshore flare filter, `platforms=[]` edge cases |
| **TypeScript Typecheck / Lint** | `npm run lint` | Runs `tsc --noEmit` across client and server code |
| **Production Bundle Check** | `npm run build` | Builds Vite production assets into `dist/` |

> **Verification Status:** See [`docs/WHITEBOX_TESTING_REPORT.md`](./docs/WHITEBOX_TESTING_REPORT.md) for the complete White-Box Testing & PRD Conformance report (24/24 unit & integration tests, 19/19 live HTTP API contract checks, 0-error TypeScript lint & build, and headless Playwright browser verification).

---

## 7. Backend API Overview (`server.ts`)

Base path: `/api/v1` · All timestamps in UTC ISO-8601 · All coordinates in WGS84 (`EPSG:4326`).  
Unknown `/api/*` paths return structured JSON `404` (`NOT_FOUND`); invalid parameters return structured JSON `400`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | `GET` | Service health check & Parquet availability indicator |
| `/api/v1/data/status` | `GET` | Live FIRMS/EONET freshness, platform registry, `STANDARD`/`NRT` lag, and `parquet_archive` manifest |
| `/api/v1/analytics/calendar` | `GET` | Daily/weekly/monthly sensor-separated burning-activity calendar (`M1_AGGREGATED`) + FR-09 baseline |
| `/api/v1/analytics/compare` | `GET` | FR-08 like-for-like period & multi-year YoY historical comparison (`M2_COMPARATIVE`) |
| `/api/v1/analytics/compare-aois` | `GET` | Side-by-side Multi-AOI comparison with raw counts, `1,000 km²` density, and synchronized trace |
| `/api/v1/map/hotspots` | `GET` | Viewport-bounded stratified spatial sampling (capped at `4,500` observations) |
| `/api/v1/map/grid` | `GET` | Server-aggregated WGS84 spatial grid/cluster layer (`0.25°`–`2.0°`, capped at `1,500` cells) |
| `/api/v1/observations` | `GET` | Cursor-paginated canonical observation records (`limit` `1..250`) with full provenance |

Full parameter and response schemas are documented in [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md).

---

## 8. Project Documentation Index

- [`docs/PRD.md`](./docs/PRD.md) — Product requirements, P0/P1/P2 scope, and functional acceptance criteria (`FR-01`–`FR-10`).
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — System architecture and analytical pipeline boundaries.
- [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md) — Synchronized REST endpoint specifications and error codes.
- [`docs/DATA_DICTIONARY.md`](./docs/DATA_DICTIONARY.md) — Canonical observation schema, confidence fields, and platform registry.
- [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) — Scientific harmonization principles (`M0`–`M2`), caveats, and blocked `M3`/`M4` scope.
- [`docs/TECHNICAL_RESEARCH.md`](./docs/TECHNICAL_RESEARCH.md) — Literature review, FIRMS archive bounds, and statistical baseline rationale.
- [`docs/NASA_DATA_SOURCES.md`](./docs/NASA_DATA_SOURCES.md) — Verified NASA FIRMS, Earthdata, and user guide bibliography.
- [`docs/TESTING.md`](./docs/TESTING.md) — Scientific verification strategy and test invariants.
- [`docs/WHITEBOX_TESTING_REPORT.md`](./docs/WHITEBOX_TESTING_REPORT.md) — Full white-box audit, HTTP contract verification, and browser check report.
- [`docs/RELEASE_READINESS.md`](./docs/RELEASE_READINESS.md) — `v1.0.0-rc1` → `v1.0.0` release audit, dependency license inventory, and Go/No-Go gates.
- [`docs/FINAL_QA_REPORT.md`](./docs/FINAL_QA_REPORT.md) — Multi-viewport (`1440×900`, `768×1024`, `390×844`), accessibility, concurrency, and failure-recovery QA report.
- [`docs/RESPONSIVE_UI_AUDIT.md`](./docs/RESPONSIVE_UI_AUDIT.md) — Pre-Phase 9 responsive root-cause analysis and component remediation specification.
- [`docs/RESPONSIVE_QA_REPORT.md`](./docs/RESPONSIVE_QA_REPORT.md) — Full 9-viewport matrix (`1920×1080` down to `360×800` & `844×390`) verification report.
- [`docs/SECURITY_AUDIT.md`](./docs/SECURITY_AUDIT.md) — Secret isolation, HTTP security headers, injection boundary tests, and payload sanitization audit.
- [`docs/SCIENTIFIC_DATA_AUDIT.md`](./docs/SCIENTIFIC_DATA_AUDIT.md) — Immutable NASA archive SHA-256 verification and scientific guardrail compliance audit.
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — Production deployment, `systemd`/Nginx setup, backup/restore, and rollback runbook.
- [`docs/RELEASE_NOTES.md`](./docs/RELEASE_NOTES.md) — Production `v1.0.0` release notes and scientific scope boundaries.
- [`docs/DESIGN.md`](./docs/DESIGN.md) — Visual and UX design system specifications.
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — Architectural and scientific decision log.
- [`docs/PROJECT_GRAPH.md`](./docs/PROJECT_GRAPH.md) — Knowledge graph and data-lineage specification.
- [`AGENTS.md`](./AGENTS.md) — Engineering and scientific operating guardrails.

---

## 9. Official NASA References
- [NASA Space Apps 2026 — Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)
- [NASA FIRMS (Fire Information for Resource Management System)](https://www.earthdata.nasa.gov/data/tools/firms)
- [NASA FIRMS Archive Download](https://firms.modaps.eosdis.nasa.gov/download/)
- [NASA FIRMS Area API Documentation](https://firms.modaps.eosdis.nasa.gov/api/area)
- [NASA EONET v3 API](https://eonet.gsfc.nasa.gov/docs/v3)
- [VIIRS Collection 2 375 m Active Fire User Guide v1.2](https://earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf)
