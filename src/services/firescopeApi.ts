import {
  LATEST_ACQUISITION_UTC,
  PLATFORM_REGISTRY,
  PRESET_AOIS,
  RETRIEVED_AT_UTC,
} from '../data/firmsArchiveData';
import { generateTimeBins } from '../science/fireScience';
import {
  AoiComparisonResponse,
  AoiDefinition,
  CalendarAnalyticsResponse,
  CalendarBinRecord,
  CanonicalObservation,
  DataStatusResponse,
  FrpSummaryStats,
  Granularity,
  MapGridResponse,
  MapHotspotsResponse,
  PaginatedObservationsResponse,
  PeriodComparisonResponse,
  SharedQueryState,
} from '../types/firescope';
import {
  generateAoiComparisonCsv,
  generatePeriodComparisonCsv,
} from '../science/comparisonScience';
import {
  computePlatformExposure,
  getExpectedActivePlatforms,
} from '../science/harmonizationScience';
import { fetchLiveEonetObservations } from './eonetLiveService';

export { generateAoiComparisonCsv, generatePeriodComparisonCsv };

export function getActiveAoi(state: SharedQueryState): AoiDefinition {
  if (state.customAoi && state.aoiId === state.customAoi.id) {
    return state.customAoi;
  }
  return PRESET_AOIS.find((a) => a.id === state.aoiId) ?? PRESET_AOIS[0];
}

export function getLocalDataStatus(): DataStatusResponse {
  return {
    status: 'PARTIAL_PLATFORM_GAP',
    data_mode: 'NASA_ARCHIVE_BASELINE',
    demo_banner_text:
      'Awaiting NASA FireScope backend status (/api/v1/data/status). Client synthetic archive fallback is disabled.',
    retrieved_at_utc: RETRIEVED_AT_UTC,
    latest_acquisition_utc: LATEST_ACQUISITION_UTC,
    live_firms_connected: false,
    live_firms_count: 0,
    live_firms_synced_at_utc: RETRIEVED_AT_UTC,
    firms_map_key_configured: false,
    live_eonet_connected: false,
    live_eonet_event_count: 0,
    live_eonet_synced_at_utc: RETRIEVED_AT_UTC,
    parquet_archive: null,
    global_presets_archive: null,
    firms_area_api_constraints: {
      day_range_min: 1,
      day_range_max: 5,
      transactions_per_10_min: 5000,
      nrt_to_standard_lag_months: 5,
      rt_urt_retention_hours: 6,
    },
    platforms: PLATFORM_REGISTRY,
    raw_archive_manifest: [],
  };
}

export async function fetchDataStatusFromApi(): Promise<DataStatusResponse> {
  try {
    const res = await fetch('/api/v1/data/status');
    if (res.ok) {
      return (await res.json()) as DataStatusResponse;
    }
  } catch {
    // Fallback to deterministic local engine if offline
  }
  return getLocalDataStatus();
}

function appendAoiParams(
  searchParams: URLSearchParams,
  state: SharedQueryState,
  overrideAoi?: AoiDefinition
) {
  const aoi = overrideAoi ?? getActiveAoi(state);
  const isBuiltInPreset = PRESET_AOIS.some((p) => p.id === aoi.id);
  if (!isBuiltInPreset || (state.customAoi && state.aoiId === state.customAoi.id)) {
    const b = aoi.bbox;
    searchParams.set('bbox', `${b.west},${b.south},${b.east},${b.north}`);
    searchParams.set('aoi_name', aoi.name);
    if (aoi.id) {
      searchParams.set('aoi_id', aoi.id);
    }
  } else {
    searchParams.set('aoi_id', aoi.id);
  }
}

export async function fetchMapHotspotsFromApi(params: {
  state: SharedQueryState;
  bounds: { west: number; south: number; east: number; north: number };
  zoom: number;
  signal?: AbortSignal;
}): Promise<MapHotspotsResponse | null> {
  const { state, bounds, zoom, signal } = params;
  const sp = new URLSearchParams();
  appendAoiParams(sp, state);
  sp.set('west', bounds.west.toFixed(4));
  sp.set('south', bounds.south.toFixed(4));
  sp.set('east', bounds.east.toFixed(4));
  sp.set('north', bounds.north.toFixed(4));
  sp.set('zoom', String(zoom));
  sp.set('start_date', state.startDate);
  sp.set('end_date', state.endDate);
  sp.set('sensor', state.sensor);
  sp.set('platforms', state.platforms.join(','));
  sp.set('processing_status', state.processingStatus);
  sp.set('daynight', state.dayNight);
  sp.set('modis_min_confidence', String(state.modisMinConfidence));
  sp.set('viirs_categories', state.viirsCategories.join(','));
  sp.set('exclude_offshore', String(state.excludeOffshore));
  sp.set('max_points', zoom <= 3 ? '4500' : '6000');

  const res = await fetch(`/api/v1/map/hotspots?${sp.toString()}`, { signal });
  if (!res.ok) return null;
  return (await res.json()) as MapHotspotsResponse;
}

export async function fetchMapGridFromApi(params: {
  state: SharedQueryState;
  bounds: { west: number; south: number; east: number; north: number };
  mode: 'grid' | 'cluster';
  resolutionDeg: 0.25 | 0.5 | 1.0 | 2.0;
  signal?: AbortSignal;
}): Promise<MapGridResponse | null> {
  const { state, bounds, mode, resolutionDeg, signal } = params;
  const normalizeLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
  const fullWorldSpan = bounds.east - bounds.west >= 359;
  let normW = fullWorldSpan ? -180 : normalizeLng(bounds.west);
  let normE = fullWorldSpan ? 180 : normalizeLng(bounds.east);
  if (normW > normE) {
    // Viewport crosses antimeridian; query full longitude range cleanly
    normW = -180;
    normE = 180;
  }

  const sp = new URLSearchParams();
  appendAoiParams(sp, state);
  sp.set('west', normW.toFixed(4));
  sp.set('south', Math.max(-85, bounds.south).toFixed(4));
  sp.set('east', normE.toFixed(4));
  sp.set('north', Math.min(85, bounds.north).toFixed(4));
  sp.set('mode', mode);
  sp.set('resolution_deg', String(resolutionDeg));
  sp.set('start_date', state.startDate);
  sp.set('end_date', state.endDate);
  sp.set('sensor', state.sensor);
  sp.set('platforms', state.platforms.join(','));
  sp.set('processing_status', state.processingStatus);
  sp.set('daynight', state.dayNight);
  sp.set('modis_min_confidence', String(state.modisMinConfidence));
  sp.set('viirs_categories', state.viirsCategories.join(','));
  sp.set('exclude_offshore', String(state.excludeOffshore));

  const res = await fetch(`/api/v1/map/grid?${sp.toString()}`, { signal });
  if (!res.ok) return null;
  return (await res.json()) as MapGridResponse;
}

export async function fetchCalendarAnalyticsFromApi(
  state: SharedQueryState,
  signal?: AbortSignal
): Promise<CalendarAnalyticsResponse | null> {
  const sp = new URLSearchParams();
  appendAoiParams(sp, state);
  sp.set('start_date', state.startDate);
  sp.set('end_date', state.endDate);
  sp.set('granularity', state.granularity);
  sp.set('sensor', state.sensor);
  sp.set('metric', state.calendarMetric);
  sp.set('platforms', state.platforms.join(','));
  sp.set('processing_status', state.processingStatus);
  sp.set('daynight', state.dayNight);
  sp.set('modis_min_confidence', String(state.modisMinConfidence));
  sp.set('viirs_categories', state.viirsCategories.join(','));

  const res = await fetch(`/api/v1/analytics/calendar?${sp.toString()}`, { signal });
  if (!res.ok) {
    let msg = `Calendar API error (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // ignore non-JSON body
    }
    throw new Error(msg);
  }
  return (await res.json()) as CalendarAnalyticsResponse;
}

export async function fetchPeriodComparisonFromApi(params: {
  state: SharedQueryState;
  activeAoi?: AoiDefinition;
  periodAStart: string;
  periodAEnd: string;
  periodBStart: string;
  periodBEnd: string;
  periodALabel?: string;
  periodBLabel?: string;
  granularity?: Granularity;
  signal?: AbortSignal;
}): Promise<PeriodComparisonResponse | null> {
  const {
    state,
    activeAoi,
    periodAStart,
    periodAEnd,
    periodBStart,
    periodBEnd,
    periodALabel,
    periodBLabel,
    granularity = 'month',
    signal,
  } = params;

  const sp = new URLSearchParams();
  appendAoiParams(sp, state, activeAoi);
  sp.set('period_a_start', periodAStart);
  sp.set('period_a_end', periodAEnd);
  sp.set('period_b_start', periodBStart);
  sp.set('period_b_end', periodBEnd);
  if (periodALabel) sp.set('period_a_label', periodALabel);
  if (periodBLabel) sp.set('period_b_label', periodBLabel);
  sp.set('granularity', granularity);
  sp.set('sensor', state.sensor);
  sp.set('metric', state.calendarMetric);
  sp.set('platforms', state.platforms.join(','));
  sp.set('processing_status', state.processingStatus);
  sp.set('daynight', state.dayNight);
  sp.set('modis_min_confidence', String(state.modisMinConfidence));
  sp.set('viirs_categories', state.viirsCategories.join(','));

  const res = await fetch(`/api/v1/analytics/compare?${sp.toString()}`, { signal });
  if (!res.ok) {
    let msg = `Period comparison request failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // ignore non-JSON body
    }
    throw new Error(msg);
  }
  return (await res.json()) as PeriodComparisonResponse;
}

export async function fetchAoiComparisonFromApi(params: {
  state: SharedQueryState;
  aoiA: AoiDefinition;
  aoiB: AoiDefinition;
  startDate?: string;
  endDate?: string;
  granularity?: Granularity;
  signal?: AbortSignal;
}): Promise<AoiComparisonResponse | null> {
  const {
    state,
    aoiA,
    aoiB,
    startDate = state.startDate,
    endDate = state.endDate,
    granularity = state.granularity,
    signal,
  } = params;

  const sp = new URLSearchParams();
  if (PRESET_AOIS.some((p) => p.id === aoiA.id)) {
    sp.set('aoi_a_id', aoiA.id);
  } else {
    sp.set('aoi_a_id', aoiA.id);
    sp.set('aoi_a_name', aoiA.name);
    sp.set(
      'bbox_a',
      `${aoiA.bbox.west},${aoiA.bbox.south},${aoiA.bbox.east},${aoiA.bbox.north}`
    );
  }

  if (PRESET_AOIS.some((p) => p.id === aoiB.id)) {
    sp.set('aoi_b_id', aoiB.id);
  } else {
    sp.set('aoi_b_id', aoiB.id);
    sp.set('aoi_b_name', aoiB.name);
    sp.set(
      'bbox_b',
      `${aoiB.bbox.west},${aoiB.bbox.south},${aoiB.bbox.east},${aoiB.bbox.north}`
    );
  }

  sp.set('start_date', startDate);
  sp.set('end_date', endDate);
  sp.set('granularity', granularity);
  sp.set('sensor', state.sensor);
  sp.set('metric', state.calendarMetric);
  sp.set('platforms', state.platforms.join(','));
  sp.set('processing_status', state.processingStatus);
  sp.set('daynight', state.dayNight);
  sp.set('modis_min_confidence', String(state.modisMinConfidence));
  sp.set('viirs_categories', state.viirsCategories.join(','));

  const res = await fetch(`/api/v1/analytics/compare-aois?${sp.toString()}`, { signal });
  if (!res.ok) {
    let msg = `AOI comparison request failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // ignore non-JSON body
    }
    throw new Error(msg);
  }
  return (await res.json()) as AoiComparisonResponse;
}

export async function fetchBoundedObservationsFromApi(params: {
  state: SharedQueryState;
  startUtc?: string;
  endUtc?: string;
  /** Calendar bins use a half-open interval, while the observations API end is inclusive. */
  endUtcIsExclusive?: boolean;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PaginatedObservationsResponse | null> {
  try {
    const { state, limit = 150, signal } = params;
    const sp = new URLSearchParams();
    appendAoiParams(sp, state);
    sp.set('start_datetime_utc', params.startUtc ?? `${state.startDate}T00:00:00Z`);
    const inclusiveEndUtc = params.endUtcIsExclusive && params.endUtc
      ? new Date(Date.parse(params.endUtc) - 1).toISOString()
      : params.endUtc ?? `${state.endDate}T23:59:59Z`;
    sp.set('end_datetime_utc', inclusiveEndUtc);
    sp.set('sensor', state.sensor);
    sp.set('platforms', state.platforms.join(','));
    sp.set('processing_status', state.processingStatus);
    sp.set('daynight', state.dayNight);
    sp.set('modis_min_confidence', String(state.modisMinConfidence));
    sp.set('viirs_categories', state.viirsCategories.join(','));
    sp.set('limit', String(limit));

    const res = await fetch(`/api/v1/observations?${sp.toString()}`, { signal });
    if (!res.ok) return null;
    return (await res.json()) as PaginatedObservationsResponse;
  } catch {
    return null;
  }
}

export async function fetchLiveEonetForClient(): Promise<{
  connected: boolean;
  items: CanonicalObservation[];
  syncedAtUtc: string;
}> {
  try {
    const res = await fetch('/api/v1/eonet/live');
    if (res.ok) {
      const payload = (await res.json()) as {
        connected: boolean;
        count: number;
        synced_at_utc: string;
        items: CanonicalObservation[];
      };
      if (Array.isArray(payload.items) && payload.items.length > 0) {
        return {
          connected: true,
          items: payload.items,
          syncedAtUtc: payload.synced_at_utc || RETRIEVED_AT_UTC,
        };
      }
    }
  } catch {
    // Fallback to direct browser fetch of NASA EONET CORS endpoint
  }

  try {
    const direct = await fetchLiveEonetObservations();
    return {
      connected: direct.observations.length > 0,
      items: direct.observations,
      syncedAtUtc: direct.syncedAtUtc,
    };
  } catch {
    return {
      connected: false,
      items: [],
      syncedAtUtc: RETRIEVED_AT_UTC,
    };
  }
}

function buildEmptyFrpSummary(sensor: 'MODIS' | 'VIIRS'): FrpSummaryStats {
  return {
    sensor,
    unit: 'MW',
    sum_mw: null,
    mean_mw: null,
    median_mw: null,
    p90_mw: null,
    max_mw: null,
    valid_count: 0,
    null_count: 0,
    processing_status_note: 'No server observations loaded for this bin.',
  };
}

export function createEmptyCalendarAnalytics(
  state: SharedQueryState
): CalendarAnalyticsResponse {
  const aoi = getActiveAoi(state);
  const bins = generateTimeBins(state.startDate, state.endDate, state.granularity);
  const emptyModisFrp = buildEmptyFrpSummary('MODIS');
  const emptyViirsFrp = buildEmptyFrpSummary('VIIRS');

  const series: CalendarBinRecord[] = bins.map((bin) => ({
    bin_key: bin.binKey,
    label: bin.label,
    time_bin_start_utc: bin.startUtc,
    time_bin_end_utc: bin.endUtc,
    granularity: state.granularity,
    coverage_state: 'NO_SOURCE_DATA',
    values: {
      MODIS: null,
      VIIRS: null,
    },
    platform_breakdown: {
      TERRA: 0,
      AQUA: 0,
      SNPP: 0,
      NOAA20: 0,
      NOAA21: 0,
    },
    processing_breakdown: {
      NRT: 0,
      RT: 0,
      URT: 0,
      STANDARD: 0,
      UNKNOWN: 0,
    },
    frp_summary: {
      MODIS: emptyModisFrp,
      VIIRS: emptyViirsFrp,
    },
    confidence_breakdown: {
      MODIS_numeric_bins: { low_0_29: 0, nominal_30_79: 0, high_80_100: 0 },
      VIIRS_categorical: { low: 0, nominal: 0, high: 0 },
    },
    pooled_observation_count: null,
    pooled_caveat:
      'No server observations loaded (NO_SOURCE_DATA); synthetic client fallback is disabled.',
    quality: {
      coverage_note:
        'NO_SOURCE_DATA: Server analytics response unavailable or still loading.',
      active_platforms: [],
      unavailable_platforms: state.platforms,
      superseded_nrt_count: 0,
      exact_duplicates_removed: 0,
    },
  }));

  return {
    data_mode: 'LIVE_NASA_FIRMS',
    demo_notice:
      'No server analytics snapshot loaded yet (NO_SOURCE_DATA). Client-side synthetic fallback is disabled.',
    aoi: {
      id: aoi.id,
      name: aoi.name,
      bbox: aoi.bbox,
      timezone: aoi.timezone,
      area_sq_km: aoi.areaSqKm,
    },
    query: {
      start_date: state.startDate,
      end_date: state.endDate,
      granularity: state.granularity,
      metric: state.calendarMetric,
      sensor: state.sensor,
      platforms: state.platforms,
      processing_status: state.processingStatus,
      daynight: state.dayNight,
    },
    method: {
      id: state.sensor === 'ALL' ? 'M2_COMPARATIVE' : 'M1_AGGREGATED',
      version: '1.0.0',
      description:
        'Empty calendar skeleton shown while waiting for backend NASA observation aggregation. All sensor cells remain null (NO_SOURCE_DATA).',
      formula: 'N_{s,p}(A, t) = sum_i 1(x_i in A, tau_i in t, s_i = s, p_i = p)',
      non_claims: [
        'NO_SOURCE_DATA cells indicate unloaded or unavailable backend responses, never zero fire activity.',
      ],
    },
    totals: {
      MODIS_detections: 0,
      VIIRS_detections: 0,
      pooled_observation_count: 0,
      platform_totals: {
        TERRA: 0,
        AQUA: 0,
        SNPP: 0,
        NOAA20: 0,
        NOAA21: 0,
      },
      MODIS_frp: emptyModisFrp,
      VIIRS_frp: emptyViirsFrp,
      superseded_nrt_total: 0,
      duplicates_removed_total: 0,
    },
    thresholds: {
      MODIS: [1, 10, 50, 200],
      VIIRS: [1, 25, 125, 500],
    },
    series,
    provenance: {
      sources: [],
      collections: [],
      retrieved_at_utc: 'Awaiting server response',
      latest_acquisition_utc: 'None loaded',
      archive_checksums: [],
    },
  };
}

function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function generateProvenanceCsv(analytics: CalendarAnalyticsResponse): string {
  const h = analytics.harmonization;
  const csh = analytics.cross_sensor_harmonization;
  const vpn = analytics.viirs_platform_normalization;

  const headerComments = [
    `# FireScope Analytical Export — Active-Fire Observation Activity`,
    `# Data Mode: ${analytics.data_mode} (${analytics.demo_notice})`,
    `# AOI: ${analytics.aoi.name} (ID: ${analytics.aoi.id})`,
    `# Bounding Box (WGS84): west=${analytics.aoi.bbox.west}, south=${analytics.aoi.bbox.south}, east=${analytics.aoi.bbox.east}, north=${analytics.aoi.bbox.north}`,
    `# Time Window (UTC): ${analytics.query.start_date} to ${analytics.query.end_date} | Granularity: ${analytics.query.granularity}`,
    `# Method ID: ${analytics.method.id} v${analytics.method.version}`,
    `# Formula: ${analytics.method.formula}`,
    `# Scientific Caveat 1: Observation counts represent satellite active-fire pixel detections, NOT unique fire incidents or burned area.`,
    `# Scientific Caveat 2: FRP values are pixel-integrated Fire Radiative Power in Megawatts (MW), NOT fire perimeter or burned area.`,
    `# Scientific Caveat 3: pooled_observation_count is an unweighted arithmetic sum of MODIS and VIIRS records, NOT a harmonized cross-sensor metric.`,
    `# Provenance Sources: ${analytics.provenance.sources.join('; ')}`,
    `# Retrieved At (UTC): ${analytics.provenance.retrieved_at_utc} | Latest Acquisition (UTC): ${analytics.provenance.latest_acquisition_utc}`,
    `# Raw File SHA-256 Checksums: ${analytics.provenance.archive_checksums.join(', ')}`,
  ];

  if (csh) {
    headerComments.push(
      `# M2 Cross-Sensor Harmonization: ${csh.method_id} v${csh.method_version} | Spatial Method: ${csh.spatial_concordance.method_id ?? 'M2_GRID_DAILY_025_DEG'} (${csh.spatial_concordance.spatial_resolution ?? '0.25_deg_wgs84_grid'}, ${csh.spatial_concordance.temporal_resolution ?? '1_utc_day'})`,
      `# M2 Spatial Summary: total_active_cells=${csh.spatial_concordance.total_active_cells}, both_sensors_cells=${csh.spatial_concordance.co_located_cells}, modis_only_cells=${csh.spatial_concordance.modis_only_cells}, viirs_only_cells=${csh.spatial_concordance.viirs_only_cells}, jaccard_pct=${csh.spatial_concordance.cell_concordance_pct}%, modis_co_detected_by_viirs_pct=${csh.spatial_concordance.modis_cell_co_detected_pct}%`,
      `# M2 Temporal Summary: co_active_bins=${csh.temporal_concordance.co_active_bins}/${csh.temporal_concordance.total_active_bins} (${csh.temporal_concordance.temporal_jaccard_pct}%), log_r=${csh.temporal_concordance.log_pearson_r ?? 'N/A'}`
    );
  }

  if (vpn) {
    headerComments.push(
      `# VIIRS Exposure-Weighted Normalization: ${vpn.method_id} | Formula: ${vpn.formula}`,
      `# VIIRS Exposure Summary: window_days=${vpn.window_days ?? 'N/A'}, viirs_platform_days=${vpn.viirs_platform_days ?? 'N/A'}, k_eff=${vpn.coverage_status === 'VERIFIED' ? vpn.effective_viirs_platforms ?? 'N/A' : 'N/A'}, raw_viirs=${vpn.raw_viirs_detections}, viirs_per_effective_sat=${vpn.coverage_status === 'VERIFIED' ? vpn.viirs_per_effective_platform ?? 'N/A' : 'N/A'}, integer_k_rate=${vpn.coverage_status === 'VERIFIED' ? vpn.normalized_viirs_per_platform ?? 'N/A' : 'N/A'}`
    );
  }

  if (h) {
    headerComments.push(
      `# M3 Harmonization Method: ${h.diagnostics.method_id} v${h.diagnostics.method_version} (${h.diagnostics.calibration_mode})`,
      `# M3 Formula: ${h.diagnostics.formula_summary}`,
      `# M3 Diagnostics: overlap_bins=${h.diagnostics.active_overlap_bin_count}, per_sat_median_ratio=${h.diagnostics.per_platform_median_ratio ?? 'N/A'}, log_r2=${h.diagnostics.log_r_squared ?? 'N/A'}, validation=${h.diagnostics.validation_scheme}, holdout_mae=${h.diagnostics.holdout_mae ?? 'N/A'}, holdout_rmse=${h.diagnostics.holdout_rmse ?? 'N/A'}`,
      `# M3 Caveat: ${h.diagnostics.scientific_caveat}`
    );
  }

  const m3PointMap = h
    ? new Map(h.points.map((p) => [p.bin_key, p]))
    : null;

  const columns = [
    'bin_key',
    'time_bin_start_utc',
    'time_bin_end_utc',
    'coverage_state',
    'modis_detections',
    'viirs_detections',
    'pooled_observation_count_unweighted',
    'terra_detections',
    'aqua_detections',
    'snpp_detections',
    'noaa20_detections',
    'noaa21_detections',
    'modis_frp_sum_mw',
    'modis_frp_mean_mw',
    'modis_frp_valid_count',
    'viirs_frp_sum_mw',
    'viirs_frp_mean_mw',
    'viirs_frp_valid_count',
    'modis_baseline_status',
    'viirs_baseline_status',
    'coverage_note',
    'modis_active_satellites',
    'viirs_active_satellites',
    'modis_per_satellite',
    'viirs_per_satellite',
    'viirs_platform_days',
    'viirs_effective_platform_count',
    'viirs_per_effective_platform',
    'm2_method_id',
    'm2_spatial_resolution',
    'm2_temporal_resolution',
    'modis_eligible_cells',
    'viirs_eligible_cells',
    'co_detected_cells',
    'modis_only_cells',
    'viirs_only_cells',
    'intersection_count',
    'union_count',
    'jaccard_index',
    'modis_conditional_rate',
    'viirs_conditional_rate',
    'source_backing',
    ...(h
      ? [
          'm3_bridged_modis_equiv',
          'm3_bridged_lower_80',
          'm3_bridged_upper_80',
          'm3_bridged_source',
          'm3_viirs_calibrated_modis_equiv',
        ]
      : []),
  ];

  const rows = analytics.series.map((b) => {
    const isNoData = b.coverage_state === 'NO_SOURCE_DATA';
    const exp = getExpectedActivePlatforms(
      b.time_bin_start_utc,
      b.time_bin_end_utc,
      analytics.query.platforms,
      b.platform_breakdown
    );
    const exposure = computePlatformExposure({
      startUtc: b.time_bin_start_utc,
      endUtc: b.time_bin_end_utc,
      selectedPlatforms: analytics.query.platforms,
      observedBreakdown: b.platform_breakdown,
    });

    const viirsPlatformDays =
      b.viirs_platform_days ?? exposure.viirsPlatformDays;
    const viirsEffCount =
      b.viirs_effective_platform_count ?? exposure.viirsEffectivePlatforms;

    const modisPerSat =
      !isNoData && b.modis_exposure_status === 'VERIFIED' && b.values.MODIS !== null && exp.modis > 0
        ? Number((b.values.MODIS / exp.modis).toFixed(2))
        : '';
    const viirsPerSat =
      !isNoData && b.viirs_exposure_status === 'VERIFIED' && b.values.VIIRS !== null && exp.viirs > 0
        ? Number((b.values.VIIRS / exp.viirs).toFixed(2))
        : '';
    const viirsPerEff =
      !isNoData && b.viirs_exposure_status === 'VERIFIED' && b.values.VIIRS !== null
        ? b.viirs_per_effective_platform ??
          (viirsEffCount > 0 ? Number((b.values.VIIRS / viirsEffCount).toFixed(2)) : '')
        : '';

    const sc = !isNoData ? b.spatial_concordance : undefined;
    const modisCells =
      sc !== undefined
        ? sc.modis_eligible_count ?? sc.co_located_cells + sc.modis_only_cells
        : '';
    const viirsCells =
      sc !== undefined
        ? sc.viirs_eligible_count ?? sc.co_located_cells + sc.viirs_only_cells
        : '';
    const coDetectedCells = sc !== undefined ? sc.co_located_cells : '';
    const modisOnlyCells = sc !== undefined ? sc.modis_only_cells : '';
    const viirsOnlyCells = sc !== undefined ? sc.viirs_only_cells : '';
    const intersectionCount =
      sc !== undefined ? sc.intersection_count ?? sc.co_located_cells : '';
    const unionCount =
      sc !== undefined ? sc.union_count ?? sc.total_active_cells : '';
    const jaccardIdx =
      sc !== undefined
        ? sc.jaccard_index ??
          (sc.cell_concordance_pct !== null && sc.cell_concordance_pct !== undefined
            ? Number((sc.cell_concordance_pct / 100).toFixed(4))
            : '')
        : '';
    const modisCondRate =
      sc !== undefined
        ? sc.modis_conditional_rate ??
          (sc.modis_cell_co_detected_pct !== null
            ? Number((sc.modis_cell_co_detected_pct / 100).toFixed(4))
            : '')
        : '';
    const viirsCondRate =
      sc !== undefined
        ? sc.viirs_conditional_rate ??
          (sc.viirs_cell_co_detected_pct !== null
            ? Number((sc.viirs_cell_co_detected_pct / 100).toFixed(4))
            : '')
        : '';

    const m3Pt = m3PointMap?.get(b.bin_key);

    return [
      b.bin_key,
      b.time_bin_start_utc,
      b.time_bin_end_utc,
      b.coverage_state,
      b.values.MODIS ?? 'NO_SOURCE_DATA',
      b.values.VIIRS ?? 'NO_SOURCE_DATA',
      b.pooled_observation_count ?? 'NO_SOURCE_DATA',
      isNoData ? '' : b.platform_breakdown.TERRA,
      isNoData ? '' : b.platform_breakdown.AQUA,
      isNoData ? '' : b.platform_breakdown.SNPP,
      isNoData ? '' : b.platform_breakdown.NOAA20,
      isNoData ? '' : b.platform_breakdown.NOAA21,
      b.frp_summary.MODIS.sum_mw ?? '',
      b.frp_summary.MODIS.mean_mw ?? '',
      isNoData ? '' : b.frp_summary.MODIS.valid_count,
      b.frp_summary.VIIRS.sum_mw ?? '',
      b.frp_summary.VIIRS.mean_mw ?? '',
      isNoData ? '' : b.frp_summary.VIIRS.valid_count,
      escapeCsvCell(b.seasonal_baseline?.MODIS.status_label ?? ''),
      escapeCsvCell(b.seasonal_baseline?.VIIRS.status_label ?? ''),
      escapeCsvCell(b.quality.coverage_note),
      isNoData ? '' : exp.modis,
      isNoData ? '' : exp.viirs,
      modisPerSat,
      viirsPerSat,
      isNoData ? '' : viirsPlatformDays,
      isNoData ? '' : viirsEffCount,
      viirsPerEff,
      isNoData ? 'M2_UNAVAILABLE' : sc?.method_id ?? 'M2_GRID_DAILY_025_DEG',
      isNoData ? '' : sc?.spatial_resolution ?? '0.25_deg_wgs84_grid',
      isNoData ? '' : sc?.temporal_resolution ?? '1_utc_day',
      modisCells,
      viirsCells,
      coDetectedCells,
      modisOnlyCells,
      viirsOnlyCells,
      intersectionCount,
      unionCount,
      jaccardIdx,
      modisCondRate,
      viirsCondRate,
      isNoData ? 'NO_SOURCE_DATA' : sc?.source_backing ?? analytics.data_mode,
      ...(h
        ? [
            m3Pt?.bridged_modis_equiv ?? '',
            m3Pt?.bridged_lower_80 ?? '',
            m3Pt?.bridged_upper_80 ?? '',
            escapeCsvCell(m3Pt?.bridged_source ?? ''),
            m3Pt?.viirs_calibrated_modis_equiv ?? '',
          ]
        : []),
    ];
  });

  return [...headerComments, columns.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
