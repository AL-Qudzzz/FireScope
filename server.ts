import express from 'express';
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  ALL_ARCHIVE_OBSERVATIONS,
  LATEST_ACQUISITION_UTC,
  PLATFORM_REGISTRY,
  PRESET_AOIS,
  RAW_ARCHIVE_MANIFEST,
  RETRIEVED_AT_UTC,
} from './src/data/firmsArchiveData';
import {
  aggregateCalendarAnalytics,
  deduplicateAndSupersedeObservations,
  isPointInAoi,
  isVerifiedOffshoreMarineCoordinate,
  validateBoundingBox,
} from './src/science/fireScience';
import {
  aggregateCalendarFromBuckets,
  aggregateObservationsToGrid,
  buildAoiComparisonResponse,
  buildPeriodComparisonResponse,
  observationsToDailyBuckets,
} from './src/science/comparisonScience';
import {
  AoiDefinition,
  CalendarAnalyticsResponse,
  CanonicalObservation,
  DataSourceBacking,
  DataStatusResponse,
  Granularity,
  MapGridCell,
  MapGridResponse,
  MapHotspotsResponse,
  PaginatedObservationsResponse,
  PlatformId,
  ProcessingStatus,
  SensorFilter,
  YoyYearSummary,
} from './src/types/firescope';
import { fetchLiveEonetObservations } from './src/services/eonetLiveService';
import {
  fetchFirmsAreaApiWithKey,
  fetchLiveFirmsGlobalStreams,
  LiveFirmsSnapshot,
  queryLiveFirmsViewport,
} from './src/services/firmsLiveService';
import {
  getParquetManifest,
  isAoiInParquetCoverage,
  queryParquetDailyBuckets,
  queryParquetHistoricalMonthlyTotals,
  queryParquetMapGrid,
  queryParquetRecentObservations,
} from './src/services/parquetService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sha256Hex(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getConfiguredFirmsMapKey(): string | null {
  const raw = (process.env.FIRMS_MAP_KEY ?? '').trim();
  if (!raw || raw === 'YOUR_NASA_FIRMS_MAP_KEY_HERE') return null;
  return raw;
}

function prevUtcDate(dateStr: string): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ms)) return dateStr;
  return new Date(ms - 86400000).toISOString().slice(0, 10);
}

function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function resolveYearMmDd(year: number, mmdd: string): string {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (mmdd === '02-29' && !isLeap) {
    return `${year}-02-28`;
  }
  return `${year}-${mmdd}`;
}

let cachedFirmsSnapshot: LiveFirmsSnapshot | null = null;
let lastFirmsSyncMs = 0;
let inFlightFirmsPromise: Promise<LiveFirmsSnapshot> | null = null;

async function ensureLiveFirmsLoaded(): Promise<LiveFirmsSnapshot> {
  const now = Date.now();
  if (
    cachedFirmsSnapshot &&
    cachedFirmsSnapshot.observations.length > 0 &&
    now - lastFirmsSyncMs < 10 * 60 * 1000
  ) {
    return cachedFirmsSnapshot;
  }
  if (inFlightFirmsPromise) {
    return inFlightFirmsPromise;
  }

  inFlightFirmsPromise = (async () => {
    try {
      const snap = await fetchLiveFirmsGlobalStreams(sha256Hex);
      cachedFirmsSnapshot = snap;
      lastFirmsSyncMs = Date.now();
      return snap;
    } catch {
      if (cachedFirmsSnapshot) {
        return cachedFirmsSnapshot;
      }
      return {
        observations: [],
        feedStats: [],
        syncedAtUtc: RETRIEVED_AT_UTC,
        latestAcquisitionUtc: LATEST_ACQUISITION_UTC,
        minDate: '2026-11-12',
        maxDate: '2026-11-13',
        connected: false,
      };
    } finally {
      inFlightFirmsPromise = null;
    }
  })();

  return inFlightFirmsPromise;
}

let cachedEonetObservations: CanonicalObservation[] = [];
let lastEonetSyncMs = 0;
let lastEonetSyncedAtUtc = RETRIEVED_AT_UTC;
let isEonetConnected = false;

async function ensureLiveEonetLoaded(): Promise<CanonicalObservation[]> {
  const now = Date.now();
  if (cachedEonetObservations.length > 0 && now - lastEonetSyncMs < 5 * 60 * 1000) {
    return cachedEonetObservations;
  }
  try {
    const { observations, syncedAtUtc } = await fetchLiveEonetObservations();
    cachedEonetObservations = observations;
    lastEonetSyncMs = now;
    lastEonetSyncedAtUtc = syncedAtUtc;
    isEonetConnected = true;
  } catch {
    // Keep existing cache gracefully if offline
  }
  return cachedEonetObservations;
}

function parseAoiFromParams(
  aoiIdRaw: unknown,
  bboxRaw: unknown,
  aoiNameRaw: unknown
): {
  aoi?: AoiDefinition;
  error?: { code: string; message: string };
} {
  const aoiId = typeof aoiIdRaw === 'string' ? aoiIdRaw.trim() : '';
  const bboxStr = typeof bboxRaw === 'string' ? bboxRaw.trim() : '';

  if (bboxStr) {
    const parts = bboxStr.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return {
        error: {
          code: 'INVALID_BBOX_FORMAT',
          message: 'bbox must be 4 comma-separated numbers: west,south,east,north.',
        },
      };
    }
    const bbox = { west: parts[0], south: parts[1], east: parts[2], north: parts[3] };
    const check = validateBoundingBox(bbox);
    if (!check.valid) {
      return {
        error: {
          code: 'INVALID_BBOX_BOUNDS',
          message: check.error ?? 'Invalid bounding box coordinates.',
        },
      };
    }
    const preset = PRESET_AOIS.find((a) => a.id === aoiId);
    const R = 6371;
    const latSpanKm = Math.abs(bbox.north - bbox.south) * (Math.PI / 180) * R;
    const midLatRad = ((bbox.north + bbox.south) / 2) * (Math.PI / 180);
    const lngSpanKm =
      Math.abs(bbox.east - bbox.west) * (Math.PI / 180) * R * Math.cos(midLatRad);
    return {
      aoi: {
        id: preset ? preset.id : aoiId || 'custom-bbox',
        name:
          typeof aoiNameRaw === 'string' && aoiNameRaw.trim()
            ? aoiNameRaw.trim()
            : preset
            ? preset.name
            : `Custom AOI (${bbox.west.toFixed(2)}, ${bbox.south.toFixed(2)} to ${bbox.east.toFixed(2)}, ${bbox.north.toFixed(2)})`,
        regionLabel: preset ? preset.regionLabel : 'Custom Coordinates',
        description: preset ? preset.description : 'User-defined WGS84 bounding box.',
        geometryType: 'BBOX',
        bbox,
        timezone: preset ? preset.timezone : 'UTC',
        utcOffsetLabel: preset ? preset.utcOffsetLabel : 'UTC+00:00',
        areaSqKm: Math.max(1, Math.round(latSpanKm * lngSpanKm)),
        biome: preset ? preset.biome : 'User Selected Area',
      },
    };
  }

  if (aoiId) {
    const found = PRESET_AOIS.find((a) => a.id === aoiId);
    if (!found) {
      return {
        error: {
          code: 'UNKNOWN_AOI_ID',
          message: `Unknown aoi_id "${aoiId}". Valid presets: ${PRESET_AOIS.map((a) => a.id).join(', ')}.`,
        },
      };
    }
    return { aoi: found };
  }

  return { aoi: PRESET_AOIS[0] };
}

const VALID_PLATFORM_IDS: PlatformId[] = ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'];
const VALID_PROCESSING_STATUSES = ['ALL', 'STANDARD', 'NRT', 'URT', 'RT', 'UNKNOWN'] as const;
const VALID_VIIRS_CATEGORIES = ['low', 'nominal', 'high'] as const;

function parseSharedFilters(query: Record<string, unknown>): {
  sensor?: SensorFilter;
  platforms?: PlatformId[];
  processingStatus?: ProcessingStatus | 'ALL';
  dayNight?: 'ALL' | 'D' | 'N';
  modisMinConfidence?: number;
  viirsCategories?: Array<'low' | 'nominal' | 'high'>;
  error?: { code: string; message: string };
} {
  const sensor = String(query.sensor ?? 'ALL').trim().toUpperCase() as SensorFilter;
  if (!['ALL', 'MODIS', 'VIIRS'].includes(sensor)) {
    return {
      error: {
        code: 'INVALID_SENSOR',
        message: 'sensor must be one of: MODIS, VIIRS, ALL.',
      },
    };
  }

  let platforms: PlatformId[];
  if (query.platforms === undefined) {
    platforms = [...VALID_PLATFORM_IDS];
  } else if (typeof query.platforms === 'string') {
    const rawTokens = query.platforms
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);
    const invalidTokens = rawTokens.filter(
      (p) => !VALID_PLATFORM_IDS.includes(p as PlatformId)
    );
    if (invalidTokens.length > 0) {
      return {
        error: {
          code: 'INVALID_PLATFORMS',
          message: `Invalid platform(s): ${invalidTokens.join(', ')}. Allowed: ${VALID_PLATFORM_IDS.join(', ')}.`,
        },
      };
    }
    platforms = Array.from(new Set(rawTokens)) as PlatformId[];
  } else {
    return {
      error: {
        code: 'INVALID_PLATFORMS',
        message: 'platforms must be a comma-separated string of platform IDs.',
      },
    };
  }

  const processingStatusRaw = String(query.processing_status ?? 'ALL').trim().toUpperCase();
  if (
    !VALID_PROCESSING_STATUSES.includes(
      processingStatusRaw as (typeof VALID_PROCESSING_STATUSES)[number]
    )
  ) {
    return {
      error: {
        code: 'INVALID_PROCESSING_STATUS',
        message: `processing_status must be one of: ${VALID_PROCESSING_STATUSES.join(', ')}.`,
      },
    };
  }
  const processingStatus = processingStatusRaw as ProcessingStatus | 'ALL';

  const dayNightRaw = String(query.daynight ?? 'ALL').trim().toUpperCase();
  if (!['ALL', 'D', 'N'].includes(dayNightRaw)) {
    return {
      error: {
        code: 'INVALID_DAYNIGHT',
        message: 'daynight must be one of: ALL, D, N.',
      },
    };
  }
  const dayNight = dayNightRaw as 'ALL' | 'D' | 'N';

  const modisMinConfidence =
    query.modis_min_confidence !== undefined && query.modis_min_confidence !== ''
      ? Number(query.modis_min_confidence)
      : 0;
  if (!Number.isFinite(modisMinConfidence) || modisMinConfidence < 0 || modisMinConfidence > 100) {
    return {
      error: {
        code: 'INVALID_MODIS_CONFIDENCE',
        message: 'modis_min_confidence must be a finite number between 0 and 100.',
      },
    };
  }

  let viirsCategories: Array<'low' | 'nominal' | 'high'>;
  if (query.viirs_categories === undefined) {
    viirsCategories = [...VALID_VIIRS_CATEGORIES];
  } else if (typeof query.viirs_categories === 'string') {
    const rawCats = query.viirs_categories
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    const invalidCats = rawCats.filter(
      (c) => !VALID_VIIRS_CATEGORIES.includes(c as (typeof VALID_VIIRS_CATEGORIES)[number])
    );
    if (invalidCats.length > 0) {
      return {
        error: {
          code: 'INVALID_VIIRS_CATEGORIES',
          message: `Invalid viirs_categories: ${invalidCats.join(', ')}. Allowed: low, nominal, high.`,
        },
      };
    }
    viirsCategories = Array.from(new Set(rawCats)) as Array<'low' | 'nominal' | 'high'>;
  } else {
    return {
      error: {
        code: 'INVALID_VIIRS_CATEGORIES',
        message: 'viirs_categories must be a comma-separated string.',
      },
    };
  }

  return {
    sensor,
    platforms,
    processingStatus,
    dayNight,
    modisMinConfidence,
    viirsCategories,
  };
}

/**
 * Shared server-side analytical aggregator combining DuckDB Parquet (real Indonesia 2001-2026),
 * live NASA FIRMS 24h streams (global), and explicitly-labeled fixture fallback (non-Indonesia historical).
 * Strictly prevents overlapping UTC dates from being double counted.
 */
async function computeServerCalendarAnalytics(params: {
  aoi: AoiDefinition;
  startDate: string;
  endDate: string;
  granularity: Granularity;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence: number;
  viirsCategories: Array<'low' | 'nominal' | 'high'>;
  metric: 'detection_count' | 'frp_mw';
  firmsSnap: LiveFirmsSnapshot;
  includeBaselineHistory?: boolean;
}): Promise<{ response: CalendarAnalyticsResponse; dataBacking: DataSourceBacking }> {
  const {
    aoi,
    startDate,
    endDate,
    granularity,
    sensor,
    platforms,
    processingStatus,
    dayNight,
    modisMinConfidence,
    viirsCategories,
    metric,
    firmsSnap,
    includeBaselineHistory = true,
  } = params;

  const manifest = getParquetManifest();
  const useParquet = Boolean(manifest?.available && isAoiInParquetCoverage(aoi));

  const liveCutoffDate = firmsSnap.connected ? firmsSnap.minDate : '9999-12-31';
  const liveMaxDate = firmsSnap.connected ? firmsSnap.maxDate : '2026-11-12';

  // Live FIRMS records strictly filtered to [max(startDate, liveCutoffDate), endDate] and AOI
  const rawLiveFiltered = firmsSnap.connected
    ? firmsSnap.observations.filter(
        (r) =>
          r.acq_date >= startDate &&
          r.acq_date <= endDate &&
          r.acq_date >= liveCutoffDate &&
          isPointInAoi(r.latitude, r.longitude, aoi) &&
          (sensor === 'ALL' || r.sensor === sensor) &&
          platforms.includes(r.platform) &&
          (processingStatus === 'ALL' || r.processing_status === processingStatus) &&
          (dayNight === 'ALL' || r.daynight_native === dayNight) &&
          (r.sensor !== 'MODIS' ||
            typeof r.confidence_native !== 'number' ||
            r.confidence_native >= modisMinConfidence) &&
          (r.sensor !== 'VIIRS' ||
            typeof r.confidence_native !== 'string' ||
            viirsCategories.includes(r.confidence_native as 'low' | 'nominal' | 'high'))
      )
    : [];

  const dedupedLive = deduplicateAndSupersedeObservations(rawLiveFiltered);

  if (useParquet && manifest) {
    const parquetEndDate = firmsSnap.connected
      ? endDate < liveCutoffDate
        ? endDate
        : prevUtcDate(liveCutoffDate)
      : endDate;

    const parquetBuckets =
      startDate <= parquetEndDate
        ? await queryParquetDailyBuckets({
            bbox: aoi.bbox,
            startDate,
            endDate: parquetEndDate,
            sensor,
            platforms,
            processingStatus,
            dayNight,
            modisMinConfidence,
            viirsCategories,
          })
        : [];

    const historicalMonthTotals = includeBaselineHistory
      ? await queryParquetHistoricalMonthlyTotals({
          bbox: aoi.bbox,
          sensor,
          platforms,
          processingStatus,
          dayNight,
          modisMinConfidence,
          viirsCategories,
        })
      : [];

    const liveBuckets = observationsToDailyBuckets(dedupedLive.canonical);
    const combinedBuckets = [...parquetBuckets, ...liveBuckets];

    const hasParquetRows = startDate <= parquetEndDate;
    const hasLiveRows = endDate >= liveCutoffDate && firmsSnap.connected;
    const dataBacking: DataSourceBacking =
      hasParquetRows && hasLiveRows
        ? 'HYBRID_PARQUET_AND_LIVE'
        : hasLiveRows
        ? 'LIVE_NASA_FIRMS'
        : 'REAL_NASA_ARCHIVE_PARQUET';

    const sources: string[] = [];
    if (hasParquetRows) {
      sources.push(
        `NASA FIRMS Official Archive Parquet (${manifest.canonical_rows_total.toLocaleString()} Indonesia records, ${manifest.date_range.min_date}–${manifest.date_range.max_date})`
      );
    }
    if (hasLiveRows) {
      sources.push(
        'NASA FIRMS Live Open Data 24h CSV Streams (MODIS C6.1, VIIRS NOAA-20 & NOAA-21 C2)'
      );
    }

    const checksums = [
      ...(hasParquetRows ? manifest.source_files.map((f) => f.sha256_checksum) : []),
      ...(hasLiveRows ? firmsSnap.feedStats.map((f) => f.sha256) : []),
    ];

    const response = aggregateCalendarFromBuckets({
      buckets: combinedBuckets,
      historicalMonthTotals,
      aoi,
      startDate,
      endDate,
      granularity,
      sensor,
      platforms,
      processingStatus,
      dayNight,
      metric,
      platformRegistry: PLATFORM_REGISTRY,
      archiveCoverageStart: manifest.date_range.min_date,
      archiveCoverageEnd: firmsSnap.connected ? liveMaxDate : manifest.date_range.max_date,
      dataMode: firmsSnap.connected ? 'LIVE_NASA_FIRMS' : 'DEMO_SNAPSHOT',
      demoNotice:
        hasParquetRows && hasLiveRows
          ? `REAL NASA FIRMS DATA — DuckDB Parquet Archive (${manifest.date_range.min_date}–${parquetEndDate}) + Live 24h FIRMS (${liveCutoffDate}–${liveMaxDate}).`
          : hasParquetRows
          ? `REAL NASA FIRMS PARQUET ARCHIVE — ${manifest.canonical_rows_total.toLocaleString()} deduplicated NASA observations (${manifest.date_range.min_date}–${manifest.date_range.max_date}).`
          : `LIVE NASA FIRMS Official Global Active-Fire Feeds (${firmsSnap.observations.length.toLocaleString()} observations synced ${firmsSnap.syncedAtUtc}).`,
      sources,
      retrievedAtUtc: firmsSnap.connected ? firmsSnap.syncedAtUtc : manifest.generated_at_utc,
      latestAcquisitionUtc: firmsSnap.connected
        ? firmsSnap.latestAcquisitionUtc
        : LATEST_ACQUISITION_UTC,
      archiveChecksums: checksums,
      supersededNrtTotal:
        (hasParquetRows ? manifest.superseded_nrt_count : 0) + dedupedLive.supersededNrtCount,
      duplicatesRemovedTotal:
        (hasParquetRows ? manifest.exact_duplicates_removed : 0) +
        dedupedLive.exactDuplicatesRemoved,
    });

    return { response, dataBacking };
  }

  // Non-Indonesia global / fixture path (strictly non-overlapping by liveCutoffDate)
  const relevantLive = firmsSnap.observations.filter(
    (r) =>
      r.acq_date >= startDate &&
      r.acq_date <= endDate &&
      r.acq_date >= liveCutoffDate &&
      isPointInAoi(r.latitude, r.longitude, aoi)
  );
  const relevantArchive =
    startDate < liveCutoffDate && startDate <= '2026-11-11'
      ? ALL_ARCHIVE_OBSERVATIONS.filter(
          (r) =>
            r.acq_date >= startDate &&
            r.acq_date <= endDate &&
            r.acq_date < liveCutoffDate &&
            isPointInAoi(r.latitude, r.longitude, aoi)
        )
      : [];

  const combinedRecords = [...relevantLive, ...relevantArchive];
  const response = aggregateCalendarAnalytics({
    allRawRecords: combinedRecords,
    aoi,
    startDate,
    endDate,
    granularity,
    sensor,
    platforms,
    processingStatus,
    dayNight,
    modisMinConfidence,
    viirsCategories,
    metric: metric === 'frp_mw' ? 'frp_mw' : 'detection_count',
    platformRegistry: PLATFORM_REGISTRY,
    retrievedAtUtc: firmsSnap.connected ? firmsSnap.syncedAtUtc : RETRIEVED_AT_UTC,
    latestAcquisitionUtc: firmsSnap.connected
      ? firmsSnap.latestAcquisitionUtc
      : LATEST_ACQUISITION_UTC,
    archiveChecksums: [
      ...firmsSnap.feedStats.map((f) => f.sha256),
      ...RAW_ARCHIVE_MANIFEST.map((m) => m.sha256_checksum),
    ],
  });

  if (firmsSnap.connected && relevantArchive.length === 0) {
    response.data_mode = 'LIVE_NASA_FIRMS';
    response.demo_notice = `LIVE NASA FIRMS Official Global Active-Fire Feeds (${firmsSnap.observations.length.toLocaleString()} observations synced ${firmsSnap.syncedAtUtc}).`;
    response.provenance.sources = [
      'NASA FIRMS Live Open Data CSV Streams (MODIS C6.1, VIIRS NOAA-20 & NOAA-21 C2)',
    ];
    return { response, dataBacking: 'LIVE_NASA_FIRMS' };
  }

  if (relevantArchive.length > 0 && firmsSnap.connected) {
    response.data_mode = 'LIVE_NASA_FIRMS';
    response.demo_notice =
      'DEMO FIXTURE BASELINE (non-Indonesia 2024–2026-11-11 sample) + LIVE NASA FIRMS 24h Global Feeds. Switch to Indonesia AOIs for 8.91M real historical NASA Parquet observations (2001–2026).';
    response.provenance.sources = [
      'NASA FIRMS Live Open Data CSV Streams (24h Global)',
      'FireScope Synthetic Regional Fixture Baseline (Non-Indonesia 2024–2026-11-11)',
    ];
  }

  return { response, dataBacking: 'DEMO_FIXTURE_BASELINE' };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (req.path.startsWith('/api/') || req.path === '/health') {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  app.use(express.json({ limit: '16kb' }));

  ensureLiveFirmsLoaded().catch(() => {});
  ensureLiveEonetLoaded().catch(() => {});

  // 1. GET /health
  app.get('/health', (_req, res) => {
    const manifest = getParquetManifest();
    res.json({
      status: 'ok',
      service: 'firescope-api',
      version: '1.0.0',
      parquet_available: Boolean(manifest?.available),
      parquet_canonical_rows: manifest?.canonical_rows_total ?? 0,
      live_firms_connected: Boolean(cachedFirmsSnapshot?.connected),
      live_firms_count: cachedFirmsSnapshot?.observations.length ?? 0,
      live_eonet_connected: isEonetConnected,
      live_eonet_count: cachedEonetObservations.length,
      timestamp_utc: new Date().toISOString(),
    });
  });

  // 1b. GET /api/v1/eonet/live
  app.get('/api/v1/eonet/live', async (_req, res) => {
    const liveItems = await ensureLiveEonetLoaded();
    res.json({
      connected: isEonetConnected,
      count: liveItems.length,
      synced_at_utc: lastEonetSyncedAtUtc,
      source_url: 'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires',
      items: liveItems,
    });
  });

  // 2. GET /api/v1/data/status
  app.get('/api/v1/data/status', async (_req, res) => {
    const [firmsSnap, eonetItems] = await Promise.all([
      ensureLiveFirmsLoaded(),
      ensureLiveEonetLoaded(),
    ]);
    const mapKeyConfigured = Boolean(getConfiguredFirmsMapKey());
    const manifest = getParquetManifest();

    const dataMode: DataStatusResponse['data_mode'] = firmsSnap.connected
      ? 'LIVE_NASA_FIRMS'
      : isEonetConnected
      ? 'LIVE_NASA_EONET_HYBRID'
      : 'DEMO_SNAPSHOT';

    const dynamicPlatforms = PLATFORM_REGISTRY.map((p) => {
      const pqCov = manifest?.platform_coverage?.find((c) => c.platform === p.platform_id);
      const patched = pqCov
        ? {
            ...p,
            first_observation_date: pqCov.first_date,
          }
        : p;

      if (!firmsSnap.connected) return patched;
      if (patched.platform_id === 'SNPP') {
        const snppFeed = firmsSnap.feedStats.find((f) => f.platform === 'SNPP');
        if (!snppFeed || snppFeed.row_count === 0) {
          return {
            ...patched,
            status_checked_at_utc: firmsSnap.syncedAtUtc,
          };
        }
      }
      if (['TERRA', 'AQUA', 'NOAA20', 'NOAA21'].includes(patched.platform_id)) {
        return {
          ...patched,
          last_observation_date: firmsSnap.maxDate,
          latest_acquisition_utc: firmsSnap.latestAcquisitionUtc,
          status_checked_at_utc: firmsSnap.syncedAtUtc,
        };
      }
      return patched;
    });

    const response: DataStatusResponse = {
      status: 'PARTIAL_PLATFORM_GAP',
      data_mode: dataMode,
      demo_banner_text: firmsSnap.connected
        ? `LIVE NASA FIRMS Official Global Active-Fire Feeds (${firmsSnap.observations.length.toLocaleString()} detections / 24h)${
            manifest?.available
              ? ` + Historical NASA Parquet (${manifest.canonical_rows_total.toLocaleString()} rows, ${manifest.date_range.min_date}–${manifest.date_range.max_date})`
              : ''
          }.`
        : isEonetConnected
        ? `LIVE NASA EONET v3 Wildfire Stream (${eonetItems.length} active events) + NASA FIRMS Archive.`
        : 'NASA FIRMS local archive baseline.',
      retrieved_at_utc: firmsSnap.connected
        ? firmsSnap.syncedAtUtc
        : isEonetConnected
        ? lastEonetSyncedAtUtc
        : RETRIEVED_AT_UTC,
      latest_acquisition_utc: firmsSnap.connected
        ? firmsSnap.latestAcquisitionUtc
        : LATEST_ACQUISITION_UTC,
      live_firms_connected: firmsSnap.connected,
      live_firms_count: firmsSnap.observations.length,
      live_firms_synced_at_utc: firmsSnap.syncedAtUtc,
      live_firms_min_date: firmsSnap.minDate,
      live_firms_max_date: firmsSnap.maxDate,
      live_firms_feeds: firmsSnap.feedStats,
      firms_map_key_configured: mapKeyConfigured,
      live_eonet_connected: isEonetConnected,
      live_eonet_event_count: eonetItems.length,
      live_eonet_synced_at_utc: lastEonetSyncedAtUtc,
      parquet_archive: manifest,
      firms_area_api_constraints: {
        day_range_min: 1,
        day_range_max: 5,
        transactions_per_10_min: 5000,
        nrt_to_standard_lag_months: 5,
        rt_urt_retention_hours: 6,
      },
      platforms: dynamicPlatforms,
      raw_archive_manifest: manifest?.available
        ? manifest.source_files.map((sf) => ({
            file_id: sf.file_id,
            filename: sf.filename,
            source_url: sf.source_url,
            source_product: sf.source_product,
            sensor: sf.sensor,
            platform: sf.platforms[0] ?? (sf.sensor === 'MODIS' ? 'TERRA' : 'SNPP'),
            collection: sf.collection,
            processing_status: sf.processing_status,
            retrieved_at_utc: manifest.generated_at_utc,
            sha256_checksum: sf.sha256_checksum,
            row_count: sf.row_count,
            aoi_id: 'indonesia-archipelago',
            date_window: sf.date_window,
          }))
        : RAW_ARCHIVE_MANIFEST,
    };
    res.json(response);
  });

  // 3. GET /api/v1/aois
  app.get('/api/v1/aois', (_req, res) => {
    res.json({ items: PRESET_AOIS });
  });

  // 3b. GET /api/v1/map/hotspots (Viewport-bounded Live NASA FIRMS + Recent Parquet / Optional Area API)
  app.get('/api/v1/map/hotspots', async (req, res) => {
    const aoiResolution = parseAoiFromParams(req.query.aoi_id, req.query.bbox, req.query.aoi_name);
    if (aoiResolution.error || !aoiResolution.aoi) {
      res.status(400).json({ error: aoiResolution.error });
      return;
    }

    const filterCheck = parseSharedFilters(req.query as Record<string, unknown>);
    if (filterCheck.error) {
      res.status(400).json({ error: filterCheck.error });
      return;
    }

    if (req.query.max_points !== undefined && req.query.max_points !== '') {
      const mp = Number(req.query.max_points);
      if (!Number.isFinite(mp) || mp < 1 || mp > 20000) {
        res.status(400).json({
          error: {
            code: 'INVALID_MAX_POINTS',
            message: 'max_points must be a finite number between 1 and 20000.',
          },
        });
        return;
      }
    }

    const west = req.query.west !== undefined ? Number(req.query.west) : -180;
    const south = req.query.south !== undefined ? Number(req.query.south) : -85;
    const east = req.query.east !== undefined ? Number(req.query.east) : 180;
    const north = req.query.north !== undefined ? Number(req.query.north) : 85;
    if (
      ![west, south, east, north].every(Number.isFinite) ||
      south > north ||
      west > east
    ) {
      res.status(400).json({
        error: {
          code: 'INVALID_VIEWPORT_BOUNDS',
          message: 'Viewport west/south/east/north must be valid ordered coordinates.',
        },
      });
      return;
    }

    const maxPoints = req.query.max_points
      ? Math.min(8000, Math.max(100, Number(req.query.max_points)))
      : 5000;

    let startDate: string | undefined;
    if (req.query.start_date !== undefined && String(req.query.start_date).trim() !== '') {
      const s = String(req.query.start_date).trim();
      if (!isValidCalendarDate(s)) {
        res.status(400).json({
          error: { code: 'INVALID_DATE_FORMAT', message: 'start_date must be a valid YYYY-MM-DD calendar date.' },
        });
        return;
      }
      startDate = s;
    }
    let endDate: string | undefined;
    if (req.query.end_date !== undefined && String(req.query.end_date).trim() !== '') {
      const e = String(req.query.end_date).trim();
      if (!isValidCalendarDate(e)) {
        res.status(400).json({
          error: { code: 'INVALID_DATE_FORMAT', message: 'end_date must be a valid YYYY-MM-DD calendar date.' },
        });
        return;
      }
      endDate = e;
    }
    if (startDate && endDate && startDate > endDate) {
      res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'end_date must be on or after start_date.' },
      });
      return;
    }

    const firmsSnap = await ensureLiveFirmsLoaded();
    let sourcePool = firmsSnap.observations;
    const mapKey = getConfiguredFirmsMapKey();

    if (
      mapKey &&
      endDate &&
      endDate < firmsSnap.minDate &&
      aoiResolution.aoi.id !== 'global-world'
    ) {
      const startMs = startDate
        ? Date.parse(`${startDate}T00:00:00Z`)
        : Date.parse(`${endDate}T00:00:00Z`);
      const endMs = Date.parse(`${endDate}T00:00:00Z`);
      const days = Math.max(1, Math.min(5, Math.round((endMs - startMs) / 86400000) + 1));
      const areaRecords = await fetchFirmsAreaApiWithKey({
        mapKey,
        bbox: aoiResolution.aoi.bbox,
        dayRange: days,
        date: endDate,
        hashFn: sha256Hex,
      });
      if (areaRecords.length > 0) {
        sourcePool = areaRecords;
      }
    } else if (
      endDate &&
      endDate < firmsSnap.minDate &&
      endDate >= '2026-10-01' &&
      isAoiInParquetCoverage(aoiResolution.aoi)
    ) {
      const pqRes = await queryParquetRecentObservations({
        bbox: aoiResolution.aoi.bbox,
        startUtc: `${startDate && startDate >= '2026-10-01' ? startDate : '2026-10-01'}T00:00:00Z`,
        endUtc: `${endDate}T23:59:59Z`,
        sensor: filterCheck.sensor!,
        platforms: filterCheck.platforms!,
        processingStatus: filterCheck.processingStatus!,
        dayNight: filterCheck.dayNight!,
        modisMinConfidence: filterCheck.modisMinConfidence!,
        viirsCategories: filterCheck.viirsCategories!,
        limit: Math.min(250, maxPoints),
        offset: 0,
      });
      if (pqRes && pqRes.items.length > 0) {
        sourcePool = pqRes.items;
      }
    }

    const excludeOffshore = String(req.query.exclude_offshore ?? 'false').trim().toLowerCase() === 'true';

    const result = queryLiveFirmsViewport({
      observations: sourcePool,
      bounds: { west, south, east, north },
      aoi: aoiResolution.aoi,
      startDate,
      endDate,
      sensor: filterCheck.sensor,
      platforms: filterCheck.platforms,
      processingStatus: filterCheck.processingStatus,
      dayNight: filterCheck.dayNight,
      modisMinConfidence: filterCheck.modisMinConfidence,
      viirsCategories: filterCheck.viirsCategories,
      excludeOffshore,
      maxPoints,
    });

    const payload: MapHotspotsResponse = {
      data_mode: firmsSnap.connected ? 'LIVE_NASA_FIRMS' : 'DEMO_SNAPSHOT',
      total_global_24h: firmsSnap.observations.length,
      total_in_viewport: result.totalInViewport,
      returned_count: result.items.length,
      excluded_offshore_count: result.excludedOffshoreCount,
      exclude_offshore: excludeOffshore,
      sampled: result.sampled,
      synced_at_utc: firmsSnap.syncedAtUtc,
      latest_acquisition_utc: firmsSnap.latestAcquisitionUtc,
      min_date: firmsSnap.minDate,
      max_date: firmsSnap.maxDate,
      items: result.items,
    };

    res.json(payload);
  });

  // 3c. GET /api/v1/map/grid (P1 Selectable Spatial Grid & Clustering Layer)
  app.get('/api/v1/map/grid', async (req, res) => {
    const aoiResolution = parseAoiFromParams(req.query.aoi_id, req.query.bbox, req.query.aoi_name);
    if (aoiResolution.error || !aoiResolution.aoi) {
      res.status(400).json({ error: aoiResolution.error });
      return;
    }

    const filterCheck = parseSharedFilters(req.query as Record<string, unknown>);
    if (filterCheck.error) {
      res.status(400).json({ error: filterCheck.error });
      return;
    }

    const modeRaw = String(req.query.mode ?? 'grid').trim().toLowerCase();
    if (modeRaw !== 'grid' && modeRaw !== 'cluster') {
      res.status(400).json({
        error: { code: 'INVALID_GRID_MODE', message: 'mode must be grid or cluster.' },
      });
      return;
    }

    const resDeg = req.query.resolution_deg !== undefined ? Number(req.query.resolution_deg) : 1.0;
    if (!Number.isFinite(resDeg) || ![0.25, 0.5, 1.0, 2.0].includes(resDeg)) {
      res.status(400).json({
        error: {
          code: 'INVALID_GRID_RESOLUTION',
          message: 'resolution_deg must be one of: 0.25, 0.5, 1.0, 2.0.',
        },
      });
      return;
    }

    const west = req.query.west !== undefined ? Number(req.query.west) : -180;
    const south = req.query.south !== undefined ? Number(req.query.south) : -85;
    const east = req.query.east !== undefined ? Number(req.query.east) : 180;
    const north = req.query.north !== undefined ? Number(req.query.north) : 85;
    if (![west, south, east, north].every(Number.isFinite) || south > north || west > east) {
      res.status(400).json({
        error: {
          code: 'INVALID_VIEWPORT_BOUNDS',
          message: 'Viewport west/south/east/north must be valid ordered coordinates.',
        },
      });
      return;
    }

    const firmsSnap = await ensureLiveFirmsLoaded();
    let startDate = firmsSnap.minDate;
    if (req.query.start_date !== undefined && String(req.query.start_date).trim() !== '') {
      const s = String(req.query.start_date).trim();
      if (!isValidCalendarDate(s)) {
        res.status(400).json({
          error: { code: 'INVALID_DATE_FORMAT', message: 'start_date must be a valid YYYY-MM-DD calendar date.' },
        });
        return;
      }
      startDate = s;
    }
    let endDate = firmsSnap.maxDate;
    if (req.query.end_date !== undefined && String(req.query.end_date).trim() !== '') {
      const e = String(req.query.end_date).trim();
      if (!isValidCalendarDate(e)) {
        res.status(400).json({
          error: { code: 'INVALID_DATE_FORMAT', message: 'end_date must be a valid YYYY-MM-DD calendar date.' },
        });
        return;
      }
      endDate = e;
    }
    if (startDate > endDate) {
      res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'end_date must be on or after start_date.' },
      });
      return;
    }

    const liveCutoff = firmsSnap.connected ? firmsSnap.minDate : '9999-12-31';
    const manifest = getParquetManifest();

    const normWest = Math.max(-180, west);
    const normEast = Math.min(180, east);
    const effectiveBbox =
      aoiResolution.aoi.id === 'global-world'
        ? {
            west: normEast - normWest >= 359 ? -180 : normWest,
            south: Math.max(-85, south),
            east: normEast - normWest >= 359 ? 180 : normEast,
            north: Math.min(85, north),
          }
        : aoiResolution.aoi.bbox;

    const overlapsParquet =
      Boolean(manifest?.available) &&
      startDate < liveCutoff &&
      effectiveBbox.east >= 95.0 &&
      effectiveBbox.west <= 141.0 &&
      effectiveBbox.north >= -11.1 &&
      effectiveBbox.south <= 6.0;

    const parquetCells = overlapsParquet
      ? await queryParquetMapGrid({
          bbox: effectiveBbox,
          cellSizeDeg: resDeg,
          startDate,
          endDate: endDate < liveCutoff ? endDate : prevUtcDate(liveCutoff),
          sensor: filterCheck.sensor!,
          platforms: filterCheck.platforms!,
          processingStatus: filterCheck.processingStatus!,
          dayNight: filterCheck.dayNight!,
          modisMinConfidence: filterCheck.modisMinConfidence!,
          viirsCategories: filterCheck.viirsCategories!,
        })
      : [];

    const excludeOffshore = String(req.query.exclude_offshore ?? 'false').trim().toLowerCase() === 'true';

    const liveResult =
      endDate >= liveCutoff && firmsSnap.connected
        ? queryLiveFirmsViewport({
            observations: firmsSnap.observations.filter((o) => o.acq_date >= liveCutoff),
            bounds: { west, south, east, north },
            aoi: aoiResolution.aoi,
            startDate,
            endDate,
            sensor: filterCheck.sensor,
            platforms: filterCheck.platforms,
            processingStatus: filterCheck.processingStatus,
            dayNight: filterCheck.dayNight,
            modisMinConfidence: filterCheck.modisMinConfidence,
            viirsCategories: filterCheck.viirsCategories,
            excludeOffshore,
            maxPoints: 250000,
          })
        : { items: [], totalInViewport: 0, excludedOffshoreCount: 0, sampled: false };

    const liveCells = aggregateObservationsToGrid({
      observations: liveResult.items,
      cellSizeDeg: resDeg,
    });

    const mergedMap = new Map<string, MapGridCell>();
    for (const c of parquetCells) {
      if (excludeOffshore && isVerifiedOffshoreMarineCoordinate(c.centroid_lat, c.centroid_lng)) {
        continue;
      }
      mergedMap.set(c.cell_id, { ...c });
    }
    for (const c of liveCells) {
      const existing = mergedMap.get(c.cell_id);
      if (!existing) {
        mergedMap.set(c.cell_id, c);
      } else {
        existing.modis_detections += c.modis_detections;
        existing.viirs_detections += c.viirs_detections;
        existing.pooled_observation_count += c.pooled_observation_count;
        existing.modis_frp_sum_mw = Number(
          (existing.modis_frp_sum_mw + c.modis_frp_sum_mw).toFixed(2)
        );
        existing.viirs_frp_sum_mw = Number(
          (existing.viirs_frp_sum_mw + c.viirs_frp_sum_mw).toFixed(2)
        );
        existing.platforms = Array.from(new Set([...existing.platforms, ...c.platforms]));
        existing.source_backing = 'MIXED';
      }
    }

    const cells = Array.from(mergedMap.values())
      .sort((a, b) => b.pooled_observation_count - a.pooled_observation_count)
      .slice(0, 1500);

    const totalModis = cells.reduce((s, c) => s + c.modis_detections, 0);
    const totalViirs = cells.reduce((s, c) => s + c.viirs_detections, 0);

    const dataBacking: DataSourceBacking =
      parquetCells.length > 0 && liveCells.length > 0
        ? 'HYBRID_PARQUET_AND_LIVE'
        : parquetCells.length > 0
        ? 'REAL_NASA_ARCHIVE_PARQUET'
        : 'LIVE_NASA_FIRMS';

    const payload: MapGridResponse = {
      mode: modeRaw as 'grid' | 'cluster',
      cell_size_deg: resDeg,
      data_backing: dataBacking,
      total_detections_modis: totalModis,
      total_detections_viirs: totalViirs,
      excluded_offshore_count: liveResult.excludedOffshoreCount,
      exclude_offshore: excludeOffshore,
      cell_count: cells.length,
      cells,
      method_note: `Server-side ${resDeg}° × ${resDeg}° WGS84 cell aggregation (${modeRaw} mode) keeping MODIS and VIIRS counts strictly separated inside each cell.`,
      spatial_caveat:
        'Unprojected latitude-longitude degree cells decrease in physical surface area toward higher latitudes. Do not compare raw counts per degree cell across different latitudes as equal-area fire density.',
      synced_at_utc: firmsSnap.syncedAtUtc,
    };

    res.json(payload);
  });

  // 4. GET /api/v1/analytics/calendar
  app.get('/api/v1/analytics/calendar', async (req, res) => {
    const startDate = String(req.query.start_date ?? '2026-11-12').trim();
    const endDate = String(req.query.end_date ?? '2026-11-13').trim();
    const granularity = String(req.query.granularity ?? 'day').trim() as Granularity;
    const metricRaw = String(req.query.metric ?? 'detection_count').trim();

    if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
      res.status(400).json({
        error: {
          code: 'INVALID_DATE_FORMAT',
          message: 'start_date and end_date must be valid YYYY-MM-DD calendar dates.',
        },
      });
      return;
    }
    if (Date.parse(`${startDate}T00:00:00Z`) > Date.parse(`${endDate}T23:59:59Z`)) {
      res.status(400).json({
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'end_date must be on or after start_date.',
        },
      });
      return;
    }
    if (!['day', 'week', 'month'].includes(granularity)) {
      res.status(400).json({
        error: {
          code: 'INVALID_GRANULARITY',
          message: 'granularity must be one of: day, week, month.',
        },
      });
      return;
    }
    if (!['detection_count', 'frp_mw'].includes(metricRaw)) {
      res.status(400).json({
        error: {
          code: 'INVALID_METRIC',
          message: 'metric must be one of: detection_count, frp_mw.',
        },
      });
      return;
    }
    const metric = metricRaw as 'detection_count' | 'frp_mw';

    const filterCheck = parseSharedFilters(req.query as Record<string, unknown>);
    if (filterCheck.error) {
      res.status(400).json({ error: filterCheck.error });
      return;
    }

    const aoiResolution = parseAoiFromParams(req.query.aoi_id, req.query.bbox, req.query.aoi_name);
    if (aoiResolution.error || !aoiResolution.aoi) {
      res.status(400).json({ error: aoiResolution.error });
      return;
    }

    try {
      const firmsSnap = await ensureLiveFirmsLoaded();
      const { response } = await computeServerCalendarAnalytics({
        aoi: aoiResolution.aoi,
        startDate,
        endDate,
        granularity,
        sensor: filterCheck.sensor!,
        platforms: filterCheck.platforms!,
        processingStatus: filterCheck.processingStatus!,
        dayNight: filterCheck.dayNight!,
        modisMinConfidence: filterCheck.modisMinConfidence!,
        viirsCategories: filterCheck.viirsCategories!,
        metric: metric === 'frp_mw' ? 'frp_mw' : 'detection_count',
        firmsSnap,
      });
      res.json(response);
    } catch (err) {
      res.status(400).json({
        error: {
          code: 'ANALYTICS_QUERY_ERROR',
          message: err instanceof Error ? err.message : 'Invalid analytics query.',
        },
      });
    }
  });

  // 4b. GET /api/v1/analytics/compare (FR-08 Like-for-Like Historical Period / Year-over-Year Comparison)
  app.get('/api/v1/analytics/compare', async (req, res) => {
    const periodAStart = String(req.query.period_a_start ?? '2025-07-01').trim();
    const periodAEnd = String(req.query.period_a_end ?? '2025-11-30').trim();
    const periodBStart = String(req.query.period_b_start ?? '2026-07-01').trim();
    const periodBEnd = String(req.query.period_b_end ?? '2026-11-13').trim();
    const periodALabel = String(
      req.query.period_a_label ?? `${periodAStart.slice(0, 7)}..${periodAEnd.slice(0, 7)}`
    ).trim();
    const periodBLabel = String(
      req.query.period_b_label ?? `${periodBStart.slice(0, 7)}..${periodBEnd.slice(0, 7)}`
    ).trim();
    const granularity = String(req.query.granularity ?? 'month').trim() as Granularity;
    const metricRaw = String(req.query.metric ?? 'detection_count').trim();

    for (const d of [periodAStart, periodAEnd, periodBStart, periodBEnd]) {
      if (!isValidCalendarDate(d)) {
        res.status(400).json({
          error: {
            code: 'INVALID_DATE_FORMAT',
            message: 'All comparison dates must be valid YYYY-MM-DD calendar dates.',
          },
        });
        return;
      }
    }
    if (
      Date.parse(`${periodAStart}T00:00:00Z`) > Date.parse(`${periodAEnd}T23:59:59Z`) ||
      Date.parse(`${periodBStart}T00:00:00Z`) > Date.parse(`${periodBEnd}T23:59:59Z`)
    ) {
      res.status(400).json({
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'Each period end_date must be on or after its start_date.',
        },
      });
      return;
    }
    if (!['day', 'week', 'month'].includes(granularity)) {
      res.status(400).json({
        error: { code: 'INVALID_GRANULARITY', message: 'granularity must be day, week, or month.' },
      });
      return;
    }
    if (!['detection_count', 'frp_mw'].includes(metricRaw)) {
      res.status(400).json({
        error: { code: 'INVALID_METRIC', message: 'metric must be one of: detection_count, frp_mw.' },
      });
      return;
    }
    const metric = metricRaw as 'detection_count' | 'frp_mw';

    const filterCheck = parseSharedFilters(req.query as Record<string, unknown>);
    if (filterCheck.error) {
      res.status(400).json({ error: filterCheck.error });
      return;
    }

    const aoiResolution = parseAoiFromParams(req.query.aoi_id, req.query.bbox, req.query.aoi_name);
    if (aoiResolution.error || !aoiResolution.aoi) {
      res.status(400).json({ error: aoiResolution.error });
      return;
    }

    try {
      const firmsSnap = await ensureLiveFirmsLoaded();
      const targetAoi = aoiResolution.aoi;

      const [resA, resB] = await Promise.all([
        computeServerCalendarAnalytics({
          aoi: targetAoi,
          startDate: periodAStart,
          endDate: periodAEnd,
          granularity,
          sensor: filterCheck.sensor!,
          platforms: filterCheck.platforms!,
          processingStatus: filterCheck.processingStatus!,
          dayNight: filterCheck.dayNight!,
          modisMinConfidence: filterCheck.modisMinConfidence!,
          viirsCategories: filterCheck.viirsCategories!,
          metric: metric === 'frp_mw' ? 'frp_mw' : 'detection_count',
          firmsSnap,
          includeBaselineHistory: false,
        }),
        computeServerCalendarAnalytics({
          aoi: targetAoi,
          startDate: periodBStart,
          endDate: periodBEnd,
          granularity,
          sensor: filterCheck.sensor!,
          platforms: filterCheck.platforms!,
          processingStatus: filterCheck.processingStatus!,
          dayNight: filterCheck.dayNight!,
          modisMinConfidence: filterCheck.modisMinConfidence!,
          viirsCategories: filterCheck.viirsCategories!,
          metric: metric === 'frp_mw' ? 'frp_mw' : 'detection_count',
          firmsSnap,
          includeBaselineHistory: false,
        }),
      ]);

      // Build multi-year Year-over-Year summary across benchmark years matching Period B's month-day span
      const startMmDd = periodBStart.slice(5);
      const endMmDd = periodBEnd.slice(5);
      const crossYearSpan = endMmDd < startMmDd;
      const inParquet = isAoiInParquetCoverage(targetAoi);
      const candidateYears = inParquet
        ? [2015, 2019, 2023, 2024, 2025, 2026]
        : [2024, 2025, 2026];
      const maxAvailableDate = firmsSnap.connected
        ? firmsSnap.maxDate
        : getParquetManifest()?.date_range.max_date ?? '2026-11-12';

      const yoySummary: YoyYearSummary[] = [];
      if (!crossYearSpan) {
        const eligibleYoyWindows = candidateYears
          .map((yr) => {
            const sD = resolveYearMmDd(yr, startMmDd);
            let eD = resolveYearMmDd(yr, endMmDd);
            if (yr === 2026) {
              if (sD > maxAvailableDate) return null;
              if (eD > maxAvailableDate) eD = maxAvailableDate;
            }
            if (sD > eD) return null;
            return { yr, sD, eD };
          })
          .filter((x): x is { yr: number; sD: string; eD: string } => x !== null);

        const yoyResults = await Promise.all(
          eligibleYoyWindows.map(async ({ yr, sD, eD }) => {
            const { response, dataBacking } = await computeServerCalendarAnalytics({
              aoi: targetAoi,
              startDate: sD,
              endDate: eD,
              granularity: 'month',
              sensor: filterCheck.sensor!,
              platforms: filterCheck.platforms!,
              processingStatus: filterCheck.processingStatus!,
              dayNight: filterCheck.dayNight!,
              modisMinConfidence: filterCheck.modisMinConfidence!,
              viirsCategories: filterCheck.viirsCategories!,
              metric: metric === 'frp_mw' ? 'frp_mw' : 'detection_count',
              firmsSnap,
              includeBaselineHistory: false,
            });
            const activePlats = Array.from(
              new Set(response.series.flatMap((b) => b.quality.active_platforms))
            );
            const procStatuses: ProcessingStatus[] = [];
            if (response.series.some((b) => b.processing_breakdown.STANDARD > 0)) {
              procStatuses.push('STANDARD');
            }
            if (response.series.some((b) => b.processing_breakdown.NRT > 0)) {
              procStatuses.push('NRT');
            }
            return {
              year: yr,
              start_date: sD,
              end_date: eD,
              modis_detections: response.totals.MODIS_detections,
              viirs_detections: response.totals.VIIRS_detections,
              modis_frp_sum_mw: response.totals.MODIS_frp.sum_mw,
              modis_frp_mean_mw: response.totals.MODIS_frp.mean_mw,
              viirs_frp_sum_mw: response.totals.VIIRS_frp.sum_mw,
              viirs_frp_mean_mw: response.totals.VIIRS_frp.mean_mw,
              active_platforms: activePlats,
              processing_statuses: procStatuses,
              data_backing: dataBacking,
            };
          })
        );
        yoySummary.push(...yoyResults);
      }

      const comparison = buildPeriodComparisonResponse({
        aoi: targetAoi,
        periodA: resA.response,
        periodB: resB.response,
        periodALabel,
        periodBLabel,
        yoySummary,
        dataBacking: resB.dataBacking,
        sources: Array.from(
          new Set([...resA.response.provenance.sources, ...resB.response.provenance.sources])
        ),
        retrievedAtUtc: resB.response.provenance.retrieved_at_utc,
        archiveChecksums: Array.from(
          new Set([
            ...resA.response.provenance.archive_checksums,
            ...resB.response.provenance.archive_checksums,
          ])
        ),
      });

      res.json(comparison);
    } catch (err) {
      res.status(400).json({
        error: {
          code: 'COMPARE_QUERY_ERROR',
          message: err instanceof Error ? err.message : 'Invalid period comparison query.',
        },
      });
    }
  });

  // 4c. GET /api/v1/analytics/compare-aois (P1 Side-by-Side AOI Comparison)
  app.get('/api/v1/analytics/compare-aois', async (req, res) => {
    const startDate = String(req.query.start_date ?? '2026-01-01').trim();
    const endDate = String(req.query.end_date ?? '2026-11-13').trim();
    const granularity = String(req.query.granularity ?? 'month').trim() as Granularity;
    const metricRaw = String(req.query.metric ?? 'detection_count').trim();

    if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
      res.status(400).json({
        error: {
          code: 'INVALID_DATE_FORMAT',
          message: 'start_date and end_date must be valid YYYY-MM-DD calendar dates.',
        },
      });
      return;
    }
    if (Date.parse(`${startDate}T00:00:00Z`) > Date.parse(`${endDate}T23:59:59Z`)) {
      res.status(400).json({
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'end_date must be on or after start_date.',
        },
      });
      return;
    }
    if (!['day', 'week', 'month'].includes(granularity)) {
      res.status(400).json({
        error: { code: 'INVALID_GRANULARITY', message: 'granularity must be day, week, or month.' },
      });
      return;
    }
    if (!['detection_count', 'frp_mw'].includes(metricRaw)) {
      res.status(400).json({
        error: { code: 'INVALID_METRIC', message: 'metric must be one of: detection_count, frp_mw.' },
      });
      return;
    }
    const metric = metricRaw as 'detection_count' | 'frp_mw';

    const filterCheck = parseSharedFilters(req.query as Record<string, unknown>);
    if (filterCheck.error) {
      res.status(400).json({ error: filterCheck.error });
      return;
    }

    const aoiARes = parseAoiFromParams(
      req.query.aoi_a_id ?? 'kalimantan-peat',
      req.query.bbox_a,
      req.query.aoi_a_name
    );
    if (aoiARes.error || !aoiARes.aoi) {
      res.status(400).json({ error: aoiARes.error });
      return;
    }

    const aoiBRes = parseAoiFromParams(
      req.query.aoi_b_id ?? 'indonesia-archipelago',
      req.query.bbox_b,
      req.query.aoi_b_name
    );
    if (aoiBRes.error || !aoiBRes.aoi) {
      res.status(400).json({ error: aoiBRes.error });
      return;
    }

    try {
      const firmsSnap = await ensureLiveFirmsLoaded();
      const [resA, resB] = await Promise.all([
        computeServerCalendarAnalytics({
          aoi: aoiARes.aoi,
          startDate,
          endDate,
          granularity,
          sensor: filterCheck.sensor!,
          platforms: filterCheck.platforms!,
          processingStatus: filterCheck.processingStatus!,
          dayNight: filterCheck.dayNight!,
          modisMinConfidence: filterCheck.modisMinConfidence!,
          viirsCategories: filterCheck.viirsCategories!,
          metric: metric === 'frp_mw' ? 'frp_mw' : 'detection_count',
          firmsSnap,
          includeBaselineHistory: false,
        }),
        computeServerCalendarAnalytics({
          aoi: aoiBRes.aoi,
          startDate,
          endDate,
          granularity,
          sensor: filterCheck.sensor!,
          platforms: filterCheck.platforms!,
          processingStatus: filterCheck.processingStatus!,
          dayNight: filterCheck.dayNight!,
          modisMinConfidence: filterCheck.modisMinConfidence!,
          viirsCategories: filterCheck.viirsCategories!,
          metric: metric === 'frp_mw' ? 'frp_mw' : 'detection_count',
          firmsSnap,
          includeBaselineHistory: false,
        }),
      ]);

      const comparison = buildAoiComparisonResponse({
        aoiA: aoiARes.aoi,
        analyticsA: resA.response,
        backingA: resA.dataBacking,
        aoiB: aoiBRes.aoi,
        analyticsB: resB.response,
        backingB: resB.dataBacking,
        retrievedAtUtc: firmsSnap.connected ? firmsSnap.syncedAtUtc : RETRIEVED_AT_UTC,
      });

      res.json(comparison);
    } catch (err) {
      res.status(400).json({
        error: {
          code: 'COMPARE_AOIS_ERROR',
          message: err instanceof Error ? err.message : 'Invalid AOI comparison query.',
        },
      });
    }
  });

  // 5. GET /api/v1/observations (bounded and cursor-paginated)
  app.get('/api/v1/observations', async (req, res) => {
    const startUtc = String(req.query.start_datetime_utc ?? '2026-11-12T00:00:00Z').trim();
    const endUtc = String(req.query.end_datetime_utc ?? '2026-11-13T23:59:59Z').trim();
    const limitRaw = req.query.limit !== undefined ? Number(req.query.limit) : 50;

    if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 250) {
      res.status(400).json({
        error: {
          code: 'INVALID_LIMIT',
          message: 'limit must be an integer between 1 and 250.',
        },
      });
      return;
    }

    let cursorOffset = 0;
    if (req.query.cursor !== undefined && String(req.query.cursor).trim() !== '') {
      const rawCursor = String(req.query.cursor).trim();
      if (!/^\d+$/.test(rawCursor)) {
        res.status(400).json({
          error: {
            code: 'INVALID_CURSOR',
            message: 'cursor must be a non-negative integer offset.',
          },
        });
        return;
      }
      cursorOffset = Number(rawCursor);
    }

    const startMs = Date.parse(startUtc);
    const endMs = Date.parse(endUtc);
    if (
      !isValidCalendarDate(startUtc.slice(0, 10)) ||
      !isValidCalendarDate(endUtc.slice(0, 10)) ||
      Number.isNaN(startMs) ||
      Number.isNaN(endMs) ||
      startMs > endMs
    ) {
      res.status(400).json({
        error: {
          code: 'INVALID_DATETIME_RANGE',
          message: 'end_datetime_utc must be valid ISO-8601 UTC and >= start_datetime_utc.',
        },
      });
      return;
    }

    const aoiResolution = parseAoiFromParams(req.query.aoi_id, req.query.bbox, req.query.aoi_name);
    if (aoiResolution.error || !aoiResolution.aoi) {
      res.status(400).json({ error: aoiResolution.error });
      return;
    }

    const filterCheck = parseSharedFilters(req.query as Record<string, unknown>);
    if (filterCheck.error) {
      res.status(400).json({ error: filterCheck.error });
      return;
    }

    const firmsSnap = await ensureLiveFirmsLoaded();
    const targetAoi = aoiResolution.aoi;
    const startDateStr = startUtc.slice(0, 10);
    const endDateStr = endUtc.slice(0, 10);
    const liveCutoff = firmsSnap.connected ? firmsSnap.minDate : '9999-12-31';

    // Live observations inside window
    const liveMatching = firmsSnap.observations
      .filter((r) => {
        if (r.acq_date < liveCutoff) return false;
        if (!isPointInAoi(r.latitude, r.longitude, targetAoi)) return false;
        const t = Date.parse(r.acq_datetime_utc);
        if (t < startMs || t > endMs) return false;
        if (filterCheck.sensor !== 'ALL' && r.sensor !== filterCheck.sensor) return false;
        if (!filterCheck.platforms!.includes(r.platform)) {
          return false;
        }
        if (
          filterCheck.processingStatus !== 'ALL' &&
          r.processing_status !== filterCheck.processingStatus
        ) {
          return false;
        }
        if (filterCheck.dayNight !== 'ALL' && r.daynight_native !== filterCheck.dayNight) {
          return false;
        }
        if (r.sensor === 'MODIS' && typeof r.confidence_native === 'number') {
          if (r.confidence_native < filterCheck.modisMinConfidence!) return false;
        }
        if (r.sensor === 'VIIRS' && typeof r.confidence_native === 'string') {
          if (!filterCheck.viirsCategories!.includes(r.confidence_native as 'low' | 'nominal' | 'high')) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.acq_datetime_utc) - Date.parse(a.acq_datetime_utc));

    // If AOI is inside Indonesia Parquet coverage and touches Oct-Nov 2026 historical rows (< liveCutoff), query recent_observations_2026.parquet
    let historicalItems: CanonicalObservation[] = [];
    let historicalTotal = 0;
    const inParquet = isAoiInParquetCoverage(targetAoi);

    if (inParquet && startDateStr < liveCutoff && endDateStr >= '2026-10-01') {
      const pqEnd = endDateStr < liveCutoff ? endDateStr : prevUtcDate(liveCutoff);
      if (pqEnd >= '2026-10-01') {
        const remainingLimit = Math.max(1, limitRaw - Math.max(0, liveMatching.length - cursorOffset));
        const pqOffset = Math.max(0, cursorOffset - liveMatching.length);
        const pqRes = await queryParquetRecentObservations({
          bbox: targetAoi.bbox,
          startUtc: startDateStr < '2026-10-01' ? '2026-10-01T00:00:00Z' : startUtc,
          endUtc: `${pqEnd}T23:59:59Z`,
          sensor: filterCheck.sensor!,
          platforms: filterCheck.platforms!,
          processingStatus: filterCheck.processingStatus!,
          dayNight: filterCheck.dayNight!,
          modisMinConfidence: filterCheck.modisMinConfidence!,
          viirsCategories: filterCheck.viirsCategories!,
          limit: remainingLimit,
          offset: pqOffset,
        });
        if (pqRes) {
          historicalItems = pqRes.items;
          historicalTotal = pqRes.totalMatching;
        }
      }
    } else if (!inParquet && startDateStr < liveCutoff && startDateStr <= '2026-11-11') {
      const fixtureMatching = ALL_ARCHIVE_OBSERVATIONS.filter((r) => {
        if (r.acq_date >= liveCutoff) return false;
        if (!isPointInAoi(r.latitude, r.longitude, targetAoi)) return false;
        const t = Date.parse(r.acq_datetime_utc);
        if (t < startMs || t > endMs) return false;
        if (filterCheck.sensor !== 'ALL' && r.sensor !== filterCheck.sensor) return false;
        if (!filterCheck.platforms!.includes(r.platform)) {
          return false;
        }
        if (
          filterCheck.processingStatus !== 'ALL' &&
          r.processing_status !== filterCheck.processingStatus
        ) {
          return false;
        }
        if (filterCheck.dayNight !== 'ALL' && r.daynight_native !== filterCheck.dayNight) {
          return false;
        }
        if (r.sensor === 'MODIS' && typeof r.confidence_native === 'number') {
          if (r.confidence_native < filterCheck.modisMinConfidence!) return false;
        }
        if (r.sensor === 'VIIRS' && typeof r.confidence_native === 'string') {
          if (!filterCheck.viirsCategories!.includes(r.confidence_native as 'low' | 'nominal' | 'high')) {
            return false;
          }
        }
        return true;
      }).sort((a, b) => Date.parse(b.acq_datetime_utc) - Date.parse(a.acq_datetime_utc));

      historicalTotal = fixtureMatching.length;
      const pqOffset = Math.max(0, cursorOffset - liveMatching.length);
      const remainingLimit = Math.max(1, limitRaw - Math.max(0, liveMatching.length - cursorOffset));
      historicalItems = fixtureMatching.slice(pqOffset, pqOffset + remainingLimit);
    }

    const totalMatching = liveMatching.length + historicalTotal;
    const liveSlice =
      cursorOffset < liveMatching.length
        ? liveMatching.slice(cursorOffset, cursorOffset + limitRaw)
        : [];
    const combinedSlice = [...liveSlice, ...historicalItems].slice(0, limitRaw);
    const nextCursor =
      cursorOffset + combinedSlice.length < totalMatching
        ? String(cursorOffset + combinedSlice.length)
        : null;

    const response: PaginatedObservationsResponse = {
      data_mode: firmsSnap.connected ? 'LIVE_NASA_FIRMS' : 'DEMO_SNAPSHOT',
      items: combinedSlice,
      total_matching: totalMatching,
      limit: limitRaw,
      next_cursor: nextCursor,
      method: {
        id: 'M0_RAW',
        version: '1.0.0',
        note: 'M0_RAW canonical observations preserving native sensor confidence, pixel footprint (scan/track), and processing version.',
      },
      provenance: {
        sources: firmsSnap.connected
          ? [
              'NASA FIRMS Live Open Data CSV Streams (MODIS C6.1 & VIIRS C2)',
              ...(inParquet ? ['NASA FIRMS Recent Observations Parquet (Oct–Nov 2026)'] : []),
            ]
          : ['NASA FIRMS Archive Snapshot (MODIS C6.1 & VIIRS C2)'],
        retrieved_at_utc: firmsSnap.connected ? firmsSnap.syncedAtUtc : RETRIEVED_AT_UTC,
      },
    };

    res.json(response);
  });

  // Return structured JSON 404 for unknown /api/* routes rather than falling through to SPA HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `API endpoint ${req.method} ${req.path} does not exist.`,
      },
    });
  });

  // Global sanitized error handler (prevents stack trace or sensitive path leakage)
  app.use(
    (
      err: Error & { status?: number; type?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({
          error: {
            code: 'INVALID_JSON',
            message: 'Malformed JSON request payload.',
          },
        });
        return;
      }
      if (err?.type === 'entity.too.large' || err?.status === 413) {
        res.status(413).json({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request payload exceeds the 16 KB limit.',
          },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred.',
        },
      });
    }
  );

  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`FireScope server listening on http://localhost:${PORT}`);
  });
}

startServer();
