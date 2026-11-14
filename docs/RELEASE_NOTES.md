# FireScope — Release Notes (`v1.0.0`)

- **Release Version:** `1.0.0` (promoted from `1.0.0-rc1`)
- **Release Date (UTC):** `2026-11-14`
- **Challenge:** NASA Space Apps 2026 — Harmonization of MODIS and VIIRS Hot Spots

---

## 1. Highlights of `v1.0.0`

**FireScope `v1.0.0`** is the production release of the global active-fire intelligence workspace and AOI burning-activity calendar for exploring **MODIS Collection 6.1** (`Terra`, `Aqua`) and **VIIRS Collection 2** (`Suomi-NPP`, `NOAA-20`, `NOAA-21`) satellite observations with strict scientific provenance.

### Core Capabilities Included
1. **Global Wrap-Around Map Explorer (`FR-01`, `FR-07`, P1/P2 Map Layers):**
   - Streams live 24-hour NASA FIRMS global active-fire CSV feeds (`~118k+` global detections) and NASA EONET v3 wildfire events.
   - Selectable **Points**, **Spatial Grid (`0.25°`–`2.0°`)**, and **Cluster** rendering modes with deterministic server-side bounding (`<= 4,500` viewport points, `<= 1,500` grid cells).
   - Verified offshore marine oil/gas flare filter (`exclude_offshore` toggle) and Solar Terminator day/night overlay.
2. **AOI Burning-Activity Calendar & Time-Bin Inspector (`FR-02`–`FR-06`, `FR-09`, `FR-10`):**
   - Backed by an embedded **DuckDB + Apache Parquet** archive over Indonesia (`2001-01-01` to `2026-11-12`, `8,913,218` canonical observations in `2,955,260` daily `0.25°` buckets and `737,959` recent Oct–Nov 2026 records) merged seamlessly with live 24h NASA FIRMS feeds.
   - Strictly separated `MODIS` and `VIIRS` counts, 5-platform breakdown, and honest FRP summaries (`sum_mw`, `mean_mw`, `max_mw`, and explicit `N/A (daily agg)` for pre-aggregated percentiles).
   - **FR-09 Seasonal Baseline:** Multi-year Median/MAD robust z-score (`z*`) anomaly detection with pre-2012 VIIRS zero-year exclusion and incomplete UTC month flagging.
   - **FR-10 CSV Export:** Provenance-complete CSV export with embedded method definitions and SHA-256 source checksums.
3. **Historical Period / YoY & Multi-AOI Comparison (`FR-08` & P1):**
   - **Compare History (`FR-08`):** Like-for-like UTC period comparison and multi-year same-window YoY benchmark tables with leap-year (`02-29`) alignment and platform-era transition warnings.
   - **Compare Regions (Multi-AOI):** Side-by-side comparison of two AOIs with raw counts, normalized hotspot density per `1,000 km²`, unequal-area caveats, and synchronized dual-sensor traces.
4. **Saved AOIs & Auto-Refresh (P2):**
   - Persistent browser `localStorage` Saved AOIs (`firescope.saved_aois.v1`) and user-configurable periodic auto-refresh.

---

## 2. Security & Release Hardening in `v1.0.0`

- Removed Express server banner (`x-powered-by`) and enforced HTTP security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Permitted-Cross-Domain-Policies: none`, `Permissions-Policy`, and `Cache-Control: no-store` on API routes).
- Enforced a `16 KB` JSON request payload limit and added a global sanitized JSON error handler (`400 INVALID_JSON`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_SERVER_ERROR`) preventing stack-trace disclosure.
- Organized all project, architectural, scientific, QA, security, and deployment documentation under `docs/`.

---

## 3. Known Scientific Boundaries & Intentional Non-Goals

- **Historical Parquet Spatial Scope:** The `8.91M`-row DuckDB Parquet historical archive (`2001–2026`) covers the Indonesia archipelago extent (`[95.02°E..140.98°E, -11.00°S..5.88°N]`). Historical queries outside Indonesia prior to the live 24h NASA FIRMS window use explicitly labeled synthetic baseline fixtures (`DEMO_FIXTURE_BASELINE`).
- **`VIIRS S-NPP` Archive Boundary:** Official NASA FIRMS archive coverage for `VIIRS Suomi-NPP` ends `2026-11-02`; subsequent bins explicitly report `Partial platform coverage` rather than implying a fire-activity drop.
- **Blocked `M3`/`M4` Methods:** Observation-probability and cloud/overpass gap-filling (`M3`/`M4`) remain intentionally disabled per `AGENTS.md` and `docs/TECHNICAL_RESEARCH.md`.
