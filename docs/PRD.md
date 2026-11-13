# Product Requirements Document

## Overview
**Product:** FireScope (working title)  
**Type:** Global web-based active-fire intelligence and burning-activity calendar.

### Problem
MODIS and VIIRS have observed active-fire hotspots over many years, but their observations differ in spatial resolution, platform, overpass timing, footprint geometry, detection algorithms, and confidence semantics. Raw counts can therefore be misleading when compared directly.

### Objective
Make recent and historical active-fire observations easier to explore for a chosen AOI, while explaining sensor differences, data availability, uncertainty, and provenance.

## Users
| User | Need |
|---|---|
| Early-warning teams | Identify recent activity and periods requiring attention |
| Emergency responders | Understand where/when detections occurred |
| Scientists/analysts | Compare periods without hiding sensor differences |
| Land managers | Understand recurring seasonal activity |
| Public/educators | Understand patterns with accessible explanations |

This is an analytical aid, not an operational dispatch system.

## Product principles
1. Calendar-first: burning-activity calendar is the core.
2. Global by design; Indonesia is a demo region, not the boundary.
3. Sensor-aware: retain MODIS and each VIIRS platform identity.
4. Transparent: every metric has definition, units, period, source, and method.
5. No false certainty: missing observations do not prove no fire.
6. Progressive disclosure: simple default, technical details on demand.
7. One complete vertical slice before stretch features.

## MVP — P0
- Global map or AOI selection.
- AOI by search, bounding box, or polygon (choose simplest reliable option).
- Date-range filter.
- Daily and/or monthly burning-activity calendar.
- Separate MODIS and VIIRS counts.
- Time-series chart for selected AOI.
- Day/time-bin detail with sensor/platform breakdown.
- FRP summary only with valid-value count and MW units.
- Source freshness, processing status, and retrieval timestamp.
- Methodology and limitations explanation.
- At least two geographically distinct demo AOIs.
- Use at least one dataset/resource confirmed in the official challenge Resources tab.

## P1
- Seasonal baseline and year-over-year comparison.
- Unusual-activity indicator using a documented baseline.
- CSV export of filtered aggregates.
- Compare AOIs or periods.
- Map clustering or grid aggregation.

## P2
- Saved AOIs, automated refresh, contextual layers, advanced observation-aware correction.

## Out of scope
- Fire-spread prediction.
- Reconstructing perimeters from hotspot points.
- Confirmed incidents without corroboration.
- Real-time alert service guarantees.
- Universal confidence conversion.
- Full native swath reprocessing unless feasible and scientifically reviewed.

## Core screens
1. Global overview: map, date context, freshness, sensor legend.
2. AOI analysis: calendar, temporal series, sensor composition, coverage notes.
3. Time-bin detail: records, native confidence, FRP stats, provenance.
4. Methodology: aggregation, baseline, limitations, source links.

## Functional requirements
| ID | Requirement | Priority | Acceptance |
|---|---|---:|---|
| FR-01 | Select AOI | P0 | Validated AOI appears on map |
| FR-02 | Select date range | P0 | All views use same range |
| FR-03 | Show activity calendar | P0 | Each cell has defined metric/time bin |
| FR-04 | Inspect sensor composition | P0 | MODIS and VIIRS remain separate |
| FR-05 | Inspect selected bin | P0 | Detail shows provenance |
| FR-06 | Explain method/limits | P0 | Accessible from analysis view |
| FR-07 | Show data status | P0 | NRT/standard and retrieval time visible |
| FR-08 | Compare historical periods | P1 | Like-for-like bins |
| FR-09 | Show unusual activity | P1 | Documented baseline and caveat |
| FR-10 | Export aggregates | P1 | CSV includes definitions/provenance |

## Non-functional
Responsive; bounded API payloads; backend aggregation; UTC internally; idempotent ingestion; deterministic scientific transforms; no secrets committed; explicit loading/error/demo states.

## Demo narrative
Show global view → select Indonesia AOI → inspect multi-year calendar → drill into a peak bin → compare MODIS and VIIRS contributions → explain why raw counts differ → switch to a second global region → explain method and limitations.

## Open questions
- Exact resources and eligibility rules in challenge Resources tab?
- Which AOI interaction is feasible?
- Daily, weekly, or monthly calendar for MVP?
- What combined metric, if any, is scientifically defensible?
- Is a historical baseline feasible with available time/data?
