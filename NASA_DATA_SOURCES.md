# NASA Data Sources & Verified Research Register

**Last checked:** 2026-11-13  
**Project:** FireScope (working title)  
**Challenge:** NASA Space Apps 2026 — Harmonization of MODIS and VIIRS Hot Spots

> Verification policy: operational coverage and service limits can change. Re-check the live NASA pages before ingestion, demo, and submission. Search-engine indexed challenge text confirms the challenge objective, but the client-rendered Resources tab could not be independently enumerated here. Do not claim that the table below is the complete official Resources-tab list.

## 1. Official challenge

- Challenge page: https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/
- Resources tab: https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=resources

The challenge statement asks for a web application that harmonizes active-fire hotspot records into a burning-activity calendar for a selected area of interest. Intended users include early-warning and emergency responders, scientists, and land managers examining historical patterns, unusual conditions, and critical periods.

**Product consequence:** AOI selection and the burning-activity calendar are core requirements. A map-only dashboard does not fully address the challenge.

## 2. Verified official data-source inventory

| Resource | Provider | Link | Role in FireScope | Access | Verified notes |
|---|---|---|---|---|---|
| Challenge statement | NASA Space Apps | https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/ | Official problem statement | Public | Calls for an AOI-based burning-activity calendar from harmonized active-fire hotspots. |
| Challenge Resources tab | NASA Space Apps | https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=resources | Official resource list | Public, client-rendered | Must be checked in browser by team. Its complete client-rendered link list is not verified in this register. |
| Earthdata FIRMS overview | NASA ESDIS / LANCE | https://www.earthdata.nasa.gov/data/tools/firms | FIRMS overview, source status, acknowledgement | Public | FIRMS distributes NRT active-fire data. Global availability is generally within about 3 hours of satellite observation. |
| FIRMS portal | NASA LANCE / FIRMS | https://firms.modaps.eosdis.nasa.gov/ | Map, downloads, services | Public; service credentials vary | Primary discovery and access portal. |
| FIRMS Active Fire Data | NASA LANCE / FIRMS | https://firms.modaps.eosdis.nasa.gov/content/active_fire/ | Recent low-latency data | Public for many recent downloads; some services require MAP_KEY or registration | Recent 24h/48h/7-day downloads and map services. Check currently listed sensors/products before each run. |
| FIRMS Archive Download | NASA LANCE / FIRMS | https://firms.modaps.eosdis.nasa.gov/download/ | Historical baseline | Earthdata Login or email-code flow | Historical data older than 7 days; CSV, SHP, JSON. NRT is replaced by standard science-quality data at approximately 5-month lag. |
| FIRMS Area API | NASA LANCE / FIRMS | https://firms.modaps.eosdis.nasa.gov/api/area | AOI/bounding-box ingestion | Free MAP_KEY | Supports bbox or `world`, date and day-range queries; 1–5 days per request; 5,000 transactions per 10-minute interval. |
| FIRMS API use tutorial | NASA FIRMS Data Academy | https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html | API implementation examples | Public; MAP_KEY required for service | Explains transaction accounting; global VIIRS query can return tens of thousands of rows/day. |
| MODIS FIRMS attribute description | NASA FIRMS | https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html | MODIS schema and semantics | Public | Documents acquisition time in UTC, confidence, version, scan/track, FRP, and detection type. |
| VIIRS 375 m Collection 2 User Guide v1.2 | NASA Earthdata / Land SIPS | https://earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf | Authoritative VIIRS C2 product schema and algorithm | Public PDF | Preferred current guide for 375 m Collection 2; covers S-NPP, NOAA-20, NOAA-21 product family. |
| Earlier VIIRS 375/750 m User Guide v1.4 | NASA Land SIPS | https://www.earthdata.nasa.gov/sites/default/files/imported/VIIRS_activefire_User_Guide.pdf | Historical algorithm/product context | Public PDF | July 2018 guide; useful background but predates current Collection 2 guide. |
| VIIRS Land SIPS product page | NASA GSFC | https://viirsland.gsfc.nasa.gov/Products/NASA/FireESDR.html | Product family and algorithm context | Public | Explains 375 m and 750 m products and continuity with MODIS. |
| MODIS Fire User Guide | NASA / University of Maryland | https://modis-fire.umd.edu/files/MODIS_C6_1_Fire_User_Guide.pdf | MODIS C6.1 schema and algorithm | Public PDF | Use for C6.1 product semantics; verify URL availability before implementation. |
| MODIS/VIIRS burned-area SFTP | University of Maryland / NASA FIRMS archive reference | sftp://fuoco.geog.umd.edu | Optional post-fire context | Credentials described in user guides | Not a replacement for active-fire hotspot records; keep out of MVP unless needed. |

## 3. Archive temporal coverage (checked 2026-11-13)

The current FIRMS Archive Download page lists:

| Product | Temporal coverage listed |
|---|---|
| MODIS Collection 6.1 | 2000-11-01 – present |
| VIIRS S-NPP 375 m | 2012-01-20 – 2026-11-02 |
| VIIRS NOAA-20 375 m | 2018-04-01 – present |
| VIIRS NOAA-21 375 m | 2023-03-01 – present |
| Landsat 30 m | 2022-06-20 – present |

**Important S-NPP caveat:** the current archive page's end date is 2026-11-02. Treat S-NPP as historical-only beyond that listed date unless NASA posts a newer coverage date or confirms resumed delivery. Do not infer current data delivery from the continued presence of `VIIRS_SNPP_NRT` / `VIIRS_SNPP_SP` source identifiers in API documentation.

The end date is a live archive observation, not a permanent platform-status guarantee. Re-check before every production ingestion.

## 4. NRT, RT, URT, and Standard Processing

- **NRT (Near Real-Time):** low-latency observations. FIRMS states global availability generally within approximately 3 hours of satellite observation.
- **RT (Real-Time):** NASA EOSDIS defines availability within 60 minutes of satellite overpass.
- **URT (Ultra Real-Time):** FIRMS describes availability in less than 60 seconds for much of the United States and Canada; do not assume global URT availability.
- **Standard Processing (SP):** science-quality processing intended for retrospective analysis.
- **Archive replacement:** FIRMS states NRT archive records are replaced by standard science-quality records when available, at approximately a 5-month lag.
- **RT/URT retention:** RT/URT detections are removed when corresponding NRT detections are processed or when RT/URT is older than 6 hours.

**Implementation rules**
1. Store processing status and native `version` field.
2. Do not treat NRT and Standard versions of the same observation as independent detections.
3. Use NRT for recent monitoring and Standard for historical scientific analysis when available.
4. Record retrieval timestamp and source collection.
5. Never combine RT/URT with NRT without an explicit duplicate/transition policy.

## 5. FIRMS Area API operational constraints

Current official Area API documentation states:
- Area input: `west,south,east,north` or `world`.
- Date format: `YYYY-MM-DD`.
- `DAY_RANGE`: 1 to 5 days per request.
- `MAP_KEY`: free key required for FIRMS web services.
- Limit: 5,000 transactions per 10-minute interval.
- Larger requests can count as multiple transactions.
- Endpoint sources include MODIS NRT/Standard and VIIRS NOAA-20, NOAA-21, and S-NPP NRT/Standard.

API shape (illustrative; never embed a real key):
```text
https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{AREA_COORDINATES}/{DAY_RANGE}/{DATE}
```

Recommended ingestion behavior:
- Query the smallest AOI and time window needed.
- Respect 1–5 day maximum.
- Check product date availability where appropriate.
- Implement retry/backoff and transaction accounting.
- Cache completed responses.
- Keep MAP_KEY in environment variables; never commit it.
- Do not issue repeated global requests from the browser.

A global VIIRS day may return 30,000–100,000+ records according to the FIRMS API-use tutorial. Design ingestion and storage accordingly.

## 6. Product semantics and fields

### MODIS
FIRMS MODIS field documentation describes:
- `latitude`, `longitude`: center of an approximately 1 km fire pixel, not necessarily exact fire location.
- `scan`, `track`: actual pixel dimensions vary and grow toward scan edge.
- `acq_date`, `acq_time`: acquisition date/time; time is UTC.
- `satellite`: Aqua or Terra.
- `confidence`: numeric 0–100 confidence estimate, grouped into low/nominal/high fire classes.
- `version`: collection and processing source (URT, RT, NRT, or Standard).
- `brightness`, `bright_t31`: brightness temperatures in Kelvin.
- `frp`: pixel-integrated Fire Radiative Power in MW.
- `type`: inferred hotspot type; standard MCD14DL field includes vegetation fire, volcano, other static land source, offshore.
- `daynight`: day/night flag.

### VIIRS
Use the current Collection 2 375 m User Guide v1.2 as the primary reference. The older v1.4 guide describes the 2018 product generation and should not override C2 semantics.

Common FIRMS VIIRS CSV fields include `latitude`, `longitude`, `bright_ti4`, `scan`, `track`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `version`, `bright_ti5`, `frp`, `daynight`. Confirm exact fields and encodings for each platform/product in the C2 guide and current FIRMS attribute tables.

**Confidence rule:** retain native confidence values and scheme. Do not translate MODIS numeric confidence into VIIRS categorical confidence (or vice versa) by intuition.

## 7. Resolution and interpretation caveats

- MODIS active-fire product is nominally 1 km.
- VIIRS 375 m active-fire product is nominally 375 m (I-band product); pixel geometry varies across scan.
- MODIS latitude/longitude identifies pixel center, not exact flame location.
- `scan` and `track` encode actual footprint dimensions and should not be discarded.
- FRP is pixel-integrated radiative power in MW; it is not burned area or perimeter.
- A hotspot is a satellite thermal-anomaly detection, not necessarily a unique incident.
- Repeated detections can represent the same continuing fire, separate overpasses, or overlapping scans. Do not deduplicate by simple distance alone.

## 8. Acknowledgment and disclaimer

The following text was supplied by the project research inventory and should be checked against the live FIRMS acknowledgment/disclaimer page before final submission:

> We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Land, Atmosphere Near real-time Capability for Earth observations (LANCE) (https://earthdata.nasa.gov/lance) and NASA's Earth Science Data and Information System (ESDIS).
>
> FIRMS is operated by the ESDIS project. The information presented through LANCE, GIBS, Worldview, and FIRMS are provided “as is” and users bear all responsibility and liability for their use of data.

Do not label this text “mandatory verbatim wording” until confirmed on the current official attribution page. Include data source, retrieval time, and a clickable NASA source link in the app.

## 9. Scientific literature

### Core references

1. **Li, F., Zhang, X., Kondragunta, S., & Csiszar, I. (2018).** “Comparison of Fire Radiative Power Estimates From VIIRS and MODIS Observations.” *Journal of Geophysical Research: Atmospheres*, 123(9), 4545–4563. DOI: https://doi.org/10.1029/2017JD027823  
   Use: FRP comparison, viewing-zenith-angle dependence, sensor geometry, near-contemporaneous matching. Important finding: overpass-time gaps and view geometry can materially affect apparent differences; do not assume simple global conversion.

2. **Fu, Y. et al. (2020).** “Fire Detection and Fire Radiative Power in Forests and Low-Biomass Lands in Northeast Asia: MODIS versus VIIRS Fire Products.” *Remote Sensing*, 12(18), 2870. DOI: https://doi.org/10.3390/rs12182870  
   Use: biome-dependent omission and commission differences. The study reports substantial MODIS omissions relative to VIIRS in its Northeast Asia study area; do not generalize its percentages globally.

3. **Schroeder, W. et al. (2014).** “The New VIIRS 375 m Active Fire Detection Data Product: Algorithm Description and Initial Assessment.” *Remote Sensing of Environment*. DOI: https://doi.org/10.1016/j.rse.2014.03.008  
   Use: VIIRS 375 m algorithm background and initial evaluation.

4. **Schroeder, W. et al. (2025 guide version 1.2).** “Collection 2 Visible Infrared Imaging Radiometer Suite (VIIRS) 375-m Active Fire Product User Guide.” NASA Earthdata PDF: https://earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf  
   Use: current VIIRS Collection 2 product definitions and platform-specific caveats.

5. **Sofiev & Kouznetsov (2026).** “Observation operator and detection limits for MODIS and VIIRS Fire Radiative Power products.” *Geoscientific Model Development*. https://gmd.copernicus.org/articles/19/10123/2026/  
   Use: observation-space comparison and detection-limit concepts. Advanced reference; not an MVP dependency.

### Reading rules
For every paper, record the sensor collection, platform, study period, geography, comparison design, limitations, and which FireScope decision it supports. Never copy a numerical result without its study context.

## 10. Verification log

| Item | Status | Notes |
|---|---|---|
| Challenge objective | Verified from indexed official challenge page | Full Resources tab remains client-rendered/unverified |
| Archive coverage | Verified 2026-11-13 | Live dates can change |
| NRT-to-standard lag | Verified | FIRMS archive says approximately 5 months |
| Area API limits | Verified | 1–5 day range; 5,000 transactions/10 min |
| RT/URT retention | Verified | Removed after NRT processing or >6 hours |
| MODIS fields | Verified | FIRMS MODIS attribute page |
| VIIRS C2 guide | Located | Use v1.2, not only older 2018 guide |
| Attribution wording | Needs final live-page confirmation | Keep as proposed text until confirmed |
