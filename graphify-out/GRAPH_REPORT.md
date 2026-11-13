# FireScope Knowledge Graph Report (`graphify-out/GRAPH_REPORT.md`)

**Generated:** 2026-11-13T10:45:00Z  
**Workspace:** FireScope (`AGENTS.md`, `PRD.md`, `DESIGN.md`, `ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `METHODOLOGY.md`, `API_CONTRACT.md`, `TECHNICAL_RESEARCH.md`, `NASA_DATA_SOURCES.md`, `TESTING.md`, `DECISIONS.md`)

## 1. High-Connectivity Core Nodes
1. **`BurningActivityCalendar` (`src/components/CalendarHeatmap.tsx`)** — 14 edges (`EXTRACTED`):
   - Consumes `CalendarAnalyticsResponse` from `/api/v1/analytics/calendar` (`src/science/fireScience.ts`).
   - Enforces `M1_AGGREGATED` and `M2_COMPARATIVE` sensor separation (`MODIS` vs `VIIRS`).
   - Renders distinct visual states for `OBSERVED_ACTIVE`, `NO_DETECTIONS_IN_AVAILABLE_RECORDS`, `PARTIAL_COVERAGE`, and `NO_SOURCE_DATA` (diagonal hatch).
2. **`CanonicalObservation` (`src/types/firescope.ts`)** — 12 edges (`EXTRACTED`):
   - Preserves `sensor`, `platform`, `instrument`, `acq_datetime_utc`, `confidence_native`, `confidence_scheme`, `frp_mw`, `scan_native`, `track_native`, `processing_version`, `processing_status`, `source_file_checksum`, and `raw_attributes`.
3. **`PlatformRegistry` (`src/data/firmsArchiveData.ts`)** — 9 edges (`EXTRACTED`):
   - Tracks `TERRA`, `AQUA`, `SNPP` (`NO_RECENT_DATA` after `2026-11-02`), `NOAA20`, and `NOAA21`.
4. **`DeduplicationAndSupersession` (`src/science/fireScience.ts`)** — 8 edges (`EXTRACTED`):
   - Removes exact ingestion duplicates and supersedes `NRT` with `STANDARD` records without proximity-only deduplication.

## 2. Provenance & Guardrail Traceability Paths
- **End-to-End Calendar Path:** `RAW_ARCHIVE_MANIFEST` (SHA-256) → `parseModisRecord` / `parseViirsRecord` → `deduplicateAndSupersedeObservations` → `aggregateCalendarAnalytics` → `GET /api/v1/analytics/calendar` → `CalendarHeatmap` → `SelectedBinDetail` → `ObservationInspector`.
- **Scientific Guardrails Enforced (`EXTRACTED`):**
  - `MODIS_NUMERIC_0_100` and `VIIRS_C2_CATEGORICAL` are never converted to a shared scale.
  - `frp_mw` is always labeled in `MW` with `valid_count` and never called burned area or fire size.
  - `pooled_observation_count` is explicitly labeled as an unweighted sum of records, never a harmonized fire count.
  - `M3_HARMONIZED` and `M4_PROBABILITY_ADJUSTED` are gated and excluded from MVP production metrics.
