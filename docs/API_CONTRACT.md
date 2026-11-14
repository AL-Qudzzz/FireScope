# API Contract

Base path `/api/v1`; JSON; UTC ISO-8601 timestamps; WGS84 coordinates. Validate inputs and include provenance/method metadata in analytical responses. Unknown `/api/*` routes return structured JSON `404` (`NOT_FOUND`).

## `GET /health`
```json
{"status":"ok","service":"firescope-api","version":"1.0.0"}
```

## `GET /api/v1/data/status`
Returns source/product/platform/collection, processing status, latest acquisition, retrieval time, availability status, and optional `parquet_archive` manifest (`available`, `row_count`, `canonical_input_rows`, `date_min`, `date_max`, `spatial_extent`, `products`, `checksums`). Example values must never be hardcoded as live status.

## `GET /api/v1/analytics/calendar`
Parameters: `start_date`, `end_date` (`YYYY-MM-DD` valid calendar dates), `granularity=day|week|month`, `aoi_id` or `bbox` (plus optional `aoi_name`), `metric=detection_count|frp_mw`, `sensor=MODIS|VIIRS|ALL`, optional `platforms` (omitted = all 5; empty `platforms=` = 0 platforms), `processing_status=ALL|STANDARD|NRT`, `daynight=ALL|D|N`, `modis_min_confidence` (`0–100`), `viirs_categories` (`low,nominal,high`).
When `aoi` overlaps NASA Parquet coverage (`2001-01-01`..`2026-11-12` within Indonesia archive bounds), historical bins are backed by `daily_aggregates.parquet` and merged cleanly (strictly non-overlapping `< liveCutoff`) with live 24h FIRMS rows.

Example:
```json
{
  "aoi":{"id":"sample-aoi","name":"Example AOI"},
  "query":{"start_date":"2024-01-01","end_date":"2024-12-31","granularity":"month"},
  "method":{"id":"M1_AGGREGATED","version":"1.0.0","description":"Sensor-specific counts in common monthly bins."},
  "series":[{
    "time_bin_start_utc":"2024-01-01T00:00:00Z",
    "time_bin_end_utc":"2024-02-01T00:00:00Z",
    "values":{"MODIS":123,"VIIRS":456},
    "pooled_observation_count":579,
    "frp_summary":{
      "MODIS":{"sum_mw":1234.5,"mean_mw":10.04,"median_mw":null,"p90_mw":null,"max_mw":85.2,"valid_count":123,"null_count":0},
      "VIIRS":{"sum_mw":987.6,"mean_mw":2.17,"median_mw":null,"p90_mw":null,"max_mw":42.1,"valid_count":456,"null_count":0}
    },
    "quality":{"coverage_note":"No independent observation-completeness estimate available."}
  }],
  "provenance":{"sources":["NASA FIRMS"],"retrieved_at_utc":"2026-11-13T01:00:00Z"}
}
```
All values above are illustrative placeholders.

## `GET /api/v1/analytics/compare` (FR-08 Like-for-Like Historical Period / Year-over-Year Comparison)
Parameters: `aoi_id` (and/or `bbox`, `aoi_name`), `period_a_start`, `period_a_end`, `period_b_start`, `period_b_end`, `period_a_label`, `period_b_label`, `granularity=day|week|month`, `sensor=MODIS|VIIRS|ALL`, `metric=detection_count|frp_mw`, plus standard platform/confidence filters.
Returns `PeriodComparisonResponse` with separate MODIS and VIIRS totals/deltas, aligned bin series, multi-year same-window YoY benchmark table (`yoy_summary`), platform-era continuity warnings, method/formula metadata, and SHA-256 provenance.

## `GET /api/v1/analytics/compare-aois` (Side-by-Side Multi-AOI Comparison)
Parameters: `aoi_a_id` (+ `bbox_a`, `aoi_a_name` for custom/saved AOIs), `aoi_b_id` (+ `bbox_b`, `aoi_b_name`), `start_date`, `end_date`, `granularity=day|week|month`, `sensor=MODIS|VIIRS|ALL`, `metric=detection_count|frp_mw`, plus standard filters.
Returns `AoiComparisonResponse` comparing both AOIs over the exact UTC window with separate MODIS/VIIRS totals, raw counts, geometric density per `1,000 km²`, peak bins, area/backing comparability warnings, and aligned trace series.

## `GET /api/v1/map/hotspots` (Viewport-Bounded Map Observations)
Parameters: `west`, `south`, `east`, `north`, `zoom`, `aoi_id`/`bbox`/`aoi_name`, `start_date`, `end_date`, `sensor`, `platforms`, `processing_status`, `daynight`, `modis_min_confidence`, `viirs_categories`, `exclude_offshore` (`true|false`), `limit` (capped at `4500`).
Returns bounded viewport-filtered or stratified spatially sampled observations (`items`, `total_in_viewport`, `total_global_24h`, `excluded_offshore_count`, `sampled`).

## `GET /api/v1/map/grid` (Selectable Spatial Grid / Cluster Aggregation)
Parameters: `west`, `south`, `east`, `north`, `mode=grid|cluster`, `resolution_deg` (`0.25 | 0.5 | 1.0 | 2.0`), `aoi_id`/`bbox`/`aoi_name`, `start_date`, `end_date`, `sensor`, `platforms`, `processing_status`, `daynight`, `modis_min_confidence`, `viirs_categories`, `exclude_offshore`.
Returns bounded (`<= 1500` cells) `MapGridResponse` containing aggregated WGS84 grid cells (`modis_detections`, `viirs_detections`, `pooled_observation_count`, FRP sums, platform list) with unprojected degree-cell area caveat.

## `GET /api/v1/observations`
Parameters: `start_datetime_utc`, `end_datetime_utc`, `aoi_id`/`bbox`, `sensor`, `platforms`, `processing_status`, `daynight`, `modis_min_confidence`, `viirs_categories`, integer `limit` (`1..250`), optional non-negative integer `cursor`. Returns `PaginatedObservationsResponse` with native confidence, processing status, collection, FRP, and source provenance.

## Errors
```json
{"error":{"code":"INVALID_DATE_RANGE","message":"end_date must be on or after start_date"}}
```
Validation error codes include: `INVALID_DATE_FORMAT`, `INVALID_DATE_RANGE`, `INVALID_DATETIME_RANGE`, `INVALID_GRANULARITY`, `INVALID_METRIC`, `INVALID_SENSOR`, `INVALID_PLATFORMS`, `INVALID_PROCESSING_STATUS`, `INVALID_DAYNIGHT`, `INVALID_VIIRS_CATEGORIES`, `INVALID_CONFIDENCE`, `INVALID_AOI`, `INVALID_BBOX`, `INVALID_VIEWPORT_BOUNDS`, `INVALID_GRID_MODE`, `INVALID_GRID_RESOLUTION`, `INVALID_LIMIT`, `INVALID_CURSOR`, `NOT_FOUND`.

## Contract rules
- `sensor=ALL` preserves sensor-separated values.
- Never return a normalized confidence unless method/version is explicit.
- Never call pooled counts “harmonized counts.”
- Pre-aggregated Parquet daily buckets omit exact observation-level `median_mw` and `p90_mw` (`null`), reporting exact `sum_mw`, `mean_mw`, and `max_mw` instead.
- Paginate raw observations.
- Update frontend types and this document when changing fields.
