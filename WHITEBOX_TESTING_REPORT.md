# Laporan Lengkap White-Box Testing & Audit Kesesuaian PRD — FireScope

- **Tanggal Verifikasi:** 2026-11-13 (UTC)
- **Lingkup Audit:** Transformasi ilmiah (`M0_RAW`, `M1_AGGREGATED`, `M2_COMPARATIVE`), kueri DuckDB Parquet, live feed NASA FIRMS & EONET v3, API backend Express, state/UI React, serta kesesuaian dengan `PRD.md`, `TESTING.md`, `METHODOLOGY.md`, `DATA_DICTIONARY.md`, dan `API_CONTRACT.md`.
- **Aturan Ketat Ilmiah:** Tidak memodifikasi data mentah (`data/raw/*.zip` maupun `data/processed/*`), menjaga pemisahan MODIS C6.1 (`0–100`) vs VIIRS C2 (`low|nominal|high`), menjaga pemisahan NRT vs STANDARD, serta tidak mengaktifkan metode `M3`/`M4`.

---

## 1. Ringkasan Eksekutif Hasil Pengujian

| Jenis Verifikasi | Perintah / Target | Hasil | Cakupan |
|---|---|---|---|
| **Unit & Integration Test** | `npx --yes tsx --test src/science/fireScience.test.ts` | **24 / 24 PASS** | Parsing UTC/CSV, dedup NRT→STANDARD, FRP, FR-09 baseline, FR-08 YoY, Multi-AOI, DuckDB Parquet boundary & additivity, offshore marine filter, empty `platforms=[]` |
| **Live HTTP API Contract Test** | `http://localhost:3000` (19 endpoint/case) | **19 / 19 PASS** | `200` status/health, 10 kasus validasi `400`, `404 NOT_FOUND` JSON, `platforms=` kosong, leap-day YoY, Parquet calendar + FRP, grid, hotspots |
| **TypeScript Lint / Typecheck** | `npm run lint` (`tsc --noEmit`) | **PASS (0 errors)** | Seluruh file TypeScript client & server |
| **Production Build** | `npm run build` (`vite build`) | **PASS (0 errors)** | Bundling penuh aplikasi Web |
| **Browser Headless Verification** | `playwright-cli` (`1440×900`) | **PASS (0 console error, 0 warning)** | Map Explorer, AOI Analysis (Activity Calendar + Selected Bin Detail), Compare History, Compare Regions |

---

## 2. Daftar Lengkap Unit & Integration Tests (24 / 24 PASS)

Dieksekusi melalui `npx --yes tsx --test src/science/fireScience.test.ts` dengan durasi total ~1.23s:

| # | Nama Test Case | Fokus White-Box / Invariant yang Diuji | Status |
|---|---|---|---|
| 1 | `parseUtcAcquisitionTime handles zero-padded and unpadded HHMM strings in UTC` | Konversi waktu akuisisi UTC untuk format `HHMM` dengan/tanpa leading zero | PASS |
| 2 | `parseModisRecord and parseViirsRecord preserve native confidence schemes without conversion` | Skema confidence MODIS numerik (`0–100`) & VIIRS kategorikal (`low/nominal/high`) tetap terpisah | PASS |
| 3 | `AOI inclusion includes boundary points and validates bounding boxes` | Inklusi titik pada tepi BBOX dan validasi urutan koordinat WGS84 | PASS |
| 4 | `deduplicateAndSupersedeObservations removes exact duplicates and supersedes NRT with STANDARD without proximity deduplication` | Menghapus duplikat identik & mengganti NRT dengan STANDARD tanpa menggabungkan titik berdekatan secara paksa | PASS |
| 5 | `computeFrpSummary handles valid and null FRP records accurately` | Penanganan nilai `frp_mw` valid vs `null`, `sum_mw`, `mean_mw`, `median_mw`, `p90_mw`, `max_mw` | PASS |
| 6 | `computeSeasonalBaseline calculates robust_z and handles MAD=0 safely` | Perhitungan median, MAD, robust z-score (`z*`), dan fallback saat `MAD = 0` | PASS |
| 7 | `aggregateCalendarAnalytics separates MODIS and VIIRS and distinguishes NO_SOURCE_DATA for SNPP after 2026-11-02` | Pemisahan seri MODIS vs VIIRS serta status `NO_SOURCE_DATA` pasca berakhirnya arsip S-NPP (2026-11-02) | PASS |
| 8 | `deriveProcessingStatus maps FIRMS version strings accurately` | Pemetaan versi produk (`6.1`, `6.1NRT`, `2.0`, `2.0NRT`) ke `STANDARD` vs `NRT` | PASS |
| 9 | `canonicalizeEonetEvents maps NASA EONET v3 wildfire events while keeping acres distinct from FRP MW` | Mapping event NASA EONET v3 tanpa mencampur luasan (acres) dengan FRP (MW) | PASS |
| 10 | `all archive observations reside strictly on terrestrial WGS84 coordinates with zero ocean anomalies` | Integritas koordinat terestrial pada data arsip referensi | PASS |
| 11 | `parseFirmsActiveFireCsv parses official NASA MODIS C6.1 and VIIRS C2 rows without coordinate distortion` | Parsing CSV resmi NASA FIRMS tanpa distorsi koordinat maupun atribut native | PASS |
| 12 | `queryLiveFirmsViewport filters by TODAY vs 24HRS date window and supports wrapped longitudes` | Filter jendela tanggal live serta dukungan longitudinal map wrapping (`+360°`) | PASS |
| 13 | `aggregateCalendarFromBuckets separates sensors and reports unavailable baseline when history < 3 periods` | Tidak memalsukan median/MAD saat histori kurang dari 3 periode | PASS |
| 14 | `FR-08 buildPeriodComparisonResponse computes unpooled deltas, era warnings, and CSV provenance` | Delta terpisah per sensor, peringatan transisi era platform, dan metadata CSV | PASS |
| 15 | `Multi-AOI comparison computes extent rates per 1000 sq km and flags unequal AOI sizes` | Normalisasi kepadatan per `1.000 km²`, peringatan perbedaan luas ekstrem & perbedaan sumber data | PASS |
| 16 | `aggregateObservationsToGrid and computeSolarTerminatorPolygon execute deterministically` | Agregasi sel grid WGS84 (`0.5°`) dengan wrap longitude + kalkulasi poligon terminator surya | PASS |
| 17 | `savedAois CRUD saves, loads, renames, and deletes custom AOIs cleanly` | Persistensi CRUD `SavedAoiRecord` (create, read, rename, delete) | PASS |
| 18 | `DuckDB Parquet query service retrieves real NASA 2015 El Nino detections for Kalimantan Peatlands` | Kueri langsung `daily_aggregates.parquet` (>2M rows agregat / >8M baris kanonik) periode El Niño 2015 | PASS |
| 19 | `isTerrestrialWgs84Coordinate & isOffshoreMarineObservation accurately separate offshore oil rigs from mainland/volcanic islands` | Pemisahan titik flare lepas pantai (Natuna, Luconia, Poleng, Laut Timor, Teluk Persia, dll.) dari pulau/daratan asli | PASS |
| 20 | `queryLiveFirmsViewport excludes offshore flares only when excludeOffshore is true and reports excludedOffshoreCount` | Penghitungan `excludedOffshoreCount` dan perilaku toggle `excludeOffshore` | PASS |
| 21 | `summarizeBucketFrp via aggregateCalendarFromBuckets returns null median/p90 and exact max_mw` | Memastikan bucket Parquet harian mengembalikan `median_mw: null`, `p90_mw: null`, `sum_mw: 60`, `mean_mw: 20`, `max_mw: 40` | PASS |
| 22 | `FR-09 aggregateCalendarFromBuckets excludes pre-2012 VIIRS zero rows, flags incomplete months, and scopes monthly baselines cleanly` | Menolak tahun pra-2012 pada baseline VIIRS, menandai `Incomplete UTC period` pada bulan berjalan, serta menonaktifkan baseline bulanan pada granularitas harian | PASS |
| 23 | `Empty platforms=[] strictly returns 0 detections across calendar and live viewport helpers` | Memastikan `platforms: []` menghasilkan `0` deteksi di `aggregateCalendarAnalytics`, `aggregateCalendarFromBuckets`, dan `queryLiveFirmsViewport` | PASS |
| 24 | `queryParquetDailyBuckets partitions adjacent 0.25deg cells additively without boundary double-counting` | Memverifikasi jumlah 4 kuadran `0.25°` (`SW+SE+NW+NE`) tepat sama dengan BBOX gabungan `0.5° × 0.5°` di Kalimantan Sep 2015 | PASS |

---

## 3. Pengujian Kontrak HTTP Backend (`http://localhost:3000` — 19 / 19 PASS)

Seluruh request dijalankan terhadap server Express + DuckDB + Live NASA FIRMS yang aktif:

| # | Test Case | Endpoint & Query | HTTP Expected | Hasil Aktual |
|---|---|---|---|---|
| 1 | Health check | `GET /health` | `200` | `status: "ok"`, `parquet_available: true` |
| 2 | Status data & manifest | `GET /api/v1/data/status` | `200` | `parquet_archive.available: true` |
| 3 | Tanggal kalender tidak valid | `GET /api/v1/analytics/calendar?start_date=2026-02-31&end_date=2026-03-01` | `400` | `error.code: "INVALID_DATE_FORMAT"` |
| 4 | Metrik tidak valid | `GET /api/v1/analytics/calendar?metric=burned` | `400` | `error.code: "INVALID_METRIC"` |
| 5 | Processing status tidak valid | `GET /api/v1/analytics/calendar?processing_status=BAD` | `400` | `error.code: "INVALID_PROCESSING_STATUS"` |
| 6 | Day/Night tidak valid | `GET /api/v1/analytics/calendar?daynight=X` | `400` | `error.code: "INVALID_DAYNIGHT"` |
| 7 | Platform tidak dikenal | `GET /api/v1/analytics/calendar?platforms=BOGUS` | `400` | `error.code: "INVALID_PLATFORMS"` |
| 8 | Kategori VIIRS tidak valid | `GET /api/v1/analytics/calendar?viirs_categories=bad` | `400` | `error.code: "INVALID_VIIRS_CATEGORIES"` |
| 9 | Granularitas tidak valid | `GET /api/v1/analytics/calendar?granularity=hour` | `400` | `error.code: "INVALID_GRANULARITY"` |
| 10 | Sensor tidak didukung | `GET /api/v1/analytics/calendar?sensor=LANDSAT` | `400` | `error.code: "INVALID_SENSOR"` |
| 11 | Limit bukan integer | `GET /api/v1/observations?limit=1.5` | `400` | `error.code: "INVALID_LIMIT"` |
| 12 | Cursor negatif | `GET /api/v1/observations?cursor=-2` | `400` | `error.code: "INVALID_CURSOR"` |
| 13 | Route API tidak ada | `GET /api/v1/does-not-exist` | `404` | JSON `error.code: "NOT_FOUND"` (bukan HTML SPA) |
| 14 | Platform kosong eksplisit | `GET /api/v1/analytics/calendar?aoi_id=kalimantan-peat&start_date=2024-09-01&end_date=2024-09-05&granularity=day&platforms=` | `200` | `MODIS_detections: 0`, `VIIRS_detections: 0` |
| 15 | YoY tahun kabisat (02-29) | `GET /api/v1/analytics/compare?aoi_id=kalimantan-peat&period_a_start=2023-02-28&period_a_end=2023-03-02&period_b_start=2024-02-29&period_b_end=2024-03-02&granularity=day` | `200` | Resolusi aman `02-29` vs `02-28` & `yoy_summary` non-kosong |
| 16 | Kalender Parquet + FRP jujur + Baseline | `GET /api/v1/analytics/calendar?aoi_id=kalimantan-peat&start_date=2024-01-01&end_date=2026-11-13&granularity=month` | `200` | `median_mw: null`, `p90_mw: null`, `max_mw` numerik, `VIIRS baseline_years >= 2012` |
| 17 | Perbandingan Multi-AOI | `GET /api/v1/analytics/compare-aois?aoi_a_id=kalimantan-peat&aoi_b_id=indonesia-archipelago&start_date=2025-07-01&end_date=2025-09-30&granularity=month` | `200` | Mengembalikan `aoi_a`, `aoi_b`, dan `aligned_series` |
| 18 | Layer Grid Spasial | `GET /api/v1/map/grid?west=94&south=-12&east=142&north=7&mode=grid&resolution_deg=1.0` | `200` | Mengembalikan `cells` teragregasi (`<= 1500` sel) |
| 19 | Hotspots Map Viewport | `GET /api/v1/map/hotspots?west=94&south=-12&east=142&north=7&zoom=5` | `200` | Mengembalikan `items` ter-sampling & metadata viewport |

---

## 4. Temuan White-Box & Perbaikan yang Diterapkan

1. **Integritas Agregat FRP Parquet (`comparisonScience.ts`, `SelectedBinDetail.tsx`, `firescope.ts`)**
   - *Temuan*: Bucket harian `daily_aggregates.parquet` sebelumnya mengisi `median_mw` dengan nilai mean dan `p90_mw` dengan nilai maksimum.
   - *Perbaikan*: Mengembalikan `median_mw: null`, `p90_mw: null`, menambahkan `max_mw`, menyertakan keterangan eksplisit pada `processing_status_note`, serta menampilkan `N/A (daily agg)` + baris `Max: ... MW` pada UI detail bin.

2. **Validitas Baseline Historis FR-09 (`comparisonScience.ts`, `fireScience.ts`, `SelectedBinDetail.tsx`)**
   - *Temuan*: Tahun pra-2012 yang bernilai `0` untuk VIIRS ikut masuk ke median/MAD baseline VIIRS; `historicalMonthTotals` juga terpakai pada tampilan harian/mingguan; bulan parsial belum diberi penanda; judul baseline di UI sempat hardcoded `2024–2026`.
   - *Perbaikan*: Memfilter tahun baseline per sensor sesuai rentang operasional platform (`first_observation_date`/`last_observation_date`), membatasi baseline historis bulanan hanya untuk `granularity === 'month'`, menandai bulan berjalan sebagai `Incomplete UTC period`, dan merender rentang tahun baseline dinamis dari `baseline_years`.

3. **Batas Sel Spasial `0.25°` pada DuckDB (`parquetService.ts`)**
   - *Temuan*: Kondisi `<= bbox.north` dan `<= bbox.east` menyebabkan sel tetangga terluar di batas utara/timur ikut terhitung.
   - *Perbaikan*: Mengubah klausa menjadi half-open (`> south`, `< north`, `> west`, `< east` untuk rentang non-nol) dan memverifikasi aditivitasnya via unit test partisi 4 kuadran.

4. **Validasi Batas API & Penanganan `platforms=[]` (`server.ts`, `firmsLiveService.ts`, `firescopeApi.ts`)**
   - *Temuan*: Query `platforms=` kosong dianggap memilih seluruh 5 platform; tanggal fiktif (`2026-02-31`), `metric` ilegal, `processing_status`, `daynight`, `viirs_categories`, limit desimal, dan cursor negatif belum tertolak rapi dengan kode `400`; route `/api/*` yang tidak dikenal jatuh ke HTML SPA.
   - *Perbaikan*: Mengetatkan parser filter bersama, validasi tanggal kalender riil & kabisat YoY, clamping tanggal akhir 2026 ke ketersediaan aktual, dan menambahkan catch-all `app.all('/api/*', ...)` JSON `404`.

5. **Sinkronisasi Visualisasi & Error State UI (`ComparisonPanels.tsx`, `SensorComparisonChart.tsx`, `SelectedBinDetail.tsx`, `ToolPanels.tsx`, `CalendarHeatmap.tsx`, `ObservationInspector.tsx`, `App.tsx`)**
   - `SensorComparisonChart`: Mode `5-Platform Split` kini menskalakan batang terhadap `maxPlatformCount` (bukan `maxVal` MW) dan menampilkan label `Unit: Observation Records per Platform`.
   - `AoiComparisonPanel`: `Synchronized Time-Bin Trace` menampilkan batang terpisah untuk MODIS dan VIIRS sesuai filter sensor aktif, serta banner error + tombol `Retry`.
   - `PeriodComparisonPanel` & `App.tsx`: Banner error + tombol `Retry`, sinkronisasi batas cakupan Parquet Indonesia, prop `liveMinDate` / `liveMaxDate` dinamis, reset pagination per bin + tampilan `Showing 150 of 4,444` di `SelectedBinDetail`, serta label `Unavailable` untuk `confidence_native` bernilai `null`.

---

## 5. Verifikasi Browser Headless (`playwright-cli` · `1440×900`)

- **Map Explorer (`/`)**: Peta dunia wrap-around horizontal tampil tanpa error WebSocket/console; menampilkan `Showing 4,500 / 188,893 FIRMS` (total `189,256` dengan 363 titik offshore tersembunyi oleh toggle default), switcher `TODAY UTC` / `24HRS LIVE`, dan mode `Points / Grid / Cluster`.
- **AOI Analysis — Activity Calendar (`kalimantan-peat`, `2024-01-01..2026-11-13`, `month`)**:
  - Ringkasan terpisah sensor: **MODIS Observed Detections: `19,215`** (`Terra: 10,303 · Aqua: 8,912`, Mean FRP `29.49 MW`) dan **VIIRS Observed Detections: `279,070`** (`S-NPP: 90,038 · N20: 95,057 · N21: 93,975`, Mean FRP `6.67 MW`).
  - `Selected Time-Bin Detail · Nov 2026`: Menampilkan `Median: N/A (daily agg)`, `P90: N/A (daily agg)`, `Max: 167.89 MW` (MODIS) / `215.81 MW` (VIIRS), `Historical Baseline (2001–2025, 25 yr)`, catatan `Incomplete UTC period (2026-11-01 to 2026-11-13)`, dan `Canonical Hotspot Observation Records (Showing 150 of 4,444)`.
- **Compare History (FR-08)**: Menampilkan perbandingan `Jul–Nov 2025` vs `Jul–11-13, 2026` terpisah per sensor (`MODIS C6.1` & `VIIRS C2`), peringatan `Processing lifecycle difference` (`STANDARD` vs `NRT`) dan batas akhir `VIIRS Suomi-NPP (2026-11-02)`, serta rincian per bulan.
- **Compare Regions (Multi-AOI)**: Menampilkan `Central Kalimantan Peatlands` (`31,120 km²`) vs `Indonesia Archipelago` (`1,904,569 km²`) lengkap dengan metrik mentah, densitas per `1,000 km²`, peringatan perbandingan luas ekstrem, serta bar MODIS & VIIRS di `Synchronized Time-Bin Trace`.
- **Console Log Browser**: `Errors: 0, Warnings: 0`.

---

## 6. Matriks Kesesuaian PRD & Dokumen Teknis

| Scope | Item / Requirement | Status | Keterangan Audit |
|---|---|---|---|
| **P0** | **FR-01 s.d. FR-07** (Peta global, BBOX/Preset/Draw AOI, filter tanggal/sensor/platform/daynight/confidence, Activity Calendar, Inspector `M0_RAW`, Methodology, Dynamic Data Status) | **SESUAI** | Memenuhi seluruh aturan ilmiah (`AGENTS.md`, `METHODOLOGY.md`, `DATA_DICTIONARY.md`). |
| **P1** | **FR-08** Historical Period & YoY Comparison | **SESUAI** | Terintegrasi penuh dengan Parquet 2001–2026 Indonesia + live FIRMS. |
| **P1** | **FR-09** Unusual-Activity Seasonal Baseline (Median/MAD) | **SESUAI** | Menggunakan metode robust z-score `M2_COMPARATIVE` dengan filter tahun & bulan parsial yang valid. |
| **P1** | **FR-10** CSV Export with Provenance | **SESUAI** | Ekspor CSV tersedia di Calendar, Compare History, dan Compare Regions. |
| **P1** | Side-by-Side Multi-AOI Comparison | **SESUAI** | Tersedia melalui tab `Compare Regions` & `GET /api/v1/analytics/compare-aois`. |
| **P1** | Selectable Spatial Grid / Clustering Layer | **SESUAI** | Tersedia mode `Points`, `Grid`, `Cluster` (`0.25°–2.0°`) via `GET /api/v1/map/grid`. |
| **P2** | Persistent Saved AOIs & Auto-Refresh | **SESUAI** | CRUD `localStorage` untuk Saved AOIs & kontrol interval refresh (`Off / 5m / 10m`). |
| **P2** | Contextual Geospatial Overlays | **SESUAI** | Footprints (`scan × track`), solar terminator, terrain hillshade, graticule, batas admin, coastlines. |
| **Guardrail** | Cakupan Historis Indonesia vs Non-Indonesia | **TERJAGA** | Arsip historis Parquet mencakup Indonesia (2001–2026); non-Indonesia historis sebelum cutoff live tetap dilabeli jujur sebagai fixture baseline non-NASA. |
| **Blocked** | `M3` / `M4` Observation-Probability Correction | **TIDAK DIAKTIFKAN** | Sengaja diblokir sesuai `AGENTS.md` & `TECHNICAL_RESEARCH.md`. |
