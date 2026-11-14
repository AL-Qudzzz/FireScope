# FireScope — Scientific Data & Provenance Audit (`v1.0.0`)

- **Audit Date (UTC):** `2026-11-14`
- **Auditor Role:** Scientific Data Auditor
- **Reference Standards:** `AGENTS.md`, `docs/METHODOLOGY.md`, `docs/DATA_DICTIONARY.md`, `docs/TECHNICAL_RESEARCH.md`
- **Audit Verdict:** **PASS — Full Scientific & Provenance Compliance Verified**

---

## 1. Immutable Raw NASA Source Archives (`data/raw/*.zip`)

All four official NASA FIRMS historical archive ZIP packages in `data/raw/` were hashed via streaming SHA-256 and verified against `data/processed/parquet_manifest.json`. **Zero bytes have been mutated.**

| Archive Filename | Sensor & Collection | Platforms | SHA-256 Checksum (`Actual == Manifest`) | Status |
|---|---|---|---|---|
| `DL_FIRE_M-C61_844378.zip` | MODIS Collection 6.1 | `TERRA`, `AQUA` | `fe57e59328f1ae68f742d54db46f00bf629e8268719c692ec1f36fc451db1b50` | **MATCH** |
| `DL_FIRE_J1V-C2_844379.zip` | VIIRS Collection 2 | `NOAA20` | `6c65aeb15e5859d2d237dec3ea48542715ccefb7fbb4c3f4a42e19140b053aa8` | **MATCH** |
| `DL_FIRE_J2V-C2_844380.zip` | VIIRS Collection 2 | `NOAA21` | `c47d458f82d540cdb9fb4ff5ec075757c5cb478b0498f8ad1f6327a806afa9bb` | **MATCH** |
| `DL_FIRE_SV-C2_844381.zip` | VIIRS Collection 2 | `SNPP` | `0a83b22937dea41d5113aa7787017f004878304d1b07aca7c4b87ddead4bc73b` | **MATCH** |

### Extracted CSV Source Provenance (Recorded in `parquet_manifest.json`)
| CSV File ID | Product | Status | Date Window | Rows | SHA-256 Checksum |
|---|---|---|---|---:|---|
| `fire_archive_M-C61_844378.csv` | `MCD14ML_MCD14DL_C6_1_SP` | `STANDARD` | `2001-01-01..2026-08-31` | `1,600,907` | `9acf9064550dc0ed8711399c8a878834c9be227bf3d6f66febaf0c2a12edc0d7` |
| `fire_nrt_M-C61_844378.csv` | `MCD14ML_MCD14DL_C6_1_NRT` | `NRT` | `2026-09-01..2026-11-12` | `95,931` | `cd7dd23e75c9714a11563263200fa4eb3c9da23be6c2c63e5b5c5c51a87307fe` |
| `fire_archive_J1V-C2_844379.csv` | `VJ114IMGTDL_C2_SP` | `STANDARD` | `2018-04-01..2026-07-31` | `1,369,899` | `b98d641786df39a6532d6d277a4a757baab201787c7c2ad9fcdb6710fb169ec2` |
| `fire_nrt_J1V-C2_844379.csv` | `VJ114IMGTDL_C2_NRT` | `NRT` | `2026-08-01..2026-11-12` | `600,350` | `694aff643961973cd4619ea954aa34d0add27c94d276a5415da871cd9f32f458` |
| `fire_archive_J2V-C2_844380.csv` | `VJ214IMGTDL_C2_SP` | `STANDARD` | `2023-03-01..2026-07-31` | `516,231` | `800a9645eaaf4bdcdf0beeab0633dc60338839d011cc26dc5271d51670189b57` |
| `fire_nrt_J2V-C2_844380.csv` | `VJ214IMGTDL_C2_NRT` | `NRT` | `2026-08-01..2026-11-12` | `589,595` | `562e5d536e5c440ae5ff3b28fe0bce3c8193dfb8f9273e9195a9c1cbe1767dc3` |
| `fire_archive_SV-C2_844381.csv` | `VNP14IMGTDL_C2_SP` | `STANDARD` | `2012-01-20..2026-07-31` | `3,568,824` | `8150232d91564b5c4fbd74027daad9194719d8bb9b0cdc23ec09ea71bf35bee4` |
| `fire_nrt_SV-C2_844381.csv` | `VNP14IMGTDL_C2_NRT` | `NRT` | `2026-08-01..2026-11-02` | `571,763` | `0b5ceee3577e23b95a54a1a6d72c1798a2d08a03b958bbbc6284ad0347e6d8dc` |

### Processed DuckDB Parquet Artifacts (`data/processed/`)
| Artifact | Size (Bytes) | Row Count | SHA-256 Checksum |
|---|---:|---:|---|
| `daily_aggregates.parquet` | `20,752,552` | `2,955,260` | `35a1ceecd60d3242fd2e68c514093aeca8080c729a54d4c68b6bd044c5bd64ea` |
| `recent_observations_2026.parquet` | `12,089,794` | `737,959` | `90600a907f6eab22342f4e180160b5373a4d8064d9e958b3919837ad4fef8472` |
| `parquet_manifest.json` | `7,351` | `209 lines` | `10ca7db308f0d9d2c8096adbacd60b5929404b406b5a1afa31011d2c1faeba78` |

---

## 2. Scientific Guardrail Verification Matrix

| Guardrail Requirement | Implementation & Verification Evidence | Status |
|---|---|---|
| **MODIS vs VIIRS Confidence Separation** | `parseModisRecord` preserves numeric `0–100` (`MODIS_NUMERIC_0_100`); `parseViirsRecord` preserves categorical `low\|nominal\|high` (`VIIRS_C2_CATEGORICAL`). Never mapped to a shared probability scale (Unit Test #2). | **VERIFIED** |
| **NRT → STANDARD Supersession** | `deduplicateAndSupersedeObservations` (`src/science/fireScience.ts`) and `scripts/buildParquet.ts` remove exact ingestion duplicates (`282` removed in Parquet ETL) and replace `NRT` records with `STANDARD` records on matching `(sensor, platform, acq_datetime_utc, lat, lon)` keys without spatial-proximity merging (Unit Test #4). | **VERIFIED** |
| **Platform Continuity & Era Warnings** | Platform operational bounds (`TERRA` `2001-01-01`, `AQUA` `2002-07-04`, `SNPP` `2012-01-20..2026-11-02`, `NOAA20` `2018-04-01`, `NOAA21` `2023-03-01`) are enforced in `PLATFORM_REGISTRY`, calendar bin quality flags, and FR-08 YoY comparison warnings (Unit Tests #7, #14). | **VERIFIED** |
| **FRP Statistics & Pre-Aggregated Honesty** | Observation-level FRP computes exact `sum_mw`, `mean_mw`, `median_mw`, `p90_mw`, `max_mw`, `valid_count`, and `null_count` (Unit Test #5). Pre-aggregated Parquet daily buckets report exact `sum_mw`, `mean_mw`, `max_mw` and explicitly set `median_mw: null` and `p90_mw: null` (`N/A (daily agg)` in UI) rather than fabricating percentiles (Unit Test #21). | **VERIFIED** |
| **FR-09 Seasonal Baseline Validity** | `aggregateCalendarFromBuckets` (`src/science/comparisonScience.ts`) excludes pre-2012 zero-value years from VIIRS baselines, requires `>= 3` historical periods before computing Median/MAD `z*`, scopes monthly historical totals strictly to `granularity === 'month'`, and flags partial current UTC months with `Incomplete UTC period` (Unit Tests #6, #13, #22). | **VERIFIED** |
| **Zero Detections vs `NO_SOURCE_DATA`** | Bins with active platform coverage and zero detections are marked `NO_DETECTIONS_IN_AVAILABLE_RECORDS`; bins where a selected platform has no archive coverage (e.g. `SNPP` after `2026-11-02` or future dates) are marked `PARTIAL_COVERAGE` or `NO_SOURCE_DATA` (Unit Test #7). | **VERIFIED** |
| **Fixture vs Official NASA Labeling** | Indonesia AOIs (`kalimantan-peat`, `indonesia-archipelago`) query the 8.91M-row NASA Parquet archive (`2001–2026`) + live 24h NASA FIRMS streams. Non-Indonesia AOIs (`para-amazon`, `california-sierra`, etc.) explicitly return `data_backing: 'DEMO_FIXTURE_BASELINE'` and render a prominent `DEMO FIXTURE BASELINE` banner for historical dates outside the 24h live window. | **VERIFIED** |
| **Blocked `M3` / `M4` Methods** | Only `M0_RAW`, `M1_AGGREGATED`, and `M2_COMPARATIVE` are active in production. `M3_HARMONIZED` and `M4_PROBABILITY_ADJUSTED` remain blocked per `AGENTS.md` and `docs/TECHNICAL_RESEARCH.md`. | **VERIFIED** |
