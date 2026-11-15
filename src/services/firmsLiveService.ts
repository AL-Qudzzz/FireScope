import {
  AoiDefinition,
  CanonicalObservation,
  PlatformId,
  ProcessingStatus,
  SensorFilter,
  SensorId,
} from '../types/firescope';
import {
  deduplicateAndSupersedeObservations,
  deriveProcessingStatus,
  isOffshoreMarineObservation,
  isPointInAoi,
  parseUtcAcquisitionTime,
  validateCoordinates,
} from '../science/fireScience';

export interface FirmsFeedSourceConfig {
  id: 'modis-c61' | 'viirs-noaa20-c2' | 'viirs-noaa21-c2' | 'viirs-snpp-c2';
  sensor: SensorId;
  defaultPlatform: PlatformId;
  sourceProduct: string;
  collection: string;
  areaApiSourceName: string;
  url24h: string;
}

export const NASA_FIRMS_GLOBAL_24H_FEEDS: FirmsFeedSourceConfig[] = [
  {
    id: 'modis-c61',
    sensor: 'MODIS',
    defaultPlatform: 'TERRA',
    sourceProduct: 'MCD14DL_NRT',
    collection: 'MODIS C6.1',
    areaApiSourceName: 'MODIS_NRT',
    url24h:
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
  },
  {
    id: 'viirs-noaa20-c2',
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA20',
    sourceProduct: 'VJ114IMGTDL_NRT',
    collection: 'VIIRS C2',
    areaApiSourceName: 'VIIRS_NOAA20_NRT',
    url24h:
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv',
  },
  {
    id: 'viirs-noaa21-c2',
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA21',
    sourceProduct: 'VJ214IMGTDL_NRT',
    collection: 'VIIRS C2',
    areaApiSourceName: 'VIIRS_NOAA21_NRT',
    url24h:
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv',
  },
  {
    id: 'viirs-snpp-c2',
    sensor: 'VIIRS',
    defaultPlatform: 'SNPP',
    sourceProduct: 'VNP14IMGTDL_NRT',
    collection: 'VIIRS C2',
    areaApiSourceName: 'VIIRS_SNPP_NRT',
    url24h:
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
  },
];

export interface FirmsFeedSyncStat {
  id: string;
  product: string;
  platform: string;
  row_count: number;
  sha256: string;
  source_url: string;
}

export interface LiveFirmsSnapshot {
  observations: CanonicalObservation[];
  feedStats: FirmsFeedSyncStat[];
  syncedAtUtc: string;
  latestAcquisitionUtc: string;
  minDate: string;
  maxDate: string;
  connected: boolean;
}

function resolveFirmsPlatform(
  rawSat: string,
  sensor: SensorId,
  fallback: PlatformId
): PlatformId {
  const s = rawSat.trim().toUpperCase();
  if (sensor === 'MODIS') {
    if (s === 'T' || s.includes('TERRA')) return 'TERRA';
    if (s === 'A' || s.includes('AQUA')) return 'AQUA';
    return fallback;
  }
  if (s === 'N' || s.includes('SNPP') || s.includes('SUOMI')) return 'SNPP';
  if (
    s === '1' ||
    s === 'N20' ||
    s === 'J1' ||
    s.includes('NOAA-20') ||
    s.includes('NOAA 20') ||
    s.includes('NOAA20')
  ) {
    return 'NOAA20';
  }
  if (
    s === '2' ||
    s === 'N21' ||
    s === 'J2' ||
    s.includes('NOAA-21') ||
    s.includes('NOAA 21') ||
    s.includes('NOAA21')
  ) {
    return 'NOAA21';
  }
  return fallback;
}

function parseOptionalNumber(val: string | undefined): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function normalizeViirsConf(val: string | undefined): 'low' | 'nominal' | 'high' | string {
  const c = (val ?? '').trim().toLowerCase();
  if (c === 'l' || c === 'low') return 'low';
  if (c === 'n' || c === 'nominal') return 'nominal';
  if (c === 'h' || c === 'high') return 'high';
  return c || 'nominal';
}

/**
 * High-speed CSV parser for official NASA FIRMS MODIS C6.1 and VIIRS C2 CSV files.
 * Never mutates coordinates, never drops real coastal/island detections, and preserves native confidence & footprint.
 */
export function parseFirmsActiveFireCsv(
  csvText: string,
  options: {
    sensor: SensorId;
    defaultPlatform: PlatformId;
    sourceProduct: string;
    collection: string;
    retrievedAtUtc: string;
    checksum: string;
  }
): CanonicalObservation[] {
  const trimmed = csvText.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idxLat = headers.indexOf('latitude');
  const idxLng = headers.indexOf('longitude');
  const idxScan = headers.indexOf('scan');
  const idxTrack = headers.indexOf('track');
  const idxDate = headers.indexOf('acq_date');
  const idxTime = headers.indexOf('acq_time');
  const idxSat = headers.indexOf('satellite');
  const idxConf = headers.indexOf('confidence');
  const idxVer = headers.indexOf('version');
  const idxFrp = headers.indexOf('frp');
  const idxDayNight = headers.indexOf('daynight');
  const idxType = headers.indexOf('type');

  const idxBrightModis = headers.indexOf('brightness');
  const idxBrightT31 = headers.indexOf('bright_t31');
  const idxBrightTi4 = headers.indexOf('bright_ti4');
  const idxBrightTi5 = headers.indexOf('bright_ti5');

  if (idxLat < 0 || idxLng < 0 || idxDate < 0 || idxTime < 0) {
    return [];
  }

  const results: CanonicalObservation[] = [];
  const isModis = options.sensor === 'MODIS';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 7) continue;

    const lat = Number(cols[idxLat]);
    const lng = Number(cols[idxLng]);
    if (!validateCoordinates(lat, lng)) continue;

    const acqDate = (cols[idxDate] ?? '').trim();
    const rawTime = (cols[idxTime] ?? '').trim();
    let acqDatetimeUtc: string;
    let paddedHhmm: string;
    try {
      const parsedTime = parseUtcAcquisitionTime(acqDate, rawTime);
      acqDatetimeUtc = parsedTime.acqDatetimeUtc;
      paddedHhmm = parsedTime.paddedHhmm;
    } catch {
      continue;
    }

    const rawSat = idxSat >= 0 ? cols[idxSat] ?? '' : '';
    const platform = resolveFirmsPlatform(rawSat, options.sensor, options.defaultPlatform);
    const versionStr = (idxVer >= 0 ? cols[idxVer] : '')?.trim() || (isModis ? '6.1NRT' : '2.0NRT');
    const processingStatus: ProcessingStatus = deriveProcessingStatus(versionStr);

    const rawConf = idxConf >= 0 ? cols[idxConf] : '';
    let confidenceNative: number | string | null = null;
    if (isModis) {
      const confNum = parseOptionalNumber(rawConf);
      confidenceNative = confNum !== null ? Math.round(confNum) : rawConf.trim() || null;
    } else {
      confidenceNative = normalizeViirsConf(rawConf);
    }

    const frpMw = idxFrp >= 0 ? parseOptionalNumber(cols[idxFrp]) : null;
    const scanNative = idxScan >= 0 ? parseOptionalNumber(cols[idxScan]) : null;
    const trackNative = idxTrack >= 0 ? parseOptionalNumber(cols[idxTrack]) : null;
    const brightnessNative = idxBrightModis >= 0 ? parseOptionalNumber(cols[idxBrightModis]) : null;
    const brightT31Native = idxBrightT31 >= 0 ? parseOptionalNumber(cols[idxBrightT31]) : null;
    const brightTi4Native = idxBrightTi4 >= 0 ? parseOptionalNumber(cols[idxBrightTi4]) : null;
    const brightTi5Native = idxBrightTi5 >= 0 ? parseOptionalNumber(cols[idxBrightTi5]) : null;

    const dnRaw = idxDayNight >= 0 ? (cols[idxDayNight] ?? '').trim().toUpperCase() : '';
    const daynightNative: 'D' | 'N' | null = dnRaw === 'D' || dnRaw === 'N' ? dnRaw : null;

    const typeVal = idxType >= 0 ? parseOptionalNumber(cols[idxType]) : null;

    const obsId = `${options.sensor}-${platform}-${acqDate}-${paddedHhmm}-${lat.toFixed(5)}-${lng.toFixed(5)}`;

    results.push({
      observation_id: obsId,
      source_product: options.sourceProduct,
      sensor: options.sensor,
      platform,
      instrument: options.sensor,
      latitude: lat,
      longitude: lng,
      acq_datetime_utc: acqDatetimeUtc,
      acq_date: acqDate,
      acq_time_native: paddedHhmm,
      frp_mw: frpMw,
      brightness_native: brightnessNative,
      bright_ti4_native: brightTi4Native,
      bright_ti5_native: brightTi5Native,
      bright_t31_native: brightT31Native,
      scan_native: scanNative,
      track_native: trackNative,
      confidence_native: confidenceNative,
      confidence_scheme: isModis ? 'MODIS_NUMERIC_0_100' : 'VIIRS_C2_CATEGORICAL',
      daynight_native: daynightNative,
      type_native: typeVal,
      processing_version: versionStr,
      processing_status: processingStatus,
      collection: options.collection,
      source_retrieved_at_utc: options.retrievedAtUtc,
      source_file_checksum: options.checksum,
      source_row_number: i,
      raw_attributes: {
        satellite: rawSat.trim() || platform,
        version: versionStr,
        source_feed: options.sourceProduct,
      },
    });
  }

  return results;
}

function normalizeLng180(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * Checks whether a longitude falls within viewport [west, east], supporting world-wrapping and antimeridian spans.
 */
function isLongitudeInViewport(lng: number, west: number, east: number): boolean {
  if (east - west >= 359.5) return true;
  const w = normalizeLng180(west);
  const e = normalizeLng180(east);
  if (w <= e) {
    return lng >= w && lng <= e;
  }
  // Wraps across antimeridian (-180/+180)
  return lng >= w || lng <= e;
}

export interface ViewportHotspotsQuery {
  observations: CanonicalObservation[];
  bounds?: { west: number; south: number; east: number; north: number };
  aoi?: AoiDefinition;
  startDate?: string;
  endDate?: string;
  sensor?: SensorFilter;
  platforms?: PlatformId[];
  processingStatus?: ProcessingStatus | 'ALL';
  dayNight?: 'ALL' | 'D' | 'N';
  modisMinConfidence?: number;
  viirsCategories?: Array<'low' | 'nominal' | 'high'>;
  excludeOffshore?: boolean;
  maxPoints?: number;
}

export interface ViewportHotspotsResult {
  items: CanonicalObservation[];
  totalInViewport: number;
  excludedOffshoreCount: number;
  sampled: boolean;
}

/**
 * Filters official NASA FIRMS observations to the requested map viewport + scientific query parameters.
 * - Regional/country views (<= maxPoints, default 5000): returns 100% ALL exact NASA points (unsampled).
 * - Global zoomed-out views (> maxPoints): performs deterministic stratified spatial-grid selection
 *   preserving both MODIS and VIIRS spatial clusters across every continent without freezing the browser.
 */
export function queryLiveFirmsViewport(params: ViewportHotspotsQuery): ViewportHotspotsResult {
  const {
    observations,
    bounds,
    aoi,
    startDate,
    endDate,
    sensor = 'ALL',
    platforms = ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus = 'ALL',
    dayNight = 'ALL',
    modisMinConfidence = 0,
    viirsCategories = ['low', 'nominal', 'high'],
    excludeOffshore = false,
    maxPoints = 5000,
  } = params;

  const filterByAoi = Boolean(aoi && aoi.id !== 'global-world');
  const matching: CanonicalObservation[] = [];
  let excludedOffshoreCount = 0;

  for (let i = 0; i < observations.length; i++) {
    const r = observations[i];

    if (sensor !== 'ALL' && r.sensor !== sensor) continue;
    if (!platforms.includes(r.platform)) continue;
    if (processingStatus !== 'ALL' && r.processing_status !== processingStatus) continue;
    if (dayNight !== 'ALL' && r.daynight_native !== dayNight) continue;
    if (startDate && r.acq_date < startDate) continue;
    if (endDate && r.acq_date > endDate) continue;

    if (r.sensor === 'MODIS' && typeof r.confidence_native === 'number') {
      if (r.confidence_native < modisMinConfidence) continue;
    }
    if (r.sensor === 'VIIRS' && typeof r.confidence_native === 'string') {
      if (!viirsCategories.includes(r.confidence_native as 'low' | 'nominal' | 'high')) {
        continue;
      }
    }

    if (bounds) {
      if (r.latitude < bounds.south || r.latitude > bounds.north) continue;
      if (!isLongitudeInViewport(r.longitude, bounds.west, bounds.east)) continue;
    }

    if (filterByAoi && aoi) {
      if (!isPointInAoi(r.latitude, r.longitude, aoi)) continue;
    }

    if (excludeOffshore && isOffshoreMarineObservation(r)) {
      excludedOffshoreCount += 1;
      continue;
    }

    matching.push(r);
  }

  const totalInViewport = matching.length;
  if (totalInViewport <= maxPoints) {
    return {
      items: matching,
      totalInViewport,
      excludedOffshoreCount,
      sampled: false,
    };
  }

  // Deterministic stratified spatial-grid sampling for wide global zoom levels
  const minLat = bounds ? Math.max(-85, bounds.south) : -65;
  const maxLat = bounds ? Math.min(85, bounds.north) : 75;
  const latSpan = Math.max(1, maxLat - minLat);

  const isGlobalSpan = !bounds || bounds.east - bounds.west >= 359.5;
  const minLng = isGlobalSpan ? -180 : bounds!.west;
  const lngSpan = isGlobalSpan ? 360 : Math.max(1, bounds!.east - bounds!.west);

  const gridRows = 72;
  const gridCols = 144;
  const buckets = new Map<string, CanonicalObservation[]>();

  for (let i = 0; i < matching.length; i++) {
    const r = matching[i];
    const row = Math.min(
      gridRows - 1,
      Math.max(0, Math.floor(((r.latitude - minLat) / latSpan) * gridRows))
    );
    let colOffsetLng = r.longitude - minLng;
    if (colOffsetLng < 0) colOffsetLng += 360;
    if (colOffsetLng >= 360) colOffsetLng -= 360;
    const col = Math.min(
      gridCols - 1,
      Math.max(0, Math.floor((colOffsetLng / lngSpan) * gridCols))
    );
    const key = `${row}:${col}:${r.sensor}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(r);
  }

  const bucketArrays = Array.from(buckets.values());
  for (const list of bucketArrays) {
    list.sort((a, b) => (b.frp_mw ?? 0) - (a.frp_mw ?? 0));
  }

  const selected: CanonicalObservation[] = [];
  let layerIdx = 0;
  while (selected.length < maxPoints) {
    let addedInPass = false;
    for (let b = 0; b < bucketArrays.length && selected.length < maxPoints; b++) {
      const list = bucketArrays[b];
      if (layerIdx < list.length) {
        selected.push(list[layerIdx]);
        addedInPass = true;
      }
    }
    if (!addedInPass) break;
    layerIdx += 1;
  }

  return {
    items: selected,
    totalInViewport,
    excludedOffshoreCount,
    sampled: true,
  };
}

/**
 * Fetches live official NASA FIRMS Global 24h CSV datasets directly from FIRMS EOSDIS servers (no API key needed).
 * Optionally computes SHA-256 digest using injected hash function on the server.
 */
export async function fetchLiveFirmsGlobalStreams(
  hashFn?: (text: string) => string
): Promise<LiveFirmsSnapshot> {
  const syncedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const feedStats: FirmsFeedSyncStat[] = [];
  const allObservations: CanonicalObservation[] = [];
  let minDate = '9999-12-31';
  let maxDate = '0000-01-01';
  let latestAcquisitionUtc = syncedAtUtc;
  let latestAcquisitionMs = 0;
  let anySuccess = false;

  const responses = await Promise.allSettled(
    NASA_FIRMS_GLOBAL_24H_FEEDS.map(async (feed) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(feed.url24h, {
          signal: controller.signal,
          headers: { Accept: 'text/csv,text/plain' },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} for ${feed.id}`);
        }
        const csvText = await res.text();
        const sha256 = hashFn
          ? hashFn(csvText)
          : `firms-${feed.id}-${csvText.length}-${syncedAtUtc.slice(0, 10)}`;
        const parsed = parseFirmsActiveFireCsv(csvText, {
          sensor: feed.sensor,
          defaultPlatform: feed.defaultPlatform,
          sourceProduct: feed.sourceProduct,
          collection: feed.collection,
          retrievedAtUtc: syncedAtUtc,
          checksum: sha256,
        });
        return { feed, parsed, sha256 };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  for (const outcome of responses) {
    if (outcome.status === 'fulfilled') {
      anySuccess = true;
      const { feed, parsed, sha256 } = outcome.value;
      feedStats.push({
        id: feed.id,
        product: feed.sourceProduct,
        platform: feed.defaultPlatform,
        row_count: parsed.length,
        sha256,
        source_url: feed.url24h,
      });

      for (let i = 0; i < parsed.length; i++) {
        const obs = parsed[i];
        allObservations.push(obs);
        if (obs.acq_date < minDate) minDate = obs.acq_date;
        if (obs.acq_date > maxDate) maxDate = obs.acq_date;
        const tMs = Date.parse(obs.acq_datetime_utc);
        if (tMs > latestAcquisitionMs) {
          latestAcquisitionMs = tMs;
          latestAcquisitionUtc = obs.acq_datetime_utc;
        }
      }
    }
  }

  if (!anySuccess) {
    throw new Error('All NASA FIRMS Global 24h CSV endpoints failed to respond.');
  }

  if (minDate === '9999-12-31') minDate = syncedAtUtc.slice(0, 10);
  if (maxDate === '0000-01-01') maxDate = syncedAtUtc.slice(0, 10);

  return {
    observations: allObservations,
    feedStats,
    syncedAtUtc,
    latestAcquisitionUtc,
    minDate,
    maxDate,
    connected: true,
  };
}

/**
 * Optional NASA FIRMS Area API fetcher when FIRMS_MAP_KEY is provided in environment variables (.env).
 * Enables querying up to 5-day regional Area API windows:
 * https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{dayRange}/{date}
 */
export async function fetchFirmsAreaApiWithKey(params: {
  mapKey: string;
  bbox: { west: number; south: number; east: number; north: number };
  dayRange: number;
  date?: string;
  hashFn?: (text: string) => string;
}): Promise<CanonicalObservation[]> {
  const { mapKey, bbox, dayRange, date, hashFn } = params;
  const clampedDays = Math.max(1, Math.min(5, Math.round(dayRange)));
  const areaStr = `${bbox.west.toFixed(3)},${bbox.south.toFixed(3)},${bbox.east.toFixed(3)},${bbox.north.toFixed(3)}`;
  const retrievedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const areaFeeds = NASA_FIRMS_GLOBAL_24H_FEEDS.slice(0, 3);
  const all: CanonicalObservation[] = [];

  const results = await Promise.allSettled(
    areaFeeds.map(async (feed) => {
      const base = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${feed.areaApiSourceName}/${areaStr}/${clampedDays}`;
      const url = date ? `${base}/${date}` : base;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return [];
        const text = await res.text();
        const checksum = hashFn ? hashFn(text) : `firms-area-${feed.id}`;
        return parseFirmsActiveFireCsv(text, {
          sensor: feed.sensor,
          defaultPlatform: feed.defaultPlatform,
          sourceProduct: feed.sourceProduct,
          collection: feed.collection,
          retrievedAtUtc,
          checksum,
        });
      } finally {
        clearTimeout(timer);
      }
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const vals = r.value;
      for (let i = 0; i < vals.length; i++) {
        all.push(vals[i]);
      }
    }
  }
  return all;
}

interface AreaSourceSpec {
  sourceName: string;
  sensor: SensorId;
  defaultPlatform: PlatformId;
  sourceProduct: string;
  collection: string;
  minDate: string;
  maxDate: string;
  isNrt: boolean;
}

const DEFAULT_AREA_SOURCE_SPECS: AreaSourceSpec[] = [
  {
    sourceName: 'MODIS_SP',
    sensor: 'MODIS',
    defaultPlatform: 'TERRA',
    sourceProduct: 'MCD14ML',
    collection: 'MODIS C6.1',
    minDate: '2000-11-01',
    maxDate: '2026-08-31',
    isNrt: false,
  },
  {
    sourceName: 'MODIS_NRT',
    sensor: 'MODIS',
    defaultPlatform: 'TERRA',
    sourceProduct: 'MCD14DL_NRT',
    collection: 'MODIS C6.1',
    minDate: '2026-09-01',
    maxDate: '2099-12-31',
    isNrt: true,
  },
  {
    sourceName: 'VIIRS_SNPP_SP',
    sensor: 'VIIRS',
    defaultPlatform: 'SNPP',
    sourceProduct: 'VNP14IMGML',
    collection: 'VIIRS C2',
    minDate: '2012-01-20',
    maxDate: '2026-07-31',
    isNrt: false,
  },
  {
    sourceName: 'VIIRS_SNPP_NRT',
    sensor: 'VIIRS',
    defaultPlatform: 'SNPP',
    sourceProduct: 'VNP14IMGTDL_NRT',
    collection: 'VIIRS C2',
    minDate: '2026-08-01',
    maxDate: '2026-11-02',
    isNrt: true,
  },
  {
    sourceName: 'VIIRS_NOAA20_SP',
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA20',
    sourceProduct: 'VJ114IMGML',
    collection: 'VIIRS C2',
    minDate: '2018-04-01',
    maxDate: '2026-07-31',
    isNrt: false,
  },
  {
    sourceName: 'VIIRS_NOAA20_NRT',
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA20',
    sourceProduct: 'VJ114IMGTDL_NRT',
    collection: 'VIIRS C2',
    minDate: '2026-08-01',
    maxDate: '2099-12-31',
    isNrt: true,
  },
  {
    sourceName: 'VIIRS_NOAA21_SP',
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA21',
    sourceProduct: 'VJ214IMGML',
    collection: 'VIIRS C2',
    minDate: '2023-03-01',
    maxDate: '2026-07-31',
    isNrt: false,
  },
  {
    sourceName: 'VIIRS_NOAA21_NRT',
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA21',
    sourceProduct: 'VJ214IMGTDL_NRT',
    collection: 'VIIRS C2',
    minDate: '2024-01-17',
    maxDate: '2099-12-31',
    isNrt: true,
  },
];

interface CachedAreaChunkEntry {
  csvText: string;
  checksum: string;
  retrievedAtUtc: string;
}

const memoryAreaChunkCache = new Map<string, CachedAreaChunkEntry>();
let diskCacheLoaded = false;
let diskCacheFileLoaded: string | null = null;
let cachedAvailability: { checkedAtMs: number; specs: AreaSourceSpec[] } | null = null;

function shiftUtcDateStr(dateStr: string, deltaDays: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ms)) return dateStr;
  return new Date(ms + deltaDays * 86400000).toISOString().slice(0, 10);
}

function diffUtcDaysInclusive(startDate: string, endDate: string): number {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

async function getAreaSourceSpecs(mapKey: string): Promise<AreaSourceSpec[]> {
  const now = Date.now();
  if (cachedAvailability && now - cachedAvailability.checkedAtMs < 3600_000) {
    return cachedAvailability.specs;
  }

  const specs = DEFAULT_AREA_SOURCE_SPECS.map((s) => ({ ...s }));
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${encodeURIComponent(mapKey)}/all`;
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split(/\r?\n/);
        if (lines.length > 1) {
          const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
          const idxId = headers.indexOf('data_id');
          const idxMin = headers.indexOf('min_date');
          const idxMax = headers.indexOf('max_date');
          if (idxId !== -1 && idxMin !== -1 && idxMax !== -1) {
            const availMap = new Map<string, { min: string; max: string }>();
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',').map((c) => c.trim());
              const id = cols[idxId];
              const minD = cols[idxMin];
              const maxD = cols[idxMax];
              if (id && /^\d{4}-\d{2}-\d{2}$/.test(minD) && /^\d{4}-\d{2}-\d{2}$/.test(maxD)) {
                availMap.set(id, { min: minD, max: maxD });
              }
            }
            for (const spec of specs) {
              const live = availMap.get(spec.sourceName);
              if (live) {
                spec.minDate = live.min;
                // Keep SNPP closed at NASA's reported maxDate; allow other NRT feeds slightly past lag
                spec.maxDate = live.max;
              }
            }
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Fall back silently to DEFAULT_AREA_SOURCE_SPECS
  }

  cachedAvailability = { checkedAtMs: now, specs };
  return specs;
}

async function ensureDiskAreaCacheLoaded(cacheFilePath?: string): Promise<void> {
  if (!cacheFilePath) return;
  if (diskCacheLoaded && diskCacheFileLoaded === cacheFilePath) return;
  try {
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile(cacheFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, CachedAreaChunkEntry>;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.csvText === 'string' && !memoryAreaChunkCache.has(k)) {
        memoryAreaChunkCache.set(k, v);
      }
    }
  } catch {
    // No disk cache yet or non-Node environment
  }
  diskCacheLoaded = true;
  diskCacheFileLoaded = cacheFilePath;
}

async function persistDiskAreaCache(cacheFilePath?: string): Promise<void> {
  if (!cacheFilePath) return;
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
    const obj: Record<string, CachedAreaChunkEntry> = {};
    for (const [k, v] of memoryAreaChunkCache.entries()) {
      obj[k] = v;
    }
    await fs.writeFile(cacheFilePath, JSON.stringify(obj), 'utf8');
  } catch {
    // Ignore cache write failures cleanly
  }
}

export interface FirmsAreaRangeParams {
  mapKey: string;
  bbox: { west: number; south: number; east: number; north: number };
  startDate: string;
  endDate: string;
  sensor?: SensorFilter;
  platforms?: PlatformId[];
  maxWindowDays?: number;
  cacheFilePath?: string;
  concurrency?: number;
  hashFn?: (text: string) => string;
}

export interface FirmsAreaRangeResult {
  observations: CanonicalObservation[];
  feedStats: FirmsFeedSyncStat[];
  truncated: boolean;
  requestedStartDate: string;
  effectiveStartDate: string;
  endDate: string;
  cacheHits: number;
  apiCalls: number;
}

/**
 * Queries official NASA FIRMS Area API across Standard Processing (_SP) and Near Real-Time (_NRT)
 * collections using accurate 5-day chunk start dates (`/{dayRange}/{chunkStartDate}`), caching
 * every chunk in memory and optional JSON disk storage, and deduplicating/superseding NRT with STANDARD.
 */
export async function fetchFirmsAreaRangeWithKey(
  params: FirmsAreaRangeParams
): Promise<FirmsAreaRangeResult> {
  const {
    mapKey,
    bbox,
    startDate,
    endDate,
    sensor = 'ALL',
    platforms,
    maxWindowDays = 45,
    cacheFilePath,
    concurrency = 3,
    hashFn,
  } = params;

  await ensureDiskAreaCacheLoaded(cacheFilePath);

  const totalDays = diffUtcDaysInclusive(startDate, endDate);
  if (totalDays <= 0) {
    return {
      observations: [],
      feedStats: [],
      truncated: false,
      requestedStartDate: startDate,
      effectiveStartDate: startDate,
      endDate,
      cacheHits: 0,
      apiCalls: 0,
    };
  }

  const truncated = totalDays > maxWindowDays;
  const effectiveStartDate = truncated
    ? shiftUtcDateStr(endDate, -(maxWindowDays - 1))
    : startDate;

  const areaStr = `${bbox.west.toFixed(3)},${bbox.south.toFixed(3)},${bbox.east.toFixed(3)},${bbox.north.toFixed(3)}`;
  const specs = await getAreaSourceSpecs(mapKey);

  // Filter sources matching requested sensor & platforms
  const activePlatformSet = platforms && platforms.length > 0 ? new Set(platforms) : null;
  const candidateSpecs = specs.filter((spec) => {
    if (sensor !== 'ALL' && spec.sensor !== sensor) return false;
    if (activePlatformSet) {
      if (spec.sensor === 'MODIS') {
        if (!activePlatformSet.has('TERRA') && !activePlatformSet.has('AQUA')) return false;
      } else if (!activePlatformSet.has(spec.defaultPlatform)) {
        return false;
      }
    }
    return effectiveStartDate <= spec.maxDate && endDate >= spec.minDate;
  });

  // Build 5-day chunks within effective window
  const chunks: Array<{ start: string; end: string; days: number }> = [];
  let cursor = effectiveStartDate;
  while (cursor <= endDate) {
    const remaining = diffUtcDaysInclusive(cursor, endDate);
    const days = Math.min(5, remaining);
    const chunkEnd = shiftUtcDateStr(cursor, days - 1);
    chunks.push({ start: cursor, end: chunkEnd, days });
    cursor = shiftUtcDateStr(chunkEnd, 1);
  }

  // Pair each chunk only with sources that cover it, preferring SP when SP fully covers the chunk
  const tasks: Array<{
    spec: AreaSourceSpec;
    chunk: { start: string; end: string; days: number };
    cacheKey: string;
  }> = [];

  for (const chunk of chunks) {
    const spModisCoversFull = candidateSpecs.some(
      (s) =>
        s.sourceName === 'MODIS_SP' && chunk.start >= s.minDate && chunk.end <= s.maxDate
    );

    for (const spec of candidateSpecs) {
      if (chunk.end < spec.minDate || chunk.start > spec.maxDate) continue;
      // Avoid duplicate NRT request if SP already covers the entire 5-day chunk for the same sensor/platform
      if (spec.sourceName === 'MODIS_NRT' && spModisCoversFull) continue;
      if (spec.isNrt && spec.sensor === 'VIIRS') {
        const correspondingSp = candidateSpecs.find(
          (s) =>
            !s.isNrt &&
            s.sensor === 'VIIRS' &&
            s.defaultPlatform === spec.defaultPlatform &&
            chunk.start >= s.minDate &&
            chunk.end <= s.maxDate
        );
        if (correspondingSp) continue;
      }
      const cacheKey = `${spec.sourceName}|${areaStr}|${chunk.start}|${chunk.days}`;
      tasks.push({ spec, chunk, cacheKey });
    }
  }

  const rawParsed: CanonicalObservation[] = [];
  const feedRowCounts = new Map<string, { spec: AreaSourceSpec; count: number; checksum: string; url: string }>();
  let cacheHits = 0;
  let apiCalls = 0;
  let wroteNewCache = false;

  // Bounded worker queue so NASA API rate limits & sockets stay healthy
  let taskIdx = 0;
  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));

  const runWorker = async () => {
    while (true) {
      const idx = taskIdx++;
      if (idx >= tasks.length) break;
      const { spec, chunk, cacheKey } = tasks[idx];
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${spec.sourceName}/${areaStr}/${chunk.days}/${chunk.start}`;
      const redactedUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/${spec.sourceName}/${areaStr}/${chunk.days}/${chunk.start}`;

      let entry = memoryAreaChunkCache.get(cacheKey);
      if (entry) {
        cacheHits += 1;
      } else {
        apiCalls += 1;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (res.ok) {
            const text = await res.text();
            // Do not cache FIRMS error banners accidentally returned as 200 text
            if (text.startsWith('Invalid ') || text.startsWith('Error ')) {
              continue;
            }
            const retrievedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
            const checksum = hashFn ? hashFn(text) : `firms-area-${spec.sourceName}-${chunk.start}`;
            entry = { csvText: text, checksum, retrievedAtUtc };
            memoryAreaChunkCache.set(cacheKey, entry);
            wroteNewCache = true;
          }
        } catch {
          // Swallow transient single-chunk timeout; other chunks/sources still return
        } finally {
          clearTimeout(timer);
        }
      }

      if (entry && entry.csvText.trim().length > 0) {
        const parsed = parseFirmsActiveFireCsv(entry.csvText, {
          sensor: spec.sensor,
          defaultPlatform: spec.defaultPlatform,
          sourceProduct: spec.sourceProduct,
          collection: spec.collection,
          retrievedAtUtc: entry.retrievedAtUtc,
          checksum: entry.checksum,
        });
        for (let i = 0; i < parsed.length; i++) {
          rawParsed.push(parsed[i]);
        }
        const prev = feedRowCounts.get(spec.sourceName);
        if (prev) {
          prev.count += parsed.length;
        } else {
          feedRowCounts.set(spec.sourceName, {
            spec,
            count: parsed.length,
            checksum: entry.checksum,
            url: redactedUrl,
          });
        }
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (wroteNewCache) {
    await persistDiskAreaCache(cacheFilePath);
  }

  // Deduplicate & supersede NRT with STANDARD when straddling cutoffs
  const deduped = deduplicateAndSupersedeObservations(rawParsed);
  const filtered = deduped.canonical.filter(
    (obs) => obs.acq_date >= effectiveStartDate && obs.acq_date <= endDate
  );

  const feedStats: FirmsFeedSyncStat[] = Array.from(feedRowCounts.values()).map((v) => ({
    id: `area-${v.spec.sourceName.toLowerCase()}`,
    product: v.spec.sourceProduct,
    platform:
      v.spec.sensor === 'MODIS' ? 'TERRA/AQUA' : v.spec.defaultPlatform,
    row_count: v.count,
    sha256: v.checksum,
    source_url: v.url,
  }));

  return {
    observations: filtered,
    feedStats,
    truncated,
    requestedStartDate: startDate,
    effectiveStartDate,
    endDate,
    cacheHits,
    apiCalls,
  };
}
