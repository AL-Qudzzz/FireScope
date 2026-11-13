---
title: FireScope Design System & Product UX Specification
product: FireScope
status: Proposed design baseline
surface_mode: Operate
version: 1.0.0
last_updated: 2026-11-13
---

# FireScope — Design System & Product UX Specification

> **Product promise:** Explore where and when satellite active-fire detections were observed, compare sensor records without hiding their differences, and understand the quality and provenance of every result.
>
> **Design direction:** **Field Atlas** — a calm, precise geospatial analysis workspace. The visual language should feel closer to a well-edited scientific atlas than a dramatic emergency-control room.

This document defines the durable product and visual decisions for the FireScope web application. It is based on the supplied `PRD.md`, `ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `METHODOLOGY.md`, `API_CONTRACT.md`, `NASA_DATA_SOURCES.md`, `TECHNICAL_RESEARCH.md`, `TESTING.md`, `DECISIONS.md`, `AGENTS.md`, and the NASA FIRMS screenshot supplied as a visual reference.

---

## 1. Product definition

### 1.1 What FireScope is

FireScope is a global, area-of-interest (AOI) based active-fire observation analysis application. It combines a spatial map with an activity calendar, time-series analysis, sensor/platform breakdowns, data availability, and transparent methodology.

The core experience is **calendar-first and AOI-first**. The map provides geographic context and AOI selection; the calendar makes temporal patterns understandable; charts and detail panels explain the selected time bin.

### 1.2 What FireScope is not

FireScope is not an emergency dispatch system, a guaranteed real-time alert service, a fire-spread predictor, a burned-area estimator, or a confirmed-incident registry. A satellite hotspot is a thermal-anomaly detection record, not automatically a unique fire incident, perimeter, ignition point, or burned-area measurement.

### 1.3 Primary users and jobs

| User group | Primary job | UX implication |
|---|---|---|
| Early-warning teams | Review recent activity and identify periods needing attention | Recent date presets, freshness status, clear unusual-activity caveats |
| Emergency responders | Understand where and when detections were recorded | AOI/map context, selected-day drill-down, accessible provenance |
| Scientists and analysts | Compare dates and sensors without concealing limitations | Sensor-separated series, method/version metadata, native confidence |
| Land managers | Recognize recurring seasonal patterns | Multi-year monthly calendar, year-over-year views |
| Public and educators | Understand patterns without specialist knowledge | Plain-language labels, explainers, clear non-claims |

### 1.4 Product principles

1. **Calendar is the core, not a secondary widget.** The key task is to inspect temporal patterns inside a selected AOI.
2. **Global by default.** Indonesia is a demo region, not a product boundary.
3. **Sensor-aware.** MODIS, VIIRS, and each platform remain identifiable throughout the interface.
4. **Explain every number.** Metrics expose units, method, date window, spatial unit, source, and processing state.
5. **No false certainty.** Missing observations are not proof that no fire occurred.
6. **Progressive disclosure.** Keep the default view understandable; reveal native fields and technical provenance on demand.
7. **Complete one vertical slice first.** AOI → date range → calendar → time-bin detail → provenance must work end-to-end before stretch features.

---

## 2. Visual direction — Field Atlas

### 2.1 Visual concept

A field atlas is a working instrument for understanding geography and time. It is structured, calm, information-dense where needed, and restrained in decoration. The interface should feel trustworthy under long analysis sessions and remain legible when charts, map markers, and metadata are visible together.

The surface is a task-oriented application, so the Impeccable mode is **Operate**. Prioritize scanability, component consistency, native controls, predictable interaction, and task completion over expressive animation or novelty.

### 2.2 How the supplied NASA FIRMS screenshot informs the redesign

**Preserve the useful product cues:**
- Global geospatial context is immediately available.
- AOI/location selection is prominent.
- Date/time context and data freshness are visible.
- Map layers and map controls are easy to discover.
- Active-fire observations are identifiable on the map.

**Improve or replace:**
- Replace the oversized red header and dense menu row with a compact, quiet application shell.
- Do not let the map consume the entire first viewport; the calendar must be visible as a first-class analysis surface.
- Move frequently used filters into a consistent toolbar instead of scattering controls over the map.
- Replace icon-only or ambiguous controls with labeled actions and tooltips.
- Move details, methodology, data status, and source provenance into structured panels with clear hierarchy.
- Use FireScope identity. Do not copy NASA FIRMS branding, logos, or imply that FireScope is an official NASA application.

### 2.3 Art direction

- **Tone:** precise, composed, analytical, reassuring without being alarmist.
- **Density:** medium; compact metadata is allowed, but primary tasks must have breathing room.
- **Default theme:** light. Offer a complete dark theme for low-light work, not a partially inverted palette.
- **Imagery:** use map tiles and observation marks as functional information, not decorative hero imagery.
- **Brand motif:** subtle cartographic grid lines, coordinate ticks, and restrained contour/coordinate details may appear in empty states or section dividers. Never place decorative flame graphics behind data.
- **Avoid:** glowing red gradients, tactical command-center styling, glassmorphism, excessive rounded pill controls, neon heatmaps, huge KPI numerals, gratuitous animation, and generic SaaS gradients.

---

## 3. Information architecture

### 3.1 Primary navigation

Use a compact top application bar and a collapsible left navigation rail/sidebar.

| Route / section | Purpose | Priority |
|---|---|---:|
| Overview | Global map, current AOI context, recent activity, and data freshness | P0 |
| AOI Analysis | Calendar, time series, sensor comparison, selected-bin details | P0 |
| Data Sources | Source/platform coverage, processing state, retrieval status | P0 |
| Methodology | M0–M3 explanation, aggregation rules, uncertainty, limitations | P0 |
| Saved AOIs | Persist and revisit user AOIs | P2 |
| Compare | Compare two AOIs or time periods | P1 |

If the implementation timeline requires a smaller navigation, combine Overview and AOI Analysis into one primary workspace with Overview as the default state. Do not remove the calendar or methodology access.

### 3.2 Main application shell

**Desktop target:** 1440 × 900 and 1280 × 800.

- Top app bar: 60–64 px high.
- Left sidebar: 232–248 px expanded; 64–72 px collapsed.
- Main content: fluid, 12-column grid, max-width approximately 1600 px.
- Content padding: 24 px desktop, 16 px tablet, 12–16 px mobile.
- Keep the selected AOI and global date range visible while the user moves between the map, calendar, and charts.

**Top bar contents:**
- FireScope wordmark and a small neutral cartographic mark (not NASA branding).
- Primary navigation or compact section links.
- Global AOI search/selector.
- Data status indicator with text (for example, “Source status: delayed”); never use color alone.
- Theme toggle and user/help menu only if the application actually supports them.

**Left sidebar contents:**
- AOI search and preset AOI list.
- “Draw area” action for a bounding box; polygon drawing may be added when the backend/API supports validated polygon geometry.
- Current AOI summary with clear/reset selection.
- Date range presets and custom range.
- Sensor filter: MODIS, VIIRS, or Compare (comparison keeps values separate).
- Advanced filters in a disclosure section: platform, processing status, day/night, and sensor-native confidence filters only when the supported product fields are present.

Do not imply Saved AOIs exist in P0 unless persistence has actually been implemented.

---

## 4. Core screen specification

### 4.1 Overview / AOI workspace — primary screen

The first viewport should answer five questions quickly:
1. Which AOI am I examining?
2. Which time window is selected?
3. What active-fire observations are present in the available records?
4. How do MODIS and VIIRS contribute separately?
5. How fresh and complete is the source information known to be?

**Recommended desktop composition:**

1. **Page heading:** AOI name, geographic context, optional coordinate summary, and an “Edit area” action.
2. **Filter toolbar:** start/end date, granularity, sensor mode, and reset filters. All workspace panels share the same query state.
3. **Status strip:** latest acquisition time, source retrieval time, active processing states, and explicit data-gap note if known.
4. **Metric row:** MODIS detections, VIIRS detections, FRP summary with valid-record count, and source availability. Keep MODIS and VIIRS metrics separate.
5. **Analysis grid:**
   - Main column (about 7–8/12): Burning Activity Calendar.
   - Supporting column (about 4–5/12): Map preview with AOI boundary and filtered active-fire observations.
6. **Lower analysis row:** sensor-separated time series and platform composition.
7. **Selected-bin detail:** open an inline detail region or right-side drawer after selecting a calendar cell or map cluster. Avoid a blocking modal as the default.

The calendar should be visible without scrolling on a typical desktop viewport after the heading and filters. The map remains prominent enough for spatial verification but must not displace the calendar.

### 4.2 Burning Activity Calendar

This is the signature component and must receive the strongest information hierarchy.

**Controls:**
- Granularity: Day / Week / Month.
- Period navigation: previous, next, jump to year, and current range.
- Sensor display: Compare / MODIS / VIIRS.
- Optional platform breakdown appears in the selected-bin detail, not as an overfilled cell.

**Cell behavior:**
- Every cell represents a clearly defined time bin and uses the same AOI/date filters as all other panels.
- In Compare mode, show MODIS and VIIRS as two independent mini-bars or paired values within each cell. Do not merge them into one visually additive heat level.
- The two sensor scales must be independently labeled when color intensity is used. Do not imply that equal visual intensity represents equivalent detection opportunity.
- In single-sensor mode, the selected sensor can use a restrained sequential intensity scale, with the count printed or available in an accessible label.
- Selected cells have a clear outline and keyboard focus state.
- Hover/focus reveals date, bin boundary/timezone, sensor-specific counts, and whether source records were available.
- Click opens the bin detail.

**Empty and missing values:**
- Distinguish “0 detections in available records” from “no source records available,” “source unavailable,” and “query failed.”
- Use copy such as **“No detections in available records”** rather than “No fire.”
- A missing sensor series must remain missing; do not render it as zero.

**Period strategy:**
- Daily view is optimized for a selected year or shorter period.
- Weekly view is available when it helps reduce density.
- Monthly view is preferred for long historical periods and multi-year seasonality.
- Preserve the UTC calculation basis. If the UI renders AOI-local dates, show the AOI timezone and define bin boundaries explicitly.

### 4.3 Map preview and spatial selection

Use MapLibre GL JS with a documented, legally usable base map style. Confirm tile-provider terms, usage limits, and attribution before selecting a production provider. Do not hardcode a paid map token or assume a specific tile provider is included.

**Map behavior:**
- Fit the map to the selected AOI.
- Show AOI outline/fill with restrained emphasis.
- Show observation layers filtered by the same date and sensor controls as the calendar.
- Distinguish MODIS and VIIRS using both color and a secondary visual cue (shape/outline or legend), so the map does not rely on color alone.
- Cluster at low zoom; reveal bounded point detail at high zoom.
- A cluster click zooms or opens its summarized details. A point click opens a record detail view with acquisition time and native attributes.
- Keep zoom, reset/fit-to-AOI, layer visibility, and fullscreen controls in a consistent control stack inside the map frame.
- Include a visible legend and map attribution. Do not place every control as a floating icon around the map perimeter.
- Never load all global raw observations in the browser. Use bounded API queries, server-side aggregation, clustering, or grid summaries.

**AOI selection:**
- P0 baseline: selectable demo AOIs and a validated bounding-box workflow aligned with the current API contract.
- Polygon drawing is an extension unless the API is updated to accept and validate polygon geometry.
- Search should only claim geographic lookup when a real geocoding/AOI catalogue exists. Do not create a fake search interaction.

### 4.4 Time-series and sensor composition

Use Apache ECharts.

- Plot MODIS and VIIRS as separate series; expose platform-level detail on demand.
- Use consistent sensor colors and labels across the calendar, map legend, chart, and detail panel.
- Do not create a single merged line by default.
- If a pooled observation count is intentionally shown, call it **Pooled observation records**, describe the exact arithmetic, and state that it is not a normalized or harmonized fire-activity metric.
- Add a visible method/version note and selected period.
- Use clear axis units and an accessible data table or summary equivalent.
- Avoid smoothing that visually suggests unobserved values. Missing intervals should remain gaps, not zero-filled points.

### 4.5 Metric cards

P0 metric cards:

| Card | Value | Required secondary text |
|---|---|---|
| MODIS detections | Count from selected AOI/time bin | Platform composition and processing status |
| VIIRS detections | Count from selected AOI/time bin | Platform composition and processing status |
| Observed FRP | Sensor/platform-specific MW summary where available | Statistic used + valid FRP record count |
| Data status | Dynamic source/platform status | Latest acquisition and retrieved-at timestamp |

Never label a detection count as “number of fires.” Never label FRP as burned area, perimeter, or direct fire size.

### 4.6 Selected time-bin details

Open as a right drawer on desktop and a full-height sheet on mobile. Keep the underlying calendar visible on desktop where possible.

Sections:
1. **Time bin:** exact date/time boundaries, granularity, timezone, AOI.
2. **Observation summary:** MODIS and VIIRS counts separately.
3. **Platform split:** Terra, Aqua, Suomi-NPP, NOAA-20, NOAA-21 as available in the selected records.
4. **Native confidence:** preserve each sensor’s scheme and native values/categories; do not convert to a shared percentage.
5. **FRP:** statistic, MW units, number of valid FRP values, sensor/platform.
6. **Processing and source:** collection, native version, NRT/Standard state, retrieval timestamp, source file/source product, and method/version.
7. **Records:** bounded/paginated observation table with acquisition time, location, sensor/platform, native confidence, FRP, and provenance.

### 4.7 Data Sources and platform status

The screen should answer whether the application has recent records and which products/platforms contribute to the current analysis.

Show per source/product/platform:
- Product and sensor/platform identity.
- Collection and processing state.
- Latest acquisition date/time.
- Last retrieval timestamp.
- Availability status and any known coverage gap.
- Source link and attribution.

Statuses must be dynamic API data, never hardcoded examples. A historical archive snapshot must not be presented as a permanent satellite-status claim. In particular, platform continuity and archive end dates must be checked against the live NASA source before release.

### 4.8 Methodology and limitations

The methodology page must be understandable without reading the research document.

Present the method levels:
- `M0_RAW`: original source observations.
- `M1_AGGREGATED`: common AOI/time bins, but sensor-specific counts.
- `M2_COMPARATIVE`: side-by-side sensor/platform comparison without correction.
- `M3_HARMONIZED`: validated cross-sensor correction/model; not part of the MVP unless separately reviewed and validated.

Default product experience is M1/M2. Explain in plain language that common AOI/time bins improve query alignment but do not calibrate sensor sensitivity or observation opportunity.

Include clear notes that MODIS and VIIRS differ in spatial resolution, footprint, geometry, overpass timing, algorithms, sensitivity, confidence semantics, and processing lifecycle. Explain that cloud, timing, view geometry, and data availability can affect recorded observations.

### 4.9 Historical unusual-activity indicator — P1

Only show after a documented baseline is available and validated.

- Compare like-for-like seasonal/monthly bins for the same AOI and metric.
- Define baseline years, minimum observations, time-bin rules, sensor/platform composition, and processing-state treatment.
- A robust score may use `robust_z = (x - median_baseline) / (1.4826 * MAD_baseline)`, with explicit handling for `MAD = 0` and incomplete periods.
- Label the result **“Unusual relative to this baseline”**, never “fire prediction,” “risk forecast,” or an operational alert.
- If platform/sensor composition changes materially, annotate or suppress the comparison rather than suggesting a false trend.

---

## 5. Design system tokens

These values are proposed starting tokens. Keep them centralized in CSS variables/theme tokens and refine after inspecting the rendered interface.

### 5.1 Color roles — light theme

| Token | Value | Usage |
|---|---|---|
| `--app-bg` | `#F4F6F8` | Application canvas |
| `--surface` | `#FFFFFF` | Cards, drawers, menus |
| `--surface-subtle` | `#F8FAFC` | Nested panels, table headers |
| `--surface-nav` | `#EEF2F6` | Sidebar and quiet navigation surfaces |
| `--border` | `#DCE3EA` | Card and control borders |
| `--border-strong` | `#B9C5D1` | Focused/active structural borders |
| `--text-primary` | `#16212B` | Headings and primary values |
| `--text-secondary` | `#526171` | Body copy and labels |
| `--text-muted` | `#718096` | Metadata and tertiary copy |
| `--accent` | `#0F766E` | Primary action, focus, selected navigation |
| `--accent-soft` | `#CCFBF1` | Selected backgrounds where appropriate |
| `--sensor-modis` | `#D97706` | MODIS series and marks |
| `--sensor-viirs` | `#2563EB` | VIIRS series and marks |
| `--hotspot-mark` | `#E5484D` | Active-fire point emphasis when sensor identity is conveyed separately |
| `--status-success` | `#15803D` | Healthy/available state |
| `--status-warning` | `#B45309` | Delayed, partial, or needs-attention state |
| `--status-error` | `#B91C1C` | Failed source/query state |
| `--status-info` | `#1D4ED8` | Informational note |

Do not use the hotspot red as the general brand/action color. Fire markers should be visible without making the entire interface alarm-red.

### 5.2 Dark theme

Provide a fully tuned dark theme, not a CSS inversion:

| Token | Value |
|---|---|
| `--app-bg` | `#0B1220` |
| `--surface` | `#111C2D` |
| `--surface-subtle` | `#172338` |
| `--surface-nav` | `#0F1A2A` |
| `--border` | `#29384C` |
| `--text-primary` | `#E7EDF5` |
| `--text-secondary` | `#B6C3D2` |
| `--text-muted` | `#8A9AAF` |
| `--accent` | `#5EEAD4` |
| `--sensor-modis` | `#FDBA74` |
| `--sensor-viirs` | `#93C5FD` |
| `--hotspot-mark` | `#FB7185` |

Dark map style and chart backgrounds must be tested independently. Preserve contrast and sensor-color differentiation.

### 5.3 Typography

- Primary UI family: `Inter`, with a robust system sans fallback.
- Data/coordinate family: `IBM Plex Mono` or a system monospace fallback for coordinates, timestamps, IDs, and technical values.
- Use one UI family for headings, body, and controls; avoid display fonts in operational labels.
- Use tabular numerals for counters, dates, and time-series values.
- Suggested fixed scale: 12 / 13 / 14 / 16 / 18 / 20 / 24 / 28 / 32 px.
- Keep explanatory prose around 65–75 characters per line where the layout permits.
- Primary page title: 24–28 px; section heading: 16–18 px; control labels: 12–13 px; dense table metadata: 12–13 px.

### 5.4 Spacing, shape, and elevation

- Base spacing unit: 4 px; common steps: 4, 8, 12, 16, 20, 24, 32, 40, 48 px.
- Card radius: 12–14 px.
- Control radius: 8–10 px.
- Pill radius reserved for compact status chips and segmented selectors, not every control.
- Card borders are more important than shadows; use subtle elevation only for drawers/popovers.
- Avoid excessive glass, blur, gradients, and nested cards.

### 5.5 Component conventions

Every interactive component must define: default, hover, focus-visible, active, disabled, loading, and error states as applicable.

- Buttons: one primary style, one secondary/outline style, one quiet/ghost style, and destructive only when needed.
- Inputs: consistent height, label placement, helper/error text, keyboard focus, and clear affordances.
- Status chips: text + icon/shape + color; never color only.
- Tooltips: concise explanations for unfamiliar technical terms; do not hide essential information exclusively in tooltips.
- Drawers/popovers: escape scroll/overflow clipping; preserve keyboard focus and provide predictable close behavior.
- Tables: sticky headers when useful, row hover, clear empty state, pagination, and responsive overflow strategy.

---

## 6. Interaction and state model

### 6.1 Shared query state

The following state must drive all related views consistently:
- selected AOI (`aoi_id` or validated `bbox`);
- start and end dates;
- granularity (`day`, `week`, `month`);
- metric (`detection_count` in MVP; any other metric must have an explicit definition);
- sensor mode (`MODIS`, `VIIRS`, `ALL`/Compare);
- optional platform and processing-status filters;
- selected time bin;
- map viewport and layer visibility.

Changing AOI, dates, granularity, or sensor mode updates the calendar, chart, map, metric cards, and details as one coherent query. Keep the URL shareable where practical, but do not invent persistent user accounts.

### 6.2 Loading, empty, error, and demo states

| State | UI behavior | Required copy pattern |
|---|---|---|
| Loading | Skeletons matching final card/chart dimensions; retain the last valid query context | “Loading observations…” |
| Valid data | Render values and query metadata | Show range, AOI, source, retrieval time |
| No detections in available records | Neutral empty visualization, preserve source status | “No detections in available records for this time bin.” |
| No source data | Distinct unavailable/unknown treatment | “No source records are available for this period.” |
| Partial data | Render available sensors and flag missing sources | “Partial source coverage — review platform status.” |
| API/source failure | Actionable error with retry and technical detail disclosure | “We couldn’t retrieve the selected observations. Try again.” |
| Demo/synthetic mode | Persistent and visible banner on all relevant screens | “Demo data — not live NASA observations.” |

Never silently convert a missing result to a numeric zero. Never silently fall back from live data to synthetic data.

### 6.3 Motion

- Most transitions: 150–250 ms.
- Motion exists only to communicate state, selection, panel entry, or feedback.
- No orchestrated page-load animation.
- Respect `prefers-reduced-motion`.
- Map zoom and chart transitions must not interrupt user interaction or introduce misleading interpolated observations.

### 6.4 Accessibility

- Target WCAG 2.2 AA contrast for text and controls.
- Full keyboard navigation for sidebar, date range, calendar cells, map action controls, drawers, and tables.
- Use visible focus rings.
- Provide text alternatives for every chart and map summary; do not make key insights color-only.
- Sensor identity should use label + color + a second cue where possible.
- Interactive targets should generally be at least 40–44 px high/tall.
- Tooltips should be keyboard-accessible and dismissible.
- Keep heading hierarchy, landmarks, labels, and error announcements correct.

### 6.5 Responsive behavior

| Breakpoint | Layout behavior |
|---|---|
| ≥ 1280 px | Expanded sidebar; calendar and map side-by-side; lower charts in two columns |
| 768–1279 px | Collapsible sidebar; calendar takes full width or 7/12 with compact map; chart panels stack as needed |
| < 768 px | Top compact header; AOI/filter controls in accessible bottom sheet or drawer; calendar full width; map becomes a collapsible/toggle panel; detail uses full-height sheet |

On mobile, do not simply shrink the desktop map/calendar split. Reorder content around the primary task and keep filters discoverable.

---

## 7. Data visualization rules

1. Use the same MODIS/VIIRS colors in every view.
2. Keep sensor series separate by default.
3. Never compare unlike native confidence scales on one common axis.
4. FRP is in MW. Every FRP statistic includes the statistic type and valid-record count.
5. Pooled record counts are not normalized fire activity and are never called harmonized counts.
6. Do not display a zero where the source/time bin is missing.
7. State the time-bin boundaries and timezone.
8. Keep acquisition time separate from retrieval time.
9. Display source/product, collection, native processing version/status, platform composition, method ID/version, and retrieval timestamp in the relevant detail view.
10. Do not use a single global heat scale that makes MODIS and VIIRS counts look directly equivalent in Compare mode.
11. Distinguish active-fire observations from reconstructed fire events. Event clustering is out of MVP unless separately designed, validated, and labeled.
12. Mark all illustrative/synthetic records as demo data.

---

## 8. Technical product alignment

The design assumes the provisional stack in `ARCHITECTURE.md`:

- Frontend: React + TypeScript + Vite.
- Map: MapLibre GL JS.
- Charts: Apache ECharts.
- Backend: Python + FastAPI + Pydantic.
- Processing: Pandas, NumPy, SciPy; GeoPandas/Shapely only when justified.
- Storage: DuckDB + Parquet.
- PostGIS only if persistent multi-user spatial querying demonstrates a real need.

The UI consumes the proposed `/api/v1` contract:
- `GET /health`
- `GET /api/v1/data/status`
- `GET /api/v1/analytics/calendar`
- `GET /api/v1/observations`

All timestamps are UTC ISO-8601 in the API, and coordinates use WGS84. Validate AOI and date ranges at API boundaries. Keep raw observation responses bounded and paginated. The backend performs aggregation; the browser must not fetch all global raw points.

**Contract caution:** the example field `combined_pooled_count` in `API_CONTRACT.md` is illustrative. If the API returns a pooled count, label it `pooled_observation_count` (or update the contract atomically) and never label it “harmonized count.” `sensor=ALL` must preserve sensor-separated series.

---

## 9. Priority and implementation scope

### P0 — required MVP

- Global map and AOI selection.
- At least two geographically distinct demo AOIs.
- Validated bounding-box selection; polygon drawing only if supported by the API.
- Shared date-range filter.
- Daily and/or monthly burning-activity calendar; day/week/month controls where feasible.
- Separate MODIS and VIIRS counts, with platform identity preserved in details.
- Time-series chart for selected AOI.
- Selected-bin detail with provenance.
- FRP summary only with MW units and valid-record count.
- Dynamic source freshness, processing status, and retrieval timestamp.
- Methodology/limitations access from analysis views.
- Clearly separated live, error, empty, partial, and demo states.

### P1 — valuable extensions

- Seasonal baseline and like-for-like year-over-year comparison.
- Unusual-activity indicator with method/limitations.
- CSV export with definitions and provenance.
- AOI/period comparison.
- Map clustering or documented grid aggregation.

### P2 — later

- Saved AOIs and user preferences.
- Automated refresh.
- Contextual layers.
- Advanced observation-aware correction after scientific review and validation.

### Out of scope

- Future fire-spread prediction.
- Reconstructing perimeters from hotspot points.
- Confirmed incident count without corroboration.
- Guaranteed operational alerts.
- Universal confidence conversion.
- Unreviewed M3/M4 probability or observation-opportunity correction.
- Native swath reprocessing unless the project scope and source inputs change.

---

## 10. UX acceptance checklist

- [ ] A user can select a valid AOI and see it on the map.
- [ ] A date-range change updates every data view.
- [ ] The activity calendar is visible as the primary analysis tool.
- [ ] Compare mode keeps MODIS and VIIRS values separate.
- [ ] Selecting a calendar cell opens the correct time-bin detail.
- [ ] Selected-bin details show platform, native confidence, FRP units/valid count, processing status, and provenance.
- [ ] Source freshness and retrieval time are visible and dynamic.
- [ ] “No detections” is not phrased as “no fire.”
- [ ] Missing source data is not represented as zero.
- [ ] Demo/synthetic data has a persistent, visible label.
- [ ] The map does not fetch all global raw observations.
- [ ] Keyboard, focus, empty, loading, failure, and mobile states work.
- [ ] The same sensor color and label semantics are used in the map, calendar, chart, and details.
- [ ] The rendered UI is visually inspected at desktop, tablet, and mobile sizes in both themes.

---

## 11. Open decisions to confirm during implementation

These are intentionally not silently assumed by the design:

1. The exact challenge Resources-tab data resource to ingest must be verified by the team in the live challenge page before final submission.
2. The final map tile provider/style must pass usage and attribution checks.
3. The minimum reliable AOI input for P0 is bounding box; polygon support depends on API validation and implementation.
4. The initial calendar default (daily for a year vs monthly for a multi-year period) should be selected based on the first complete vertical slice and payload performance.
5. Any anomaly baseline must define years, sensor/platform composition, incomplete periods, and processing-state handling before being displayed.
6. M3/M4 corrections are excluded unless the integrator reviews the original paper, equations, code/license, required inputs, and validation plan.

---

## 12. Source documents

Treat these as the project source of truth, in the supplied order of authority:

1. Official NASA Space Apps challenge page and verified NASA FIRMS/product documentation.
2. `AGENTS.md` for agent rules and scientific hard constraints.
3. `PRD.md` for product requirements and acceptance criteria.
4. `TECHNICAL_RESEARCH.md` and `METHODOLOGY.md` for scientific definitions and methods.
5. `DATA_DICTIONARY.md` and `API_CONTRACT.md` for fields and data interfaces.
6. `ARCHITECTURE.md`, `TESTING.md`, `DECISIONS.md`, and `HACKATHON_EXECUTION.md` for engineering and delivery constraints.

Useful external tool references:
- Archify: https://github.com/tt-a1i/archify
- Graphify: https://github.com/Graphify-Labs/graphify
- Impeccable: https://github.com/pbakaus/impeccable
- NASA FIRMS: https://firms.modaps.eosdis.nasa.gov/map/
