import {
  ALL_ARCHIVE_OBSERVATIONS,
  LATEST_ACQUISITION_UTC,
  PLATFORM_REGISTRY,
  PRESET_AOIS,
  RAW_ARCHIVE_MANIFEST,
  RETRIEVED_AT_UTC,
} from '../data/firmsArchiveData';
import {
  aggregateCalendarAnalytics,
  deduplicateAndSupersedeObservations,
  isPointInAoi,
} from '../science/fireScience';
import {
  AoiDefinition,
  CalendarAnalyticsResponse,
  CanonicalObservation,
  DataStatusResponse,
  MapHotspotsResponse,
  PaginatedObservationsResponse,
  SharedQueryState,
} from '../types/firescope';
import { fetchLiveEonetObservations } from './eonetLiveService';

export function getActiveAoi(state: SharedQueryState): AoiDefinition {
  if (state.customAoi && state.aoiId === state.customAoi.id) {
    return state.customAoi;
  }
  return PRESET_AOIS.find((a) => a.id === state.aoiId) ?? PRESET_AOIS[0];
}

export function getLocalDataStatus(): DataStatusResponse {
  return {
    status: 'PARTIAL_PLATFORM_GAP',
    data_mode: 'DEMO_SNAPSHOT',
    demo_banner_text:
      'NASA FIRMS Live Open Data Streams (MODIS C6.1 & VIIRS C2) + Archive Baseline.',
    retrieved_at_utc: RETRIEVED_AT_UTC,
    latest_acquisition_utc: LATEST_ACQUISITION_UTC,
    live_firms_connected: false,
    live_firms_count: 0,
    live_firms_synced_at_utc: RETRIEVED_AT_UTC,
    firms_map_key_configured: false,
    live_eonet_connected: false,
    live_eonet_event_count: 0,
    live_eonet_synced_at_utc: RETRIEVED_AT_UTC,
    firms_area_api_constraints: {
      day_range_min: 1,
      day_range_max: 5,
      transactions_per_10_min: 5000,
      nrt_to_standard_lag_months: 5,
      rt_urt_retention_hours: 6,
    },
    platforms: PLATFORM_REGISTRY,
    raw_archive_manifest: RAW_ARCHIVE_MANIFEST,
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

function appendAoiParams(searchParams: URLSearchParams, state: SharedQueryState) {
  const aoi = getActiveAoi(state);
  if (state.customAoi && state.aoiId === state.customAoi.id) {
    const b = aoi.bbox;
    searchParams.set('bbox', `${b.west},${b.south},${b.east},${b.north}`);
    searchParams.set('aoi_name', aoi.name);
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
  sp.set('max_points', zoom <= 3 ? '4500' : '6000');

  const res = await fetch(`/api/v1/map/hotspots?${sp.toString()}`, { signal });
  if (!res.ok) return null;
  return (await res.json()) as MapHotspotsResponse;
}

export async function fetchCalendarAnalyticsFromApi(
  state: SharedQueryState,
  signal?: AbortSignal
): Promise<CalendarAnalyticsResponse | null> {
  try {
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
    if (!res.ok) return null;
    return (await res.json()) as CalendarAnalyticsResponse;
  } catch {
    return null;
  }
}

export async function fetchBoundedObservationsFromApi(params: {
  state: SharedQueryState;
  startUtc?: string;
  endUtc?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PaginatedObservationsResponse | null> {
  try {
    const { state, limit = 150, signal } = params;
    const sp = new URLSearchParams();
    appendAoiParams(sp, state);
    sp.set('start_datetime_utc', params.startUtc ?? `${state.startDate}T00:00:00Z`);
    sp.set('end_datetime_utc', params.endUtc ?? `${state.endDate}T23:59:59Z`);
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

export function computeCalendarFromState(
  state: SharedQueryState,
  liveEonetRecords: CanonicalObservation[] = []
): CalendarAnalyticsResponse {
  const aoi = getActiveAoi(state);
  const combinedRecords =
    liveEonetRecords.length > 0
      ? [...liveEonetRecords, ...ALL_ARCHIVE_OBSERVATIONS]
      : ALL_ARCHIVE_OBSERVATIONS;

  const response = aggregateCalendarAnalytics({
    allRawRecords: combinedRecords,
    aoi,
    startDate: state.startDate,
    endDate: state.endDate,
    granularity: state.granularity,
    sensor: state.sensor,
    platforms: state.platforms,
    processingStatus: state.processingStatus,
    dayNight: state.dayNight,
    modisMinConfidence: state.modisMinConfidence,
    viirsCategories: state.viirsCategories,
    metric: state.calendarMetric,
    platformRegistry: PLATFORM_REGISTRY,
    retrievedAtUtc: RETRIEVED_AT_UTC,
    latestAcquisitionUtc: LATEST_ACQUISITION_UTC,
    archiveChecksums: RAW_ARCHIVE_MANIFEST.map((m) => m.sha256_checksum),
  });

  if (liveEonetRecords.length > 0) {
    response.data_mode = 'LIVE_NASA_EONET_HYBRID';
    response.demo_notice = `LIVE NASA EONET v3 Wildfire Stream (${liveEonetRecords.length} active events) + NASA FIRMS Archive Baseline (MODIS C6.1 & VIIRS C2).`;
    response.provenance.sources = [
      'NASA EONET v3 Live Wildfire API (https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires)',
      ...response.provenance.sources,
    ];
  }

  return response;
}

export function queryBoundedObservations(params: {
  state: SharedQueryState;
  liveEonetRecords?: CanonicalObservation[];
  startUtc?: string;
  endUtc?: string;
  limit?: number;
  cursorOffset?: number;
}): PaginatedObservationsResponse {
  const { state, liveEonetRecords = [], limit = 50, cursorOffset = 0 } = params;
  const aoi = getActiveAoi(state);
  const startMs = Date.parse(params.startUtc ?? `${state.startDate}T00:00:00Z`);
  const endMs = Date.parse(params.endUtc ?? `${state.endDate}T23:59:59Z`);

  const combinedRecords =
    liveEonetRecords.length > 0
      ? [...liveEonetRecords, ...ALL_ARCHIVE_OBSERVATIONS]
      : ALL_ARCHIVE_OBSERVATIONS;

  const { canonical } = deduplicateAndSupersedeObservations(combinedRecords);

  const matching = canonical
    .filter((r) => {
      if (!isPointInAoi(r.latitude, r.longitude, aoi)) return false;
      const t = Date.parse(r.acq_datetime_utc);
      if (t < startMs || t > endMs) return false;
      if (state.sensor !== 'ALL' && r.sensor !== state.sensor) return false;
      if (state.platforms.length > 0 && !state.platforms.includes(r.platform)) return false;
      if (
        state.processingStatus !== 'ALL' &&
        r.processing_status !== state.processingStatus
      ) {
        return false;
      }
      if (state.dayNight !== 'ALL' && r.daynight_native !== state.dayNight) {
        return false;
      }
      if (r.sensor === 'MODIS' && typeof r.confidence_native === 'number') {
        if (r.confidence_native < state.modisMinConfidence) return false;
      }
      if (r.sensor === 'VIIRS' && typeof r.confidence_native === 'string') {
        const cat = r.confidence_native as 'low' | 'nominal' | 'high';
        if (
          ['low', 'nominal', 'high'].includes(cat) &&
          !state.viirsCategories.includes(cat)
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => Date.parse(b.acq_datetime_utc) - Date.parse(a.acq_datetime_utc));

  const slice = matching.slice(cursorOffset, cursorOffset + limit);
  const nextCursor =
    cursorOffset + limit < matching.length ? String(cursorOffset + limit) : null;

  return {
    data_mode: liveEonetRecords.length > 0 ? 'LIVE_NASA_EONET_HYBRID' : 'DEMO_SNAPSHOT',
    items: slice,
    total_matching: matching.length,
    limit,
    next_cursor: nextCursor,
    method: {
      id: 'M0_RAW',
      version: '1.0.0',
      note: 'M0_RAW canonical observations preserving native sensor confidence, pixel footprint (scan/track), and processing version.',
    },
    provenance: {
      sources:
        liveEonetRecords.length > 0
          ? [
              'NASA EONET v3 Live Wildfire API',
              'NASA FIRMS Archive Snapshot (MODIS C6.1 & VIIRS C2)',
            ]
          : ['NASA FIRMS Archive Snapshot (MODIS C6.1 & VIIRS C2)'],
      retrieved_at_utc: RETRIEVED_AT_UTC,
    },
  };
}

export function generateProvenanceCsv(analytics: CalendarAnalyticsResponse): string {
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
  ];

  const rows = analytics.series.map((b) => [
    b.bin_key,
    b.time_bin_start_utc,
    b.time_bin_end_utc,
    b.coverage_state,
    b.values.MODIS ?? 'NO_SOURCE_DATA',
    b.values.VIIRS ?? 'NO_SOURCE_DATA',
    b.pooled_observation_count ?? 'NO_SOURCE_DATA',
    b.platform_breakdown.TERRA,
    b.platform_breakdown.AQUA,
    b.platform_breakdown.SNPP,
    b.platform_breakdown.NOAA20,
    b.platform_breakdown.NOAA21,
    b.frp_summary.MODIS.sum_mw ?? '',
    b.frp_summary.MODIS.mean_mw ?? '',
    b.frp_summary.MODIS.valid_count,
    b.frp_summary.VIIRS.sum_mw ?? '',
    b.frp_summary.VIIRS.mean_mw ?? '',
    b.frp_summary.VIIRS.valid_count,
    `"${(b.seasonal_baseline?.MODIS.status_label ?? '').replace(/"/g, '""')}"`,
    `"${(b.seasonal_baseline?.VIIRS.status_label ?? '').replace(/"/g, '""')}"`,
    `"${b.quality.coverage_note.replace(/"/g, '""')}"`,
  ]);

  return [...headerComments, columns.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
