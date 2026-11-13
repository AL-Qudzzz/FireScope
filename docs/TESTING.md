# Testing Strategy

## Goals
Prove parsing and transformations are correct, reproducible, and not misleading.

## Ingestion tests
- Required columns exist for each supported product.
- Missing required columns fail clearly.
- Coordinates are valid.
- Acquisition time parsing handles leading zeros.
- Null/non-finite values are handled consistently.
- Platform, collection, version, and processing status are retained.
- NRT and standard data are not silently conflated.

## Scientific unit tests
Use small hand-calculated fixtures for AOI filtering (including boundary points), UTC conversion, time-bin boundaries, sensor-specific counts, FRP null handling and valid count, median/MAD, MAD=0, incomplete periods, and duplicate handling.

## Regression tests
Same input + same method version = same output. Processing-version changes remain visible. New platforms do not silently alter old semantics. UI must not display normalized metrics for M1/M2.

## API tests
Invalid inputs return clear 4xx; raw observations are bounded/paginated; calendar includes method/provenance; `ALL` preserves sensor series; timestamps are UTC.

## Frontend tests
AOI/date changes update all views; calendar cell opens correct detail; legend distinguishes sensors; source status visible; empty data is not silently represented as zero; demo/live/error states differ; mobile layout works.

## E2E demo checklist
Clean checkout startup; documented data load; two global AOIs; calendar and drilldown; sensor breakdown; methodology/provenance; no secrets committed.
