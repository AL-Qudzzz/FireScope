# Data Dictionary

## 1. Purpose

Define a canonical observation representation without erasing sensor-specific meaning. Validate against the exact FIRMS product, platform, collection, and current attribute table before ingestion.

## 2. Canonical observation schema

| Canonical field | Type | Meaning / rule |
|---|---|---|
| `observation_id` | string | Stable internal ID derived from source identity, not rounded coordinates alone |
| `source_product` | string | Exact FIRMS source/product identifier |
| `sensor` | enum | `MODIS` or `VIIRS` |
| `platform` | enum/string | `TERRA`, `AQUA`, `SNPP`, `NOAA20`, `NOAA21`, etc. |
| `instrument` | string | Native instrument |
| `latitude`, `longitude` | float | Pixel-center coordinates, WGS84; validate ranges |
| `acq_datetime_utc` | datetime | Acquisition date/time parsed as UTC |
| `acq_date` | date | Original source date |
| `acq_time_native` | string | Original source time field |
| `frp_mw` | float/null | Fire Radiative Power in MW; not burned area |
| `brightness_native` | float/null | Native MODIS brightness field if supplied |
| `bright_ti4_native` | float/null | VIIRS I-band 4 brightness temperature if supplied |
| `bright_ti5_native` | float/null | VIIRS I-band 5 brightness temperature if supplied |
| `bright_t31_native` | float/null | MODIS band 31 brightness temperature if supplied |
| `scan_native` | float/null | Preserve source scan value and units |
| `track_native` | float/null | Preserve source track value and units |
| `confidence_native` | string/number/null | Original confidence value/category |
| `confidence_scheme` | string | E.g. MODIS numeric 0–100 or VIIRS C2 scheme |
| `daynight_native` | string/null | Original day/night encoding |
| `type_native` | string/number/null | Native MODIS detection type where available |
| `processing_version` | string | Exact source `version` field |
| `processing_status` | enum | `URT`, `RT`, `NRT`, `STANDARD`, `UNKNOWN` |
| `collection` | string | E.g. MODIS C6.1 or VIIRS C2 |
| `source_retrieved_at_utc` | datetime | Download/retrieval time |
| `source_file_checksum` | string | SHA-256 recommended |
| `source_row_number` | integer/null | Original row number when useful |
| `raw_attributes` | object | Original source attributes for audit |

## 3. Common FIRMS field names

### MODIS
Common attributes include `latitude`, `longitude`, `brightness`, `scan`, `track`, `acq_date`, `acq_time`, `satellite`, `confidence`, `version`, `bright_t31`, `frp`, `type`, `daynight`.

FIRMS describes MODIS coordinates as the center of an approximately 1 km fire pixel, not necessarily the exact fire location. `scan` and `track` reflect actual pixel size, which grows toward scan edge. Acquisition time is UTC. `confidence` is numeric 0–100 and intended to help assess detection quality. `version` distinguishes collection and processing source (URT, RT, NRT, Standard).

### VIIRS
Common FIRMS CSV attributes include `latitude`, `longitude`, `bright_ti4`, `scan`, `track`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `version`, `bright_ti5`, `frp`, `daynight`.

Use the **VIIRS Collection 2 375 m User Guide v1.2** and platform-specific FIRMS attribute tables as authority. Do not assume the older 2018 guide fully describes Collection 2.

## 4. Platform continuity metadata

Add a separate platform registry; do not encode current platform status as a property of individual observations only.

| Platform | Sensor | Archive coverage currently listed (2026-11-13) | Suggested status logic |
|---|---|---|---|
| Terra | MODIS | 2000-11-01 – present | Derive from latest archive/source status |
| Aqua | MODIS | 2002-07-03 – present | Derive from latest archive/source status |
| Suomi-NPP | VIIRS | 2012-01-20 – 2026-11-02 | `NO_RECENT_DATA` after archive end unless NASA updates |
| NOAA-20 | VIIRS | 2018-04-01 – present | Derive dynamically |
| NOAA-21 | VIIRS | 2023-03-01 – present | Derive dynamically |

Recommended platform registry fields:
`platform_id`, `sensor`, `first_observation_date`, `last_observation_date`, `status`, `status_checked_at_utc`, `status_source_url`, `status_note`.

Do not infer a permanent satellite outage from a single archive snapshot. Re-check live archive and NASA status notices.

## 5. Aggregate & Parquet archive schema

Analytical calendar and comparison responses use:
`aoi_id`, `time_bin_start_utc`, `time_bin_end_utc`, `spatial_unit_id`, `sensor`, `platform`, `processing_status`, `detection_count`, `frp_sum_mw`, `frp_mean_mw`, `frp_valid_count`, `method_id`, `method_version`, `source_record_count`, `coverage_note`.

For a pooled sensor total, use a field such as `pooled_observation_count`, never `harmonized_fire_count`.

### 5.1 `data/processed/daily_aggregates.parquet` (FR-08 Archive)
Generated deterministically via `scripts/buildParquet.ts` from immutable raw NASA FIRMS ZIP/CSV downloads (`MODIS C6.1`, `VIIRS S-NPP C2`, `VIIRS NOAA-20 C2`, `VIIRS NOAA-21 C2`) using `0.25°` unprojected WGS84 grid cells (`floor(coord * 4) / 4`):

| Column | Type | Meaning |
|---|---|---|
| `acq_date` | VARCHAR (`YYYY-MM-DD`) | UTC acquisition date |
| `lat_bin` | DOUBLE | Southwest cell latitude (`floor(latitude * 4) / 4`) |
| `lng_bin` | DOUBLE | Southwest cell longitude (`floor(longitude * 4) / 4`) |
| `sensor` | VARCHAR | `MODIS` or `VIIRS` |
| `platform` | VARCHAR | `TERRA`, `AQUA`, `SNPP`, `NOAA20`, `NOAA21` |
| `processing_status` | VARCHAR | `STANDARD` or `NRT` (deduplicated) |
| `daynight_native` | VARCHAR | `D`, `N`, or `U` |
| `confidence_bucket` | VARCHAR | Sensor-native bucket (`low_0_29`/`nominal_30_79`/`high_80_100` for MODIS; `low`/`nominal`/`high` for VIIRS) — never cross-sensor normalized |
| `detection_count` | BIGINT | Hotspot detections in bucket |
| `frp_sum_mw` | DOUBLE | Sum of valid finite FRP (MW) in bucket |
| `frp_valid_count` | BIGINT | Count of valid FRP records |
| `frp_null_count` | BIGINT | Count of null/missing FRP records |

### 5.2 `data/processed/recent_observations_2026.parquet`
Stores individual canonical observations from `2026-10-01` through `2026-11-12` for bounded viewport inspection and `/api/v1/observations` pagination without mutating `data/raw/*.zip`.

## 6. Data validation
- Validate coordinates and finite numeric values.
- Parse acquisition time according to source documentation; preserve raw values.
- Preserve unknown confidence encodings.
- Preserve exact version/collection/platform.
- Detect exact duplicate source rows using source identity or hashes.
- Never deduplicate nearby records based on distance alone.
- Record schema drift and fail if required columns disappear.
- Keep raw source files immutable.
