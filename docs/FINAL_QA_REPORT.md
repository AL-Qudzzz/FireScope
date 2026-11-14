# FireScope — Final QA & Verification Report (`v1.0.0`)

- **Date Executed (UTC):** `2026-11-14`
- **Target Version:** `1.0.0` (`http://localhost:3000`)
- **Test Runner & Automation Stack:** Node.js `node:test` via `tsx`, native `fetch` HTTP load/boundary harness, and Playwright CLI (`playwright-cli` with headless Chromium)

---

## 1. Automated Unit & DuckDB Integration Test Suite (`24 / 24 PASS`)

Executed via `npm test` (`npx --yes tsx --test src/science/fireScience.test.ts`). Total duration: `1,030.88 ms`.

| # | Test Case | Duration | Status |
|---:|---|---:|---|
| 1 | `parseUtcAcquisitionTime handles zero-padded and unpadded HHMM strings in UTC` | `2.83 ms` | **PASS** |
| 2 | `parseModisRecord and parseViirsRecord preserve native confidence schemes without conversion` | `0.49 ms` | **PASS** |
| 3 | `AOI inclusion includes boundary points and validates bounding boxes` | `0.42 ms` | **PASS** |
| 4 | `deduplicateAndSupersedeObservations removes exact duplicates and supersedes NRT with STANDARD without proximity deduplication` | `0.82 ms` | **PASS** |
| 5 | `computeFrpSummary handles valid and null FRP records accurately` | `0.72 ms` | **PASS** |
| 6 | `computeSeasonalBaseline calculates robust_z and handles MAD=0 safely` | `0.66 ms` | **PASS** |
| 7 | `aggregateCalendarAnalytics separates MODIS and VIIRS and distinguishes NO_SOURCE_DATA for SNPP after 2026-11-02` | `3.64 ms` | **PASS** |
| 8 | `deriveProcessingStatus maps FIRMS version strings accurately` | `0.23 ms` | **PASS** |
| 9 | `canonicalizeEonetEvents maps NASA EONET v3 wildfire events while keeping acres distinct from FRP MW` | `1.28 ms` | **PASS** |
| 10 | `all archive observations reside strictly on terrestrial WGS84 coordinates with zero ocean anomalies` | `9.59 ms` | **PASS** |
| 11 | `parseFirmsActiveFireCsv parses official NASA MODIS C6.1 and VIIRS C2 rows without coordinate distortion` | `1.13 ms` | **PASS** |
| 12 | `queryLiveFirmsViewport filters by TODAY vs 24HRS date window and supports wrapped longitudes` | `0.77 ms` | **PASS** |
| 13 | `aggregateCalendarFromBuckets separates sensors and reports unavailable baseline when history < 3 periods` | `21.35 ms` | **PASS** |
| 14 | `FR-08 buildPeriodComparisonResponse computes unpooled deltas, era warnings, and CSV provenance` | `2.85 ms` | **PASS** |
| 15 | `Multi-AOI comparison computes extent rates per 1000 sq km and flags unequal AOI sizes` | `1.91 ms` | **PASS** |
| 16 | `aggregateObservationsToGrid and computeSolarTerminatorPolygon execute deterministically` | `0.93 ms` | **PASS** |
| 17 | `savedAois CRUD saves, loads, renames, and deletes custom AOIs cleanly` | `0.62 ms` | **PASS** |
| 18 | `DuckDB Parquet query service retrieves real NASA 2015 El Nino detections for Kalimantan Peatlands` | `245.70 ms` | **PASS** |
| 19 | `isTerrestrialWgs84Coordinate & isOffshoreMarineObservation accurately separate offshore oil rigs from mainland/volcanic islands` | `0.69 ms` | **PASS** |
| 20 | `queryLiveFirmsViewport excludes offshore flares only when excludeOffshore is true and reports excludedOffshoreCount` | `0.41 ms` | **PASS** |
| 21 | `summarizeBucketFrp via aggregateCalendarFromBuckets returns null median/p90 and exact max_mw` | `0.54 ms` | **PASS** |
| 22 | `FR-09 aggregateCalendarFromBuckets excludes pre-2012 VIIRS zero rows, flags incomplete months, and scopes monthly baselines cleanly` | `1.16 ms` | **PASS** |
| 23 | `Empty platforms=[] strictly returns 0 detections across calendar and live viewport helpers` | `0.64 ms` | **PASS** |
| 24 | `queryParquetDailyBuckets partitions adjacent 0.25deg cells additively without boundary double-counting` | `108.28 ms` | **PASS** |

---

## 2. API Concurrency & Performance Testing

### 2.1 Concurrent Load Benchmark (`20 Parallel Requests`)
- **Workload Mix:** 20 simultaneous requests distributed evenly across:
  1. `GET /api/v1/analytics/calendar` (`kalimantan-peat`, 35 monthly bins across `2024–2026` + 25-year DuckDB baseline)
  2. `GET /api/v1/analytics/compare` (`2015` vs `2023` El Niño + multi-year YoY DuckDB benchmark)
  3. `GET /api/v1/analytics/compare-aois` (`kalimantan-peat` vs `indonesia-archipelago` over DuckDB Parquet)
  4. `GET /api/v1/map/grid` (`0.5°` spatial aggregation across Indonesia bounds)
  5. `GET /api/v1/map/hotspots` (viewport spatial sampling over live NASA FIRMS stream)
- **Observed Results:**
  - **Success Rate:** `20 / 20` (`100%` HTTP `200 OK`, `0` errors or timeouts)
  - **Minimum Latency:** `560.6 ms`
  - **Median (`p50`) Latency:** `3,784.9 ms`
  - **95th Percentile (`p95`) Latency:** `5,099.0 ms`
  - **Maximum Latency:** `5,099.0 ms`

### 2.2 Map Rendering & Large Dataset Bounding
- **Global 24h Live Feed Volume Tested:** `117,976` active global detections (`206` offshore marine flares filtered by default).
- **Viewport Bounding:** `/api/v1/map/hotspots` deterministically caps global zoomed-out payloads at `<= 4,500` stratified points while returning 100% unsampled points for regional zooms (`<= 5,000` points).
- **Spatial Grid Bounding:** `/api/v1/map/grid` caps aggregated cells at `<= 1,500` cells across `0.25°`, `0.5°`, `1.0°`, and `2.0°` resolutions.

---

## 3. Responsive Viewport Testing (`Desktop`, `Tablet`, `Mobile`)

Executed in headless Chromium via `playwright-cli` against `http://localhost:3000`:

| Viewport Profile | Dimensions | `scrollWidth <= innerWidth` | Visual & Layout Verification | Status |
|---|---|---|---|---|
| **Desktop** | `1440 × 900` | `1440 <= 1440` (`hasOverflowX: false`) | Full top navigation bar (`Map Explorer`, `AOI Analysis`, `Sources`, `Methods`, `About`), context strip, interactive wrap-around world map, bottom floating tool dock (`AOI`, `Layers`, `Timeline`, `Measure`, `Capture`, `Share`, `Help`). | **PASS** |
| **Tablet** | `768 × 1024` | `768 <= 768` (`hasOverflowX: false`) | Compact workspace switcher (`Map Explorer`, `AOI Analysis`), 2-column sensor summary cards (`MODIS: 9,089`, `VIIRS: 89,172`), responsive Burning-Activity Calendar grid and legend. | **PASS** |
| **Mobile** | `390 × 844` | `390 <= 390` (`hasOverflowX: false`) | Hamburger navigation drawer trigger (`Open primary navigation`), stacked AOI controls (`Export CSV`, `Open in Map Explorer`), wrapped sub-tabs (`Activity Calendar`, `Compare History`, `Compare Regions`), stacked MODIS/VIIRS cards with zero horizontal clipping. | **PASS** |

---

## 4. Browser Engine Matrix & Honest Scope Statement

| Browser Engine | Execution Status | Notes |
|---|---|---|
| **Chromium (Headless Shell)** | **EXECUTED & PASSED** | Verified via `playwright-cli --browser=chromium` across `1440×900`, `768×1024`, and `390×844`. |
| **Google Chrome / Microsoft Edge (Blink)** | **ENGINE-EQUIVALENT (Chromium)** | Uses the identical Blink + V8 rendering engine tested in headless Chromium; standard CSS Grid/Flexbox and ES2022 APIs used throughout. |
| **Mozilla Firefox / WebKit** | **NOT INSTALLED IN CONTAINER** | Per container environment constraints, only the Chromium binary (`/ms-playwright/chrome-headless-shell-linux64`) is installed locally. No vendor-specific CSS/JS APIs are used (`autoprefixer` `10.6.2` is enabled in build). |

---

## 5. Accessibility & Keyboard Navigation Testing

- **Semantic Landmarks Verified in Accessibility Tree:**
  - `<header>` (`banner`), `<nav aria-label="Primary workspaces">`, `<main>`, `<div role="toolbar" aria-label="Map workspace tools">`, `<div role="group" aria-label="NASA FIRMS live time window">`, `<div role="group" aria-label="Map observation aggregation mode">`, and `<div role="tablist">` in `AOI Analysis`.
- **Keyboard Focus Traversal:**
  - Sequential `Tab` key presses verified programmatic focus movement across interactive `<button>` controls (`Open primary navigation` → `FireScope` home button → workspace buttons → map controls) with visible focus rings.
- **Visual Differentiation Beyond Color:**
  - Calendar cells use distinct borders, text labels (`Gap`, `No data available`), and diagonal SVG hatch patterns (`NO_SOURCE_DATA`) so states are distinguishable without relying solely on color.

---

## 6. Source-State, Offline Recovery, Caching & Persistence Testing

| Scenario | Test Method | Observed Outcome | Status |
|---|---|---|---|
| **Empty Selection (`platforms=`)** | HTTP `GET /api/v1/analytics/calendar?...&platforms=` + Unit Test #23 | Returns `MODIS_detections: 0`, `VIIRS_detections: 0`, and `0` matching points without falling back to all platforms. | **PASS** |
| **Partial Platform Gap (`S-NPP > 2026-11-02`)** | Live Calendar inspection (`2026-11-13`) + Unit Test #7 | Cell displays `Gap` badge and explicit coverage note: `Partial platform coverage: SNPP unavailable in this window (VIIRS S-NPP listed through 2026-11-02)`. | **PASS** |
| **No Source Data (`2026-11-14` future/unobserved bin)** | Live Calendar inspection | Cell renders diagonal hatch with `No data available` instead of `0 detections`. | **PASS** |
| **Simulated NASA API Outage (`503`) & UI Recovery** | Playwright network route interception (`503 UPSTREAM_UNAVAILABLE`) on `/api/v1/analytics/calendar*` | UI immediately cleared stale state and displayed inline error banner with `Retry` button (`count: 1`). Unrouting and clicking `Retry` restored the calendar cleanly (`retryCleared: true`). | **PASS** |
| **Server-Side Cache Cooldown & Deduplication** | Inspected & tested `ensureLiveFirmsLoaded()` (`10 min` TTL + `inFlightFirmsPromise`) and `ensureLiveEonetLoaded()` (`5 min` TTL) | Concurrent requests share a single in-flight upstream fetch and serve cached snapshots within the 10-minute cooldown window. | **PASS** |
| **Saved AOI Persistence (`localStorage`)** | Unit Test #17 + Playwright `localStorage` injection (`firescope.saved_aois.v1`) across full `page.reload()` | Custom AOI (`QA South Borneo Test AOI`) persisted across browser reload (`persistedAoiCount: 1`) and populated AOI selectors. | **PASS** |
