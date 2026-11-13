# Harmonization Methodology

## 1. Definition

Harmonization makes MODIS and VIIRS observations more interpretable together while accounting for sensor, platform, geometry, timing, and processing differences. It does not make the instruments identical or prove equal detection probability.

Distinguish:
- `M0_RAW`: source observations.
- `M1_AGGREGATED`: common AOI/time bins, still sensor-specific.
- `M2_COMPARATIVE`: side-by-side comparison without correction.
- `M3_HARMONIZED`: validated cross-sensor correction/model.

The MVP should deliver M1/M2 reliably. M3 is optional and must not be claimed without validation.

## 2. Why direct pooling is unsafe

MODIS and VIIRS differ in nominal spatial sampling, pixel footprint geometry, overpass times, detection algorithms, sensitivity, and confidence semantics. VIIRS 375 m can detect smaller/cooler fires than MODIS 1 km in many circumstances, but differences depend on biome, fire size/intensity, viewing angle, cloud, and timing.

Peer-reviewed comparisons show:
- MODIS and VIIRS FRP retrievals vary with view zenith angle and sensor geometry (Li et al., 2018).
- MODIS omission relative to VIIRS differs between forests and low-biomass lands in the Northeast Asia study area (Fu et al., 2020). Those study-specific percentages must not be generalized globally.
- VIIRS 375 m products have platform- and collection-specific details; use the Collection 2 guide.

## 3. MVP baseline: common aggregation, separate sensors

1. Preserve raw records and provenance.
2. Convert acquisition time to UTC.
3. Apply identical AOI and time-bin definitions.
4. Aggregate MODIS and VIIRS separately.
5. Show sensor/platform composition.
6. If showing a pooled count, call it `pooled_observation_count`, not a normalized fire-activity metric.
7. Explain that counts are detections, not unique incidents or burned area.

A common AOI/time bin improves comparability of the query but does not calibrate sensor sensitivity.

## 4. Spatial handling

Start with AOI-level summaries. If spatial cells are needed, choose a justified equal-area grid or spatial index. Document:
- CRS and grid system;
- cell resolution and rationale;
- point-to-cell assignment;
- AOI edge behavior;
- area normalization;
- treatment of pixel footprint and scan geometry.

Do not compare counts per degree-squared cell globally. Do not assume point coordinates represent the full active-fire pixel footprint.

## 5. Temporal handling

- Daily bins for recent activity.
- Monthly bins for long historical calendar patterns.
- Weekly bins only if useful and explained.
- Store UTC internally.
- If rendering local calendar dates, explicitly define AOI timezone and bin boundary.

MODIS Terra/Aqua and VIIRS platforms have different overpass schedules. Daily aggregation hides some of this temporal detail; preserve acquisition timestamps for drill-down and advanced comparison.

## 6. Platform continuity and sensor-era transitions

FIRMS archive coverage checked 2026-11-13 lists VIIRS S-NPP through 2026-11-02, while NOAA-20 and NOAA-21 are listed through present. Treat this as a live source snapshot.

Rules:
- Retain historical S-NPP observations.
- Do not assume S-NPP currently contributes new observations beyond its listed end date.
- Do not infer a decline in fire activity from a platform's missing data.
- Expose platform availability and last observation date.
- For historical trend/anomaly work, stratify or annotate sensor/platform composition and transitions.
- Avoid comparing periods with materially different sensor availability as if observation opportunity were identical.

## 7. Processing status and NRT-to-Standard replacement

FIRMS archive notes NRT records are replaced by Standard science-quality records at approximately a 5-month lag. The same physical observations may therefore appear in different processing states over time.

Rules:
- Store native `version` and derived `processing_status`.
- Do not count NRT and Standard versions of the same source observation twice.
- Use NRT for low-latency monitoring.
- Prefer Standard for retrospective analysis when available.
- Record when an aggregate was computed and which processing state it used.
- If a period transitions from NRT to Standard, recompute affected historical aggregates idempotently.

## 8. Confidence

Keep `confidence_native` and `confidence_scheme`. MODIS numeric confidence (0–100) is not automatically equivalent to VIIRS categorical confidence. Use sensor-specific filters or show native distributions. A shared confidence score requires documented calibration and validation.

## 9. FRP

FRP is pixel-integrated Fire Radiative Power in MW. It is not burned area, perimeter, or direct total fire size.

For every FRP statistic:
- state statistic (sum, mean, median, percentile);
- report valid-record count;
- preserve sensor/platform;
- document filters and processing version;
- do not apply a single conversion factor across sensors without validation.

## 10. Observation opportunity and zero-detection bins

Clouds, overpass timing, viewing geometry, sensor outages, and detection limits affect observations. No detection is not proof of no fire.

If a reliable coverage/opportunity metric is unavailable:
- show “no detections in available records” rather than “no fire”;
- show source/platform availability;
- flag known data gaps;
- do not fabricate coverage percentages.

## 11. Historical baseline and unusual activity

Candidate robust score:
`robust_z = (x - median_baseline) / (1.4826 * MAD_baseline)`

Requirements:
- compare same AOI, season/month, bin definition, and metric;
- define baseline years and minimum observations;
- handle MAD = 0;
- flag incomplete periods;
- control for platform/sensor composition and processing status;
- label output “unusual relative to this baseline,” not “fire prediction.”

A seasonal median/percentile may be more explainable and robust than a complex model under hackathon constraints.

## 12. Validation

- Unit-test parsing, UTC conversion, bin boundaries, AOI filtering, FRP summaries, and baseline calculations.
- Verify aggregates with hand-calculated fixtures.
- For cross-sensor pairs, require defensible spatial and temporal co-location; do not match solely by nearest point.
- Li et al. used matched granules with tight temporal/spatial overlap in its FRP comparison; their setup is not a universal deduplication rule.
- Report agreement and disagreement separately.
- Do not call agreement between two sensors “truth validation.”
- Burned-area products measure a different phenomenon and can only provide contextual/independent validation with a clearly described protocol.
