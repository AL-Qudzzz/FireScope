# API Contract (Proposed)

Base path `/api/v1`; JSON; UTC ISO-8601 timestamps; WGS84 coordinates. Validate inputs and include provenance/method metadata in analytical responses.

## `GET /health`
```json
{"status":"ok","service":"firescope-api","version":"0.1.0"}
```

## `GET /api/v1/data/status`
Returns source/product/platform/collection, processing status, latest acquisition, retrieval time, and availability status. Example values must never be hardcoded as live status.

## `GET /api/v1/analytics/calendar`
Parameters: `start_date`, `end_date`, `granularity=day|week|month`, `aoi_id` or `bbox`, `metric=detection_count`, `sensor=MODIS|VIIRS|ALL`.

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
    "combined_pooled_count":579,
    "quality":{"coverage_note":"No independent observation-completeness estimate available."}
  }],
  "provenance":{"sources":["NASA FIRMS"],"retrieved_at_utc":"2026-11-13T01:00:00Z"}
}
```
All values above are illustrative placeholders.

## `GET /api/v1/observations`
Parameters: `start_datetime_utc`, `end_datetime_utc`, `bbox`, `sensor`, `platform`, bounded `limit`, optional `cursor`. Return native confidence, processing status, collection, FRP, and source provenance.

## Errors
```json
{"error":{"code":"INVALID_DATE_RANGE","message":"end_date must be on or after start_date"}}
```

## Contract rules
- `sensor=ALL` preserves sensor-separated values.
- Never return a normalized confidence unless method/version is explicit.
- Never call pooled counts “harmonized counts.”
- Paginate raw observations.
- Update frontend types and this document when changing fields.
