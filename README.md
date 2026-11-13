# FireScope — Agent Context

**Working title:** FireScope (not final)  
**Challenge:** NASA Space Apps 2026 — Harmonization of MODIS and VIIRS Hot Spots  
**Documentation baseline checked:** 2026-11-13

## Mission
Build a global web application that harmonizes MODIS and VIIRS active-fire observations into an interpretable burning-activity calendar for a selected area of interest (AOI). Users explore recent activity, historical patterns, unusual conditions, and critical periods.

## Challenge alignment
The official challenge explicitly asks for an AOI-based burning-activity calendar from harmonized active-fire hotspots. Calendar and AOI analysis are first-class features; a map-only dashboard is insufficient.

## Product pillars
1. Recent activity with sensor/platform/source freshness visible.
2. Historical intelligence through calendars, seasonal patterns, and comparisons.
3. Trustworthy harmonization with native attributes, provenance, method, and uncertainty preserved.

## Critical data facts
- FIRMS states global NRT active-fire data are generally available within about 3 hours of satellite observation.
- FIRMS archive currently lists MODIS C6.1 from 2000-11-01, VIIRS S-NPP through 2026-11-02, NOAA-20 from 2018-04-01, and NOAA-21 from 2023-03-01.
- FIRMS says NRT archive records are replaced by Standard science-quality records at approximately a 5-month lag.
- FIRMS Area API requires a free MAP_KEY, supports 1–5 days per request, and documents 5,000 transactions per 10-minute interval.
- Preserve platform and processing status; never interpret a platform data gap as a fire-activity decline.

## Non-goals
No exact future-fire prediction; no conflation of hotspot with incident/perimeter/burned area; no FRP-to-burned-area interpretation; no unvalidated common confidence scale; no claim that pooled sensor counts are harmonized.

## Provisional stack
React + TypeScript + Vite; MapLibre GL JS; Apache ECharts; Python + FastAPI; Pandas/NumPy/SciPy; DuckDB + Parquet. PostGIS only if justified.

## Docs
- `TECHNICAL_RESEARCH.md` — deep technical research, scientific rationale, algorithms, validation, and roadmap.
- `PRD.md` — product requirements.
- `AGENTS.md` — agent rules.
- `ARCHITECTURE.md` — system design.
- `DATA_DICTIONARY.md` — canonical schema and platform registry.
- `METHODOLOGY.md` — harmonization principles and caveats.
- `API_CONTRACT.md` — frontend/backend contract.
- `TESTING.md` — test strategy.
- `NASA_DATA_SOURCES.md` — verified source register and research bibliography.
- `DECISIONS.md` — decision log.
- `HACKATHON_EXECUTION.md` — execution plan.

## Official links
- Challenge: https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/
- FIRMS Earthdata: https://www.earthdata.nasa.gov/data/tools/firms
- FIRMS archive: https://firms.modaps.eosdis.nasa.gov/download/
- FIRMS Area API: https://firms.modaps.eosdis.nasa.gov/api/area
- VIIRS C2 375 m guide v1.2: https://earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf

## Source-of-truth hierarchy
Official challenge page/resources → NASA FIRMS/Earthdata and product guides → peer-reviewed papers/ATBDs → code repositories after code/license review → secondary sources.

## Agent warning
Distinguish observed, aggregated, comparative, harmonized, and inferred information. Never invent scientific coefficients or imply that an unvalidated metric is NASA-endorsed.
