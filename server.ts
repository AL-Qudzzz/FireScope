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
  isPointInAoi,
  validateBoundingBox,
} from './src/science/fireScience';
import {
  AoiDefinition,
  CanonicalObservation,
  DataStatusResponse,
  Granularity,
  MapHotspotsResponse,
  PaginatedObservationsResponse,
  PlatformId,
  ProcessingStatus,
  SensorFilter,
} from './src/types/firescope';
import { fetchLiveEonetObservations } from './src/services/eonetLiveService';
import {
  fetchFirmsAreaApiWithKey,
  fetchLiveFirmsGlobalStreams,
  LiveFirmsSnapshot,
  queryLiveFirmsViewport,
} from './src/services/firmsLiveService';

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

let cachedFirmsSnapshot: LiveFirmsSnapshot | null = null;
let lastFirmsSyncMs = 0;
let inFlightFirmsPromise: Promise<LiveFirmsSnapshot> | null = null;

async function ensureLiveFirmsLoaded(): Promise<LiveFirmsSnapshot> {
  const now = Date.now();
  if (cachedFirmsSnapshot && cachedFirmsSnapshot.observations.length > 0 && now - lastFirmsSyncMs < 10 * 60 * 1000) {
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
    // Keep existing cache or fallback gracefully if offline
  }
  return cachedEonetObservations;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Warm up official NASA FIRMS Global 24h CSV streams + EONET v3 cache on server start
  ensureLiveFirmsLoaded().catch(() => {});
  ensureLiveEonetLoaded().catch(() => {});

  // 1. GET /health
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'firescope-api',
      version: '1.1.0',
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

    const dataMode: DataStatusResponse['data_mode'] = firmsSnap.connected
      ? 'LIVE_NASA_FIRMS'
      : isEonetConnected
      ? 'LIVE_NASA_EONET_HYBRID'
      : 'DEMO_SNAPSHOT';

    const dynamicPlatforms = PLATFORM_REGISTRY.map((p) => {
      if (!firmsSnap.connected) return p;
      if (p.platform_id === 'SNPP') {
        const snppFeed = firmsSnap.feedStats.find((f) => f.platform === 'SNPP');
        if (!snppFeed || snppFeed.row_count === 0) {
          return {
            ...p,
            status_checked_at_utc: firmsSnap.syncedAtUtc,
          };
        }
      }
      if (['TERRA', 'AQUA', 'NOAA20', 'NOAA21'].includes(p.platform_id)) {
        return {
          ...p,
          last_observation_date: firmsSnap.maxDate,
          latest_acquisition_utc: firmsSnap.latestAcquisitionUtc,
          status_checked_at_utc: firmsSnap.syncedAtUtc,
        };
      }
      return p;
    });

    const response: DataStatusResponse = {
      status: 'PARTIAL_PLATFORM_GAP',
      data_mode: dataMode,
      demo_banner_text: firmsSnap.connected
        ? `LIVE NASA FIRMS Official Global Active-Fire Feeds (${firmsSnap.observations.length.toLocaleString()} detections in 24h window: MODIS C6.1 + VIIRS NOAA-20 & NOAA-21 C2).`
        : isEonetConnected
        ? `LIVE NASA EONET v3 Wildfire Stream (${eonetItems.length} active events) + NASA FIRMS Archive Baseline.`
        : 'Deterministic NASA FIRMS archive fixtures (MODIS C6.1 & VIIRS C2, 2024–2026). Checksum-verified local snapshot.',
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
      firms_area_api_constraints: {
        day_range_min: 1,
        day_range_max: 5,
        transactions_per_10_min: 5000,
        nrt_to_standard_lag_months: 5,
        rt_urt_retention_hours: 6,
      },
      platforms: dynamicPlatforms,
      raw_archive_manifest: RAW_ARCHIVE_MANIFEST,
    };
    res.json(response);
  });

  // 3. GET /api/v1/aois
  app.get('/api/v1/aois', (_req, res) => {
    res.json({ items: PRESET_AOIS });
  });

  // Helper to resolve AOI from query params
  function resolveAoiFromQuery(query: Record<string, unknown>): {
    aoi?: AoiDefinition;
    error?: { code: string; message: string };
  } {
    const aoiId = typeof query.aoi_id === 'string' ? query.aoi_id.trim() : '';
    const bboxStr = typeof query.bbox === 'string' ? query.bbox.trim() : '';

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
          id: preset ? preset.id : 'custom-bbox',
          name:
            typeof query.aoi_name === 'string' && query.aoi_name.trim()
              ? query.aoi_name.trim()
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

  // 3b. GET /api/v1/map/hotspots (Viewport-bounded 100% Official Live NASA FIRMS Active-Fire Feed)
  app.get('/api/v1/map/hotspots', async (req, res) => {
    const firmsSnap = await ensureLiveFirmsLoaded();

    const aoiResolution = resolveAoiFromQuery(req.query as Record<string, unknown>);
    if (aoiResolution.error || !aoiResolution.aoi) {
      res.status(400).json({ error: aoiResolution.error });
      return;
    }

    const west = req.query.west !== undefined ? Number(req.query.west) : -180;
    const south = req.query.south !== undefined ? Number(req.query.south) : -85;
    const east = req.query.east !== undefined ? Number(req.query.east) : 180;
    const north = req.query.north !== undefined ? Number(req.query.north) : 85;
    const maxPoints = req.query.max_points
      ? Math.min(8000, Math.max(100, Number(req.query.max_points)))
      : 5000;

    const bounds =
      Number.isFinite(west) &&
      Number.isFinite(south) &&
      Number.isFinite(east) &&
      Number.isFinite(north)
        ? { west, south, east, north }
        : undefined;

    const sensor = String(req.query.sensor ?? 'ALL').trim().toUpperCase() as SensorFilter;
    const platformsParam =
      typeof req.query.platforms === 'string' && req.query.platforms.trim()
        ? (req.query.platforms
            .split(',')
            .map((p) => p.trim().toUpperCase()) as PlatformId[])
        : [];
    const processingStatus = String(
      req.query.processing_status ?? 'ALL'
    ).trim() as ProcessingStatus | 'ALL';
    const dayNight = String(req.query.daynight ?? 'ALL').trim() as 'ALL' | 'D' | 'N';
    const modisMinConfidence = req.query.modis_min_confidence
      ? Number(req.query.modis_min_confidence)
      : 0;
    const viirsCategories =
      typeof req.query.viirs_categories === 'string' && req.query.viirs_categories.trim()
        ? (req.query.viirs_categories.split(',') as Array<'low' | 'nominal' | 'high'>)
        : (['low', 'nominal', 'high'] as Array<'low' | 'nominal' | 'high'>);

    const startDate =
      typeof req.query.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.start_date)
        ? req.query.start_date
        : undefined;
    const endDate =
      typeof req.query.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.end_date)
        ? req.query.end_date
        : undefined;

    // Optional FIRMS Area API lookup when user explicitly requests historical window outside live 24h AND FIRMS_MAP_KEY is configured
    let sourcePool = firmsSnap.observations;
    const mapKey = getConfiguredFirmsMapKey();
    if (
      mapKey &&
      endDate &&
      endDate < firmsSnap.minDate &&
      aoiResolution.aoi.id !== 'global-world'
    ) {
      const startMs = startDate ? Date.parse(`${startDate}T00:00:00Z`) : Date.parse(`${endDate}T00:00:00Z`);
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
    }

    const result = queryLiveFirmsViewport({
      observations: sourcePool,
      bounds,
      aoi: aoiResolution.aoi,
      startDate,
      endDate,
      sensor,
      platforms: platformsParam,
      processingStatus,
      dayNight,
      modisMinConfidence,
      viirsCategories,
      maxPoints,
    });

    const payload: MapHotspotsResponse = {
      data_mode: firmsSnap.connected ? 'LIVE_NASA_FIRMS' : 'DEMO_SNAPSHOT',
      total_global_24h: firmsSnap.observations.length,
      total_in_viewport: result.totalInViewport,
      returned_count: result.items.length,
      sampled: result.sampled,
      synced_at_utc: firmsSnap.syncedAtUtc,
      latest_acquisition_utc: firmsSnap.latestAcquisitionUtc,
      min_date: firmsSnap.minDate,
      max_date: firmsSnap.maxDate,
      items: result.items,
    };

    res.json(payload);
  });

  // 4. GET /api/v1/analytics/calendar
  app.get('/api/v1/analytics/calendar', async (req, res) => {
    const startDate = String(req.query.start_date ?? '2026-11-12').trim();
    const endDate = String(req.query.end_date ?? '2026-11-13').trim();
    const granularity = String(req.query.granularity ?? 'day').trim() as Granularity;
    const sensor = String(req.query.sensor ?? 'ALL').trim().toUpperCase() as SensorFilter;
    const metric = String(req.query.metric ?? 'detection_count').trim() as
      | 'detection_count'
      | 'frp_mw';
    const processingStatus = String(
      req.query.processing_status ?? 'ALL'
    ).trim() as ProcessingStatus | 'ALL';
    const dayNight = String(req.query.daynight ?? 'ALL').trim() as 'ALL' | 'D' | 'N';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      res.status(400).json({
        error: {
          code: 'INVALID_DATE_FORMAT',
          message: 'start_date and end_date must use YYYY-MM-DD format.',
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

    if (!['ALL', 'MODIS', 'VIIRS'].includes(sensor)) {
      res.status(400).json({
        error: {
          code: 'INVALID_SENSOR',
          message: 'sensor must be one of: MODIS, VIIRS, ALL.',
        },
      });
      return;
    }

    const aoiResolution = resolveAoiFromQuery(req.query as Record<string, unknown>);
    if (aoiResolution.error || !aoiResolution.aoi) {
      res.status(400).json({ error: aoiResolution.error });
      return;
    }

    const platformsParam =
      typeof req.query.platforms === 'string' && req.query.platforms.trim()
        ? (req.query.platforms
            .split(',')
            .map((p) => p.trim().toUpperCase()) as PlatformId[])
        : (['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'] as PlatformId[]);

    const modisMinConfidence = req.query.modis_min_confidence
      ? Number(req.query.modis_min_confidence)
      : 0;
    const viirsCategories =
      typeof req.query.viirs_categories === 'string' && req.query.viirs_categories.trim()
        ? (req.query.viirs_categories.split(',') as Array<'low' | 'nominal' | 'high'>)
        : (['low', 'nominal', 'high'] as Array<'low' | 'nominal' | 'high'>);

    try {
      const firmsSnap = await ensureLiveFirmsLoaded();
      const targetAoi = aoiResolution.aoi;
      // Pre-filter to target AOI & date window before aggregating for O(N) responsiveness across 176k live rows
      const relevantLive = firmsSnap.observations.filter(
        (r) =>
          r.acq_date >= startDate &&
          r.acq_date <= endDate &&
          isPointInAoi(r.latitude, r.longitude, targetAoi)
      );
      const relevantArchive =
        startDate <= '2026-11-11'
          ? ALL_ARCHIVE_OBSERVATIONS.filter(
              (r) =>
                r.acq_date >= startDate &&
                r.acq_date <= endDate &&
                isPointInAoi(r.latitude, r.longitude, targetAoi)
            )
          : [];

      const combinedRecords = [...relevantLive, ...relevantArchive];
      const response = aggregateCalendarAnalytics({
        allRawRecords: combinedRecords,
        aoi: targetAoi,
        startDate,
        endDate,
        granularity,
        sensor,
        platforms: platformsParam,
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
      if (firmsSnap.connected) {
        response.data_mode = 'LIVE_NASA_FIRMS';
        response.demo_notice = `LIVE NASA FIRMS Official Global Active-Fire Feeds (${firmsSnap.observations.length.toLocaleString()} observations synced ${firmsSnap.syncedAtUtc}).`;
        response.provenance.sources = [
          'NASA FIRMS Live Open Data CSV Streams (MODIS C6.1, VIIRS NOAA-20 C2, VIIRS NOAA-21 C2)',
          ...(relevantArchive.length > 0
            ? ['NASA FIRMS Archive Baseline (2024–2026-11-11)']
            : []),
        ];
      }
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

  // 5. GET /api/v1/observations (bounded and cursor-paginated)
  app.get('/api/v1/observations', async (req, res) => {
    const startUtc = String(req.query.start_datetime_utc ?? '2026-11-12T00:00:00Z').trim();
    const endUtc = String(req.query.end_datetime_utc ?? '2026-11-13T23:59:59Z').trim();
    const sensor = String(req.query.sensor ?? 'ALL').trim().toUpperCase() as SensorFilter;
    const limitRaw = req.query.limit !== undefined ? Number(req.query.limit) : 50;

    if (!Number.isFinite(limitRaw) || limitRaw < 1 || limitRaw > 250) {
      res.status(400).json({
        error: {
          code: 'INVALID_LIMIT',
          message: 'limit must be an integer between 1 and 250.',
        },
      });
      return;
    }

    const startMs = Date.parse(startUtc);
    const endMs = Date.parse(endUtc);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
      res.status(400).json({
        error: {
          code: 'INVALID_DATETIME_RANGE',
          message: 'end_datetime_utc must be valid ISO-8601 UTC and >= start_datetime_utc.',
        },
      });
      return;
    }

    const aoiResolution = resolveAoiFromQuery(req.query as Record<string, unknown>);
    if (aoiResolution.error || !aoiResolution.aoi) {
      res.status(400).json({ error: aoiResolution.error });
      return;
    }

    const platformsParam =
      typeof req.query.platforms === 'string' && req.query.platforms.trim()
        ? (req.query.platforms
            .split(',')
            .map((p) => p.trim().toUpperCase()) as PlatformId[])
        : [];
    const processingStatus = String(
      req.query.processing_status ?? 'ALL'
    ).trim() as ProcessingStatus | 'ALL';
    const dayNight = String(req.query.daynight ?? 'ALL').trim() as 'ALL' | 'D' | 'N';
    const modisMinConfidence = req.query.modis_min_confidence
      ? Number(req.query.modis_min_confidence)
      : 0;
    const viirsCategories =
      typeof req.query.viirs_categories === 'string' && req.query.viirs_categories.trim()
        ? (req.query.viirs_categories.split(',') as Array<'low' | 'nominal' | 'high'>)
        : (['low', 'nominal', 'high'] as Array<'low' | 'nominal' | 'high'>);

    const firmsSnap = await ensureLiveFirmsLoaded();
    const targetAoi = aoiResolution.aoi;
    const startDateStr = startUtc.slice(0, 10);

    const candidatePool: CanonicalObservation[] = [];
    for (const r of firmsSnap.observations) {
      if (!isPointInAoi(r.latitude, r.longitude, targetAoi)) continue;
      const t = Date.parse(r.acq_datetime_utc);
      if (t < startMs || t > endMs) continue;
      candidatePool.push(r);
    }
    if (startDateStr <= '2026-11-11') {
      for (const r of ALL_ARCHIVE_OBSERVATIONS) {
        if (!isPointInAoi(r.latitude, r.longitude, targetAoi)) continue;
        const t = Date.parse(r.acq_datetime_utc);
        if (t < startMs || t > endMs) continue;
        candidatePool.push(r);
      }
    }

    const matching = candidatePool
      .filter((r) => {
        if (sensor !== 'ALL' && r.sensor !== sensor) return false;
        if (platformsParam.length > 0 && !platformsParam.includes(r.platform)) return false;
        if (processingStatus !== 'ALL' && r.processing_status !== processingStatus) return false;
        if (dayNight !== 'ALL' && r.daynight_native !== dayNight) return false;
        if (r.sensor === 'MODIS' && typeof r.confidence_native === 'number') {
          if (r.confidence_native < modisMinConfidence) return false;
        }
        if (r.sensor === 'VIIRS' && typeof r.confidence_native === 'string') {
          if (!viirsCategories.includes(r.confidence_native as 'low' | 'nominal' | 'high')) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.acq_datetime_utc) - Date.parse(a.acq_datetime_utc));

    const cursorOffset = req.query.cursor ? Math.max(0, Number(req.query.cursor) || 0) : 0;
    const slice = matching.slice(cursorOffset, cursorOffset + limitRaw);
    const nextCursor =
      cursorOffset + limitRaw < matching.length ? String(cursorOffset + limitRaw) : null;

    const response: PaginatedObservationsResponse = {
      data_mode: firmsSnap.connected ? 'LIVE_NASA_FIRMS' : 'DEMO_SNAPSHOT',
      items: slice,
      total_matching: matching.length,
      limit: limitRaw,
      next_cursor: nextCursor,
      method: {
        id: 'M0_RAW',
        version: '1.0.0',
        note: 'M0_RAW canonical observations preserving native sensor confidence, pixel footprint (scan/track), and processing version.',
      },
      provenance: {
        sources: firmsSnap.connected
          ? ['NASA FIRMS Live Open Data CSV Streams (MODIS C6.1 & VIIRS C2)']
          : ['NASA FIRMS Archive Snapshot (MODIS C6.1 & VIIRS C2)'],
        retrieved_at_utc: firmsSnap.connected ? firmsSnap.syncedAtUtc : RETRIEVED_AT_UTC,
      },
    };

    res.json(response);
  });

  const PORT = 3000;
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
