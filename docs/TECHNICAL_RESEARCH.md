# Deep Technical Research — MODIS & VIIRS Active-Fire Harmonization

**Project:** FireScope (working title)  
**Challenge:** NASA Space Apps 2026 — Harmonization of MODIS and VIIRS Hot Spots  
**Research snapshot:** 2026-11-13  
**Status:** Technical research and proposed design; not an implementation specification until team review.

---

## Executive summary

FireScope should not attempt to make MODIS and VIIRS hotspot records look identical by applying a single scale factor to point counts or FRP. The sensors differ in spatial sampling, pixel footprint, viewing geometry, overpass time, thermal sensitivity, detection algorithms, confidence semantics, and processing history. Peer-reviewed work shows that MODIS–VIIRS FRP relationships change with spatial scale and ecosystem. A 2026 peer-reviewed study introduces an observation-operator framework for pixel and grid FRP, including detection limits, cloud cover, pixel area, and overpass-time effects.

**Recommended scientific strategy:**

1. **MVP:** preserve raw observations, standardize schema/time, aggregate to common AOI/time bins, and present sensor/platform-specific counts and FRP separately. This is M1 aggregation/M2 comparison, not full calibration.
2. **Advanced harmonization:** implement a transparent FRP observation-operator module based on Sofiev & Kouznetsov (2026), if its exact equations, coefficients, input requirements, license, and implementation are reviewed.
3. **Historical calendar:** use daily/monthly observation summaries with clear source-availability metadata. Do not interpret missing detections as zero fire.
4. **Anomaly analysis:** compare like-for-like seasonal bins using robust baselines, while stratifying or adjusting for platform/sensor availability and processing version.
5. **Validation:** compare sensors only in defensible spatiotemporal overlap windows; use independent burned-area or high-resolution reference data as complementary evidence, not as interchangeable labels.

The central product metric should initially be **active-fire observation activity**, not “true fire count” or “burned area”.

---

# 1. Scientific framing: what does an active-fire record represent?

An active-fire product is a satellite-derived thermal-anomaly detection. A record generally represents a detected fire-affected pixel/footprint at an acquisition time, with attributes such as location, brightness temperature, confidence, and sometimes Fire Radiative Power (FRP).

It is not automatically:
- one unique fire incident;
- a fire perimeter;
- a measurement of burned area;
- a continuous observation of the fire between satellite overpasses;
- proof that no fire exists when no detection is recorded.

A large fire can generate many detected pixels and repeated observations across overpasses. A small fire can be missed due to spatial dilution, cloud/smoke obscuration, timing, background conditions, and algorithm thresholds.

**Naming rule for the UI:** prefer “detections”, “hotspot observations”, “FRP observations”, or “observed activity”. Use “fire event” only when a separate event-clustering method has actually reconstructed events and its uncertainty is explained.

# 2. Sensor and product characteristics

## 2.1 MODIS

MODIS active-fire products are derived from the Terra and Aqua instruments. The Collection 6 / 6.1 algorithm uses contextual thermal anomaly tests and produces active-fire detections and FRP. The Collection 6 algorithm addressed known Collection 5 limitations, including false alarms associated with small forest clearings and omissions of large fires obscured by thick smoke. The algorithm also expanded processing over oceans and large water bodies for offshore gas-flaring monitoring.

Key implications:
- Terra/Aqua provide a long historical record.
- Nominal active-fire footprint is commonly described as approximately 1 km at nadir, but actual scan/track footprint grows toward scan edge.
- FIRMS point coordinates represent pixel center, not exact flame position.
- MODIS confidence in FIRMS CSV is numeric 0–100; it is derived from intermediate algorithm quantities and grouped into low/nominal/high classes.
- `version` contains collection and processing-source information such as URT, RT, NRT, or Standard.
- FRP is pixel-integrated radiative power in MW.
- Standard MODIS monthly fire-location products can include `type` (vegetation fire, volcano, other static land source, offshore); do not assume this field is present in every NRT CSV.

Primary guide:
https://www.earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf

Primary algorithm paper:
Giglio, L., Schroeder, W., & Justice, C. O. (2016). The Collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment, 178, 31–41. https://doi.org/10.1016/j.rse.2016.02.054

## 2.2 VIIRS 375 m

The VIIRS 375 m product is a hybrid algorithm:
- I-bands (375 m) primarily drive fire detection.
- The 750 m M13 channel is used in sub-pixel FRP retrieval, because I4 can saturate frequently.
- The algorithm uses cloud/water classification, fixed threshold tests, contextual tests, secondary tests, special handling for the South Atlantic Magnetic Anomaly, and persistence tests for some water detections.
- The product was designed to improve response to smaller fires and mapping coherence relative to coarser products.

Key implications:
- Nominal 375 m does not mean every pixel has exactly 375 m ground dimensions at every scan location.
- `scan` and `track` describe actual pixel dimensions.
- VIIRS Collection 2 should be treated as the current product reference for S-NPP, NOAA-20, and NOAA-21.
- VIIRS confidence is categorical in common FIRMS/VIIRS products: low, nominal, high. Collection/product encodings must be checked in the specific guide and source.
- Low-confidence daytime pixels can be associated with sun glint and weaker I4 temperature anomalies. High-confidence pixels are associated with saturated observations in the described product scheme.
- Do not assume a category is a calibrated probability such as 0.2, 0.5, or 0.9.

Primary references:
- VIIRS 375 m ATBD: https://viirsland.gsfc.nasa.gov/PDF/VIIRS_activefire_375m_ATBD.pdf
- VIIRS Collection 2 375 m User Guide v1.2: https://earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf
- Schroeder et al. (2014): https://doi.org/10.1016/j.rse.2013.12.008

## 2.3 Cross-sensor comparison: why nominal resolution is not enough

The 2018 Li et al. study reports:
- VIIRS characterization capability is relatively consistent across the swath, while MODIS varies strongly with view zenith angle.
- MODIS fire count declined by 67% while mean FRP per detection increased by 300% from nadir to 60° view zenith angle in the studied daytime comparison.
- Cluster FRP relationships vary by ecosystem.
- At global 1° × 1° grid scale, average FRP difference in fire-prone regions was about 20%, but this is not a universal conversion coefficient.
- Large boreal fire clusters showed VIIRS FRP about 47% smaller than MODIS in the study.
- At cluster scale, results differed between cropland, savanna, broadleaf forest, tropical rainforest, and boreal forest.

Reference:
Li et al. (2018), https://doi.org/10.1029/2017JD027823

**Design consequence:** any regression/correction must be stratified or at least tested by spatial scale, ecosystem/biome, day/night, view geometry, and FRP range. A global constant multiplier is scientifically unjustified.

---

# 3. Active-fire detection algorithm mechanics

## 3.1 MODIS contextual detection (conceptual)

The MODIS contextual algorithm uses thermal channels to identify candidate fire pixels and compare them with a local background. It applies absolute and contextual tests, with masks and quality logic for clouds, water, and other conditions. It derives a confidence estimate and FRP.

For FireScope, the practical rule is not to reimplement the NASA detection algorithm from FIRMS point files. FIRMS records are already algorithm outputs. Reimplementing requires Level-1 radiances, geolocation, masks, calibration, and algorithm-specific inputs.

Use the published product's native fields and quality information rather than pretending a point CSV contains enough information to reproduce the Level-2 algorithm.

## 3.2 VIIRS 375 m detection (conceptual)

The ATBD describes:
1. Cloud and water pixel classification.
2. Fixed threshold tests.
3. Potential background-fire handling.
4. Bright reflective target rejection.
5. Candidate fire pixel identification.
6. Contextual detection tests.
7. Secondary tests.
8. Nighttime South Atlantic Magnetic Anomaly filtering.
9. Persistence testing for some water detections.
10. FRP retrieval.

The VIIRS product is not simply “MODIS at higher resolution”; it uses different channel inputs, detection logic, quality controls, and FRP retrieval design.

## 3.3 Why FireScope should not recreate detection

The challenge is to harmonize active-fire records, not create a new thermal detection algorithm. Rebuilding detection would:
- require raw swath radiances and calibration;
- greatly expand engineering and validation scope;
- risk diverging from NASA's tested algorithm;
- be infeasible for a short hackathon.

FireScope should focus on harmonization, aggregation, transparency, and interpretation.

---

# 4. Data normalization and canonical representation

## 4.1 Preserve native values

Create canonical field names while retaining original columns in `raw_attributes`.

Mandatory provenance:
- source product / endpoint;
- sensor;
- platform;
- instrument;
- collection;
- native `version`;
- processing status (derived from documented version);
- acquisition date/time;
- source retrieval time;
- source file checksum;
- native confidence and its scheme.

Never overwrite `confidence_native` with a normalized score.

## 4.2 Time handling

- FIRMS `acq_date` + `acq_time` represents acquisition/overpass time in UTC.
- Parse time carefully; many CSV sources encode `acq_time` as HHMM, sometimes with leading zeros.
- Store full `acq_datetime_utc`.
- Store raw date/time fields too.
- Do not convert to local timezone before aggregation.
- If displaying local calendar dates, use AOI timezone and clearly define bin boundaries.

## 4.3 Footprint handling

`latitude`/`longitude` are point coordinates associated with the detected pixel, not a fire perimeter or exact ignition point. `scan` and `track` reflect actual footprint dimensions and should be preserved.

MVP can use points for map display and AOI membership. Advanced spatial normalization should consider footprint size and scan geometry, but must not fabricate exact pixel polygons from incomplete CSV metadata.

## 4.4 Confidence handling

MODIS numeric confidence and VIIRS categorical confidence are not directly equivalent. Avoid mappings such as:
- MODIS 80 = VIIRS high;
- VIIRS high = 90%;
- low/nominal/high = fixed detection probabilities.

MVP options:
- show native confidence distributions per sensor;
- offer sensor-specific filters;
- provide a default filter documented separately per sensor;
- keep an “all valid detections” view and allow users to inspect confidence.

If a common confidence model is desired later, it requires reference labels and calibration/validation data.

## 4.5 Processing state and NRT/Standard lifecycle

FIRMS `version` distinguishes processing sources. NRT archive data are replaced by Standard science-quality records after a latency period. This creates a data lifecycle issue:
- NRT is for current monitoring.
- Standard is preferred for retrospective science.
- The same observed fire pixel may appear in different processing states over time.
- A naïve append-only ingestion can double count the observation.

Recommended data identity:
`source_observation_key = product + platform + acquisition_time + source granule/row identity where available`.

If a stable source observation identifier is unavailable in the CSV, create a deterministic surrogate from platform, sensor, time, coordinates at source precision, and selected native attributes. Keep both source row hash and raw row; do not use proximity alone as a duplicate key.

Recommended update strategy:
- maintain NRT and Standard as separate source snapshots;
- when Standard becomes available, supersede the corresponding NRT snapshot for historical analysis;
- retain NRT snapshot provenance for audit;
- never sum NRT and Standard copies as separate observations.

---

# 5. Harmonization architecture: levels and algorithms

## 5.1 Level 0 — raw observations

Store exact NASA source files unchanged. Include retrieval time, URL/source, checksum, collection, and status.

No harmonization occurs at this level.

## 5.2 Level 1 — common AOI/time aggregation (MVP foundation)

For AOI \(A\), time bin \(t\), sensor \(s\), and platform \(p\), define:

\[
N_{s,p}(A,t)=\sum_i \mathbf{1}(x_i \in A,\; \tau_i \in t,\; s_i=s,\; p_i=p)
\]

where:
- \(x_i\) is the observation coordinate;
- \(\tau_i\) is UTC acquisition time;
- \(s_i\) and \(p_i\) are sensor/platform.

This produces comparable query bins, but does not correct unequal sensor sensitivity or observation opportunity.

Display:
- MODIS count;
- VIIRS count by platform and optionally VIIRS total;
- pooled record count only if clearly labeled as pooled observations;
- source/platform coverage state.

Do not label \(N_{MODIS}+N_{VIIRS}\) as unique fires or calibrated fire activity.

## 5.3 Level 2 — common spatial grid and temporal comparison

If map-level comparison is needed:
- select a documented equal-area grid or stable global index;
- use one cell size for the comparative view;
- calculate sensor/platform-specific metrics per cell and time bin;
- show both sensor series, not only a merged layer;
- perform sensitivity tests at more than one grid resolution.

Potential candidate resolutions for experimentation (not fixed requirements): 5 km, 10 km, 25 km, and 0.25°. Compare stability and usability. Do not choose a resolution solely for visual convenience.

For spatial count density:
\[
D_{s}(g,t)=N_s(g,t)/Area(g)
\]
Only if `Area(g)` is a defensible ground area and grid cells are equal-area or correctly area-weighted.

## 5.4 Level 3 — FRP comparison and observation operator (advanced)

### Why FRP is useful
FRP characterizes radiative power at the time of satellite observation and is more physically informative about fire intensity than a raw pixel count. It is still an instantaneous observation, not total energy released over the whole event and not burned area.

### Why raw FRP sums are not automatically comparable
- pixel footprints differ;
- sensitivity thresholds differ;
- MODIS FRP is more view-angle-sensitive;
- day/night conditions differ;
- cloud and smoke attenuate signals;
- overpass times differ;
- FRP retrieval channels and algorithms differ.

### Sofiev & Kouznetsov (2026): observation-operator concept

The paper develops:
- pixel-level FRP detection-limit operator;
- gridded FRP observation operator;
- dependence on pixel area and day/night/sensor-specific fitted coefficients;
- grid-level factors including largest-fire-pixel fraction and cloud cover;
- overpass-time and weather-aware probability-of-detection estimates.

Reported smallest-footprint, clear-sky, nadir-like detection limits:
- MODIS C6.1: 5.7 MW daytime and 3.7 MW nighttime.
- VIIRS C2: 3.7 MW daytime and 0.7 MW nighttime.
These are not universal global thresholds. Detection limits vary with pixel area, scan position, day/night, cloud, and other conditions.

The paper's global detection probability estimates for powerful fires were 78% MODIS and 88% VIIRS on average, with substantially lower regional values in some equatorial regions. These are paper-specific model results, not guaranteed product-wide constants or values FireScope should hardcode.

Paper:
https://doi.org/10.5194/gmd-19-10123-2026

Code:
https://github.com/fmidev/FRP_OOp

Zenodo:
https://doi.org/10.5281/zenodo.18339604

### Implementation recommendation

Do not retype equations from a search snippet. Before implementing:
1. Read the final paper equations and supplementary tables.
2. Inspect repository source and license.
3. Identify required inputs (pixel area, FRP, day/night, cloud, grid-cell composition, overpass time, weather).
4. Confirm whether FIRMS CSV contains enough inputs. It may not contain all required pixel-level/quality/geometry data.
5. Decide whether the operator can be applied to the available data without inventing missing inputs.
6. Port or wrap the original code with attribution and tests.
7. Compare outputs against paper examples or reference data.

If required inputs are unavailable, show the operator as a research extension and keep MVP at M1/M2.

## 5.5 Level 4 — probability-adjusted activity (research only)

A theoretical adjusted estimate might use:
\[
\widehat{F}_{s,g,t} = \frac{Y_{s,g,t}}{p_{s,g,t}}
\]
where \(Y\) is observed count or FRP and \(p\) is probability of detection.

This is only valid if \(p\) corresponds to the same event/metric definition and is estimated for the correct sensor, pixel geometry, time, weather, and region. It can become unstable when \(p\) is small and can amplify noise. It should not be implemented as a generic “divide by detection probability” correction without a statistical model and uncertainty interval.

For FireScope MVP, do not use this as a production metric.

---

# 6. Duplicate detections and fire-event reconstruction

## 6.1 Different duplicate types

- Exact duplicate row caused by repeated ingestion.
- Same observation copied across NRT and Standard processing.
- Adjacent scan/bow-tie overlap.
- Adjacent orbit overlap.
- Repeated detections of a continuing fire on later overpasses.
- Distinct nearby fires within the same AOI.

These are not the same problem and must not share one blanket deduplication rule.

## 6.2 Recommended policy

1. Remove exact repeated ingestion using file checksum and source row identity/hash.
2. Resolve NRT/Standard supersession by processing lifecycle.
3. Apply product-documented scan/bow-tie handling only when the required flags/metadata exist.
4. Do not collapse observations from different overpasses merely because they are close.
5. If event clustering is implemented, label it as inferred event reconstruction and preserve raw observations.

Li et al. (2018) found adjacent-orbit duplicate effects relatively limited in their study, but they explicitly preprocessed bow-tie and repeat detections. Their percentages and matching design are not universal filters.

## 6.3 Optional event clustering

A possible research approach:
- spatial index (H3 or projected grid);
- temporal neighborhood;
- distance threshold informed by footprint and fire dynamics;
- separate parameters by biome or fire type;
- DBSCAN or spatiotemporal connected components.

Risks:
- two distinct fires may merge;
- one fire may split;
- repeated satellite overpasses may be interpreted as new events;
- arbitrary thresholds can dominate output.

Recommendation: do not make event clustering part of MVP unless the challenge evaluation clearly rewards unique-event estimates.

---

# 7. Burning-activity calendar design

## 7.1 What should each calendar cell mean?

A calendar cell should have a single unambiguous metric and time interval. Recommended initial modes:

**Mode A — Detection observations**
- number of source records in the AOI/time bin;
- separate MODIS and VIIRS values;
- not unique fires.

**Mode B — FRP observed**
- sum or median FRP in MW;
- include valid FRP record count;
- keep sensors separate unless a validated operator is applied.

**Mode C — Data availability**
- which sensors/platforms supplied observations;
- processing status;
- known source gaps.
- Do not imply this is observation completeness unless true observation opportunity is measured.

Suggested default:
- daily calendar for recent activity;
- monthly calendar for multi-year historical patterns;
- year/month selector and sensor filter;
- click cell to open sensor breakdown, records, FRP, and provenance.

## 7.2 Zero, missing, and unavailable are different

Represent at least:
- `OBSERVED_ZERO`: source and observation opportunity are sufficiently established, no detections found;
- `NO_DETECTIONS_IN_AVAILABLE_RECORDS`: records exist but completeness/opportunity is not fully known;
- `NO_SOURCE_DATA`: no source records available for that platform/time;
- `PLATFORM_UNAVAILABLE`: platform not delivering data or archive gap;
- `PROCESSING_PENDING`: NRT/Standard transition or data not yet finalized.

Do not fill missing bins with zero.

## 7.3 Seasonal baseline

For month-of-year \(m\), AOI/grid \(g\), sensor/platform composition \(c\), and year \(y\), baseline should compare like-for-like observations.

A robust anomaly score candidate:
\[
z^*_{g,m,y} = \frac{x_{g,m,y} - \operatorname{median}(B_{g,m})}
{1.4826\operatorname{MAD}(B_{g,m})}
\]

Where \(B_{g,m}\) is a selected baseline set for the same month (or seasonal window).

Requirements:
- at least a declared minimum number of valid baseline years;
- robust handling when MAD = 0;
- exclude incomplete months or flag them;
- stratify by sensor or use a validated harmonized metric;
- annotate platform/sensor era changes;
- do not mix NRT and Standard versions;
- use same temporal bins and AOI geometry;
- do not call anomaly “risk” or “prediction”.

If sample size is too small, show percentile rank or descriptive comparison instead of z-score.

## 7.4 Sensor era problem

MODIS starts earlier than VIIRS; S-NPP starts in 2012; NOAA-20/21 start later. Historical sensor composition changes over time. A long trend can show an artificial step when new sensors begin or stop delivering.

Recommended:
- show platform composition over time;
- provide a “MODIS-only history” view for long baseline;
- provide a “VIIRS-era comparison” view for overlapping years;
- compare sensor-specific series before merged display;
- make any combined long-term index explicitly model-based.

---

# 8. Missingness, clouds, and observation opportunity

A fire detection is conditional on the satellite observing the area, the pixel being usable, the fire signal exceeding the algorithm's detection threshold, and the retrieval passing quality tests.

A robust analytical model distinguishes:
- no satellite overpass;
- outside swath;
- cloud-obscured pixel;
- invalid/low-quality pixel;
- clear usable observation with no fire detection;
- fire detection;
- data unavailable due to service or platform outage.

FIRMS point CSV files alone may not expose all these states. If FireScope ingests only hotspot point CSVs, it generally cannot compute true observation completeness from those records alone.

Possible advanced input:
- Level-2 swath/QA masks;
- gridded active-fire products with explicit missing/cloud states;
- cloud/observation coverage from matching satellite products;
- overpass/geometry data.

Do not fabricate an “observation coverage percentage” from hotspot counts.

---

# 9. Validation and evaluation plan

## 9.1 Unit-level correctness
- source parser;
- UTC time parser;
- coordinate/AOI inclusion;
- temporal binning;
- sensor/platform grouping;
- NRT/Standard supersession;
- FRP valid count and summary;
- robust baseline and missing-data handling.

## 9.2 Cross-sensor comparison
Use contemporaneous observations only when temporal and spatial overlap is defensible. A simple nearest-neighbor match can create false pairs in dense fire regions.

Recommended diagnostics:
- paired FRP scatter plot;
- ratio/difference distribution;
- bias and RMSE for valid pairs;
- agreement by ecosystem, day/night, and view geometry where available;
- matched and unmatched counts;
- sensitivity to spatial/temporal match thresholds.

Do not use Pearson correlation alone: high correlation can coexist with systematic bias.

## 9.3 Independent validation
Possible evidence:
- high-resolution reference imagery/ASTer-based validation studies;
- burned-area products (e.g., MODIS MCD64A1) as post-event context;
- official incident perimeters where available and appropriate;
- ground reports, if credible and geographically/time matched.

Burned-area products do not measure the same thing as active-fire detections. Validate event/area relationships with explicit temporal windows and omission/commission definitions.

## 9.4 MVP success criteria
- The same AOI/time query yields reproducible sensor-specific aggregates.
- The calendar distinguishes zero detections from missing data.
- Users can inspect source platform and processing version.
- FRP summaries report valid counts and units.
- Historical anomaly output is baseline-relative and not predictive.
- A second region outside Indonesia works without hardcoded assumptions.

---

# 10. Proposed algorithm roadmap

## MVP (recommended)
1. Ingest FIRMS MODIS C6.1 and VIIRS C2 records.
2. Preserve raw files and metadata.
3. Parse into canonical records.
4. Handle processing lifecycle and platform status.
5. Query AOI.
6. Aggregate daily/monthly by sensor/platform.
7. Show calendar, chart, and detail drilldown.
8. Add seasonal baseline only if sufficient consistent history exists.

**Output label:** “Observed active-fire detections” / “Observed FRP”.

## MVP+ (if time allows)
- Fixed equal-area grid comparison.
- Sensor/platform composition visualization.
- robust seasonal percentile or MAD-based anomaly on sensor-specific series.
- simple sensitivity comparison for alternative grid/time resolutions.

## Advanced research
- Integrate FRP observation operator from Sofiev & Kouznetsov (2026).
- Add observation opportunity and cloud-aware detection probability.
- Calibrate cross-sensor FRP by ecosystem/scale/day-night using matched samples.
- Event clustering with explicit uncertainty.
- Independent validation against burned-area and reference perimeters.

---

# 11. Concrete technical design proposal

## 11.1 Data model

Tables/datasets:
- `raw_files`: source URL, product, platform, collection, processing state, retrieval time, checksum.
- `observations`: canonical records with native attributes.
- `platform_status`: latest known availability and last observation date.
- `aggregates`: AOI/grid/time-bin/sensor/platform/method outputs.
- `methods`: method ID, version, parameters, code commit, documentation URL.
- `aoi`: user-selected geometries and metadata (if persistence is needed).

## 11.2 Processing pipeline

```text
Acquire
  -> checksum + raw archive
  -> detect schema/product/version
  -> parse UTC + canonicalize
  -> validate coordinates/values
  -> deduplicate exact ingestion copies
  -> resolve NRT/Standard supersession
  -> sensor/platform-specific QA
  -> AOI/time aggregation
  -> optional FRP operator
  -> persist aggregates + method provenance
  -> API
```

## 11.3 Suggested modules

Backend:
- `ingestion/firms_client.py`
- `ingestion/download_manifest.py`
- `ingestion/parsers/modis.py`
- `ingestion/parsers/viirs.py`
- `schemas/observation.py`
- `services/version_lifecycle.py`
- `services/platform_status.py`
- `analytics/aoi_filter.py`
- `analytics/time_binning.py`
- `analytics/aggregation.py`
- `analytics/frp_summary.py`
- `analytics/anomaly.py`
- `analytics/observation_operator.py` (advanced/optional)
- `api/routes/calendar.py`
- `api/routes/observations.py`
- `api/routes/status.py`

## 11.4 Method metadata

Every aggregate must include:
- `method_id`;
- `method_version`;
- `parameters_json`;
- `source_products`;
- `source_retrieved_at`;
- `platform_composition`;
- `processing_status_composition`;
- `code_commit`.

This makes a chart auditable and reproducible.

---

# 12. Critical risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| Pooling raw counts | False sensor equivalence | Show separate sensor/platform series |
| Platform start/stop | Artificial historical trend | Platform registry and sensor-era annotations |
| NRT + Standard double count | Inflated counts | Supersession lifecycle |
| Confidence mapping by intuition | Misleading quality score | Preserve native confidence |
| Clouds/missing treated as zero | False low-activity signal | Explicit missingness states |
| FRP summed across sensors | Biased intensity metric | Separate FRP or validated operator |
| Arbitrary dedup distance | Merge separate fires | Source identity first; event clustering optional |
| Overly complex operator | MVP failure | M1/M2 first, operator as extension |
| API rate limits | Ingestion failure | Batch, cache, backoff, bounded windows |
| UI overstates inference | Misleading users | Clear labels and methodology panel |

---

# 13. Priority reading list

## Must-read
1. MODIS C6/C6.1 Active Fire Product User Guide (May 2021):  
   https://www.earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf
2. VIIRS 375 m Active Fire ATBD (Dec 2016):  
   https://viirsland.gsfc.nasa.gov/PDF/VIIRS_activefire_375m_ATBD.pdf
3. VIIRS Collection 2 375 m User Guide v1.2 (2025):  
   https://earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf
4. Giglio et al. (2016), MODIS C6 algorithm:  
   https://doi.org/10.1016/j.rse.2016.02.054
5. Schroeder et al. (2014), VIIRS 375 m algorithm:  
   https://doi.org/10.1016/j.rse.2013.12.008
6. Li et al. (2018), MODIS–VIIRS FRP comparison:  
   https://doi.org/10.1029/2017JD027823
7. Sofiev & Kouznetsov (2026), FRP observation operator:  
   https://doi.org/10.5194/gmd-19-10123-2026
8. Sofiev & Kouznetsov code and coefficients:  
   https://github.com/fmidev/FRP_OOp

## Supporting
- FIRMS MODIS attributes: https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html
- VIIRS Land SIPS product page: https://viirsland.gsfc.nasa.gov/Products/NASA/FireESDR.html
- FIRMS API: https://firms.modaps.eosdis.nasa.gov/api/area
- FIRMS tutorials: https://firms.modaps.eosdis.nasa.gov/tutorials/

---

# 14. Decisions recommended for the team

1. **Adopt M1/M2 as the guaranteed MVP.** This avoids pretending simple aggregation is full physical harmonization.
2. **Make the calendar AOI-first.** User chooses region and period; calendar is the main output.
3. **Show MODIS and VIIRS separately by default.** Combined view is opt-in and labeled as pooled observations unless calibrated.
4. **Use MODIS for long historical context and VIIRS for finer recent detail.** Do not imply identical continuity.
5. **Keep S-NPP historical records even if current archive delivery is absent.**
6. **Treat NRT and Standard as processing states, not independent observation streams.**
7. **Make platform and source availability visible.**
8. **Defer full probability-adjusted fire activity until required inputs and validation are available.**
9. **Review FRP_OOp repository and license before reuse.**
10. **Never call the calendar “burned area” or “unique fire count” unless those quantities are actually estimated by a separate validated method.**

---

# 15. Bibliography and sources

- Giglio, L., Schroeder, W., & Justice, C. O. (2016). The Collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment*, 178, 31–41. https://doi.org/10.1016/j.rse.2016.02.054
- Schroeder, W., Oliva, P., Giglio, L., & Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment. *Remote Sensing of Environment*, 143, 85–96. https://doi.org/10.1016/j.rse.2013.12.008
- Li, F., Zhang, X., Kondragunta, S., & Csiszar, I. (2018). Comparison of Fire Radiative Power Estimates From VIIRS and MODIS Observations. *Journal of Geophysical Research: Atmospheres*, 123, 4545–4563. https://doi.org/10.1029/2017JD027823
- Sofiev, M., & Kouznetsov, R. (2026). Observation operator and detection limits for MODIS and VIIRS Fire Radiative Power products. *Geoscientific Model Development*, 19, 10123–10142. https://doi.org/10.5194/gmd-19-10123-2026
- NASA MODIS C6/C6.1 Active Fire Product User Guide, Version 1.0, May 2021.
- NASA VIIRS 375 m Active Fire Detection and Characterization ATBD, Version 1.0, December 2016.
- NASA VIIRS Collection 2 375 m Active Fire Product User Guide, Version 1.2, 2025.
