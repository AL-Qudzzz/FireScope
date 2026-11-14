import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs';
import path from 'path';
import {
  AoiDefinition,
  BoundingBox,
  CanonicalObservation,
  MapGridCell,
  ParquetArchiveManifest,
  PlatformId,
  ProcessingStatus,
  SensorFilter,
  SensorId,
} from '../types/firescope';
import { DailyAggregateBucket } from '../science/comparisonScience';
import { parseUtcAcquisitionTime } from '../science/fireScience';

const PROCESSED_DIR = path.join(process.cwd(), 'data', 'processed');
const DAILY_AGG_PARQUET = path.join(PROCESSED_DIR, 'daily_aggregates.parquet');
const RECENT_OBS_PARQUET = path.join(PROCESSED_DIR, 'recent_observations_2026.parquet');
const MANIFEST_JSON = path.join(PROCESSED_DIR, 'parquet_manifest.json');

let cachedManifest: ParquetArchiveManifest | null | undefined;
let duckdbInstance: DuckDBInstance | null = null;
let duckdbConnPromise: Promise<DuckDBConnection> | null = null;

const MAX_PARQUET_CACHE_ENTRIES = 128;
const parquetQueryCache = new Map<string, unknown>();
const inFlightParquetQueries = new Map<string, Promise<unknown>>();

async function withParquetCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (parquetQueryCache.has(key)) {
    return parquetQueryCache.get(key) as T;
  }
  const existing = inFlightParquetQueries.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const p = (async () => {
    try {
      const result = await fn();
      if (parquetQueryCache.size >= MAX_PARQUET_CACHE_ENTRIES) {
        const oldestKey = parquetQueryCache.keys().next().value;
        if (oldestKey !== undefined) {
          parquetQueryCache.delete(oldestKey);
        }
      }
      parquetQueryCache.set(key, result);
      return result;
    } finally {
      inFlightParquetQueries.delete(key);
    }
  })();
  inFlightParquetQueries.set(key, p);
  return p;
}

function sqlStr(val: string): string {
  return `'${val.replace(/'/g, "''")}'`;
}

function sqlInList(values: string[]): string {
  return values.map((v) => sqlStr(v)).join(', ');
}

export function getParquetManifest(): ParquetArchiveManifest | null {
  if (cachedManifest !== undefined) return cachedManifest;
  try {
    if (!fs.existsSync(DAILY_AGG_PARQUET) || !fs.existsSync(MANIFEST_JSON)) {
      cachedManifest = null;
      return null;
    }
    const raw = JSON.parse(fs.readFileSync(MANIFEST_JSON, 'utf8'));
    cachedManifest = {
      available: true,
      ...raw,
    } as ParquetArchiveManifest;
    return cachedManifest;
  } catch {
    cachedManifest = null;
    return null;
  }
}

async function getDuckDbConn(): Promise<DuckDBConnection> {
  if (duckdbConnPromise) return duckdbConnPromise;
  duckdbConnPromise = (async () => {
    duckdbInstance = await DuckDBInstance.create(':memory:');
    return duckdbInstance.connect();
  })();
  return duckdbConnPromise;
}

/**
 * Checks whether an AOI sits inside the spatial extent covered by the Indonesia FIRMS Parquet archive.
 */
export function isAoiInParquetCoverage(aoi: AoiDefinition): boolean {
  const manifest = getParquetManifest();
  if (!manifest || !manifest.available) return false;
  if (aoi.id === 'global-world') return false;
  const b = aoi.bbox;
  // Archive covers [95.0..141.0, -11.0..5.9]; treat Indonesia & immediate bounding AOIs as covered
  const overlapsIndonesia =
    b.east >= 94.5 && b.west <= 141.8 && b.north >= -11.5 && b.south <= 6.5;
  const spansOutsideSeAsia =
    b.east - b.west > 60 || b.west < 85 || b.east > 150 || b.south < -16 || b.north > 12;
  return overlapsIndonesia && !spansOutsideSeAsia;
}

function buildFilterWhereClause(params: {
  bbox: BoundingBox;
  startDate: string;
  endDate: string;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence: number;
  viirsCategories: Array<'low' | 'nominal' | 'high'>;
  useCellBins?: boolean;
}): string {
  const {
    bbox,
    startDate,
    endDate,
    sensor,
    platforms,
    processingStatus,
    dayNight,
    modisMinConfidence,
    viirsCategories,
    useCellBins = true,
  } = params;

  const clauses: string[] = [
    `acq_date >= ${sqlStr(startDate)}`,
    `acq_date <= ${sqlStr(endDate)}`,
  ];

  if (useCellBins) {
    // Half-open 0.25-deg cell [lat_bin, lat_bin + 0.25) x [lng_bin, lng_bin + 0.25) intersects AOI bbox
    const southOp = bbox.south === bbox.north ? '>=' : '>';
    const northOp = bbox.south === bbox.north ? '<=' : '<';
    const westOp = bbox.west === bbox.east ? '>=' : '>';
    const eastOp = bbox.west === bbox.east ? '<=' : '<';
    clauses.push(`(lat_bin + 0.25) ${southOp} ${Number(bbox.south)}`);
    clauses.push(`lat_bin ${northOp} ${Number(bbox.north)}`);
    clauses.push(`(lng_bin + 0.25) ${westOp} ${Number(bbox.west)}`);
    clauses.push(`lng_bin ${eastOp} ${Number(bbox.east)}`);
  } else {
    clauses.push(`latitude >= ${Number(bbox.south)}`);
    clauses.push(`latitude <= ${Number(bbox.north)}`);
    clauses.push(`longitude >= ${Number(bbox.west)}`);
    clauses.push(`longitude <= ${Number(bbox.east)}`);
  }

  if (sensor !== 'ALL') {
    clauses.push(`sensor = ${sqlStr(sensor)}`);
  }

  const validPlatforms = platforms.filter((p) =>
    ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'].includes(p)
  );
  if (validPlatforms.length > 0) {
    clauses.push(`platform IN (${sqlInList(validPlatforms)})`);
  } else {
    clauses.push('1 = 0');
  }

  if (processingStatus !== 'ALL') {
    clauses.push(`processing_status = ${sqlStr(processingStatus)}`);
  }

  if (dayNight !== 'ALL') {
    clauses.push(`daynight_native = ${sqlStr(dayNight)}`);
  }

  // Strictly preserve MODIS numeric vs VIIRS categorical confidence filters without conflating scales
  const allowedModisBuckets: string[] = [];
  if (modisMinConfidence <= 0) {
    allowedModisBuckets.push('low_0_29', 'nominal_30_79', 'high_80_100');
  } else if (modisMinConfidence <= 30) {
    allowedModisBuckets.push('nominal_30_79', 'high_80_100');
  } else if (modisMinConfidence < 80) {
    allowedModisBuckets.push('nominal_30_79', 'high_80_100');
  } else {
    allowedModisBuckets.push('high_80_100');
  }

  const allowedViirsBuckets = viirsCategories.filter((c) =>
    ['low', 'nominal', 'high'].includes(c)
  );
  if (allowedViirsBuckets.length === 0) {
    clauses.push(`sensor != 'VIIRS'`);
  }

  clauses.push(`(
    (sensor = 'MODIS' AND confidence_bucket IN (${sqlInList(allowedModisBuckets)}))
    OR
    (sensor = 'VIIRS' ${
      allowedViirsBuckets.length > 0
        ? `AND confidence_bucket IN (${sqlInList(allowedViirsBuckets)})`
        : 'AND 1 = 0'
    })
  )`);

  return clauses.join(' AND ');
}

/**
 * Queries pre-aggregated daily sensor/platform/confidence buckets from daily_aggregates.parquet.
 */
export async function queryParquetDailyBuckets(params: {
  bbox: BoundingBox;
  startDate: string;
  endDate: string;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence: number;
  viirsCategories: Array<'low' | 'nominal' | 'high'>;
}): Promise<DailyAggregateBucket[]> {
  const manifest = getParquetManifest();
  if (!manifest?.available) return [];

  const cacheKey = `daily:${JSON.stringify({
    b: params.bbox,
    s: params.startDate,
    e: params.endDate,
    sn: params.sensor,
    p: [...params.platforms].sort(),
    ps: params.processingStatus,
    dn: params.dayNight,
    mc: params.modisMinConfidence,
    vc: [...params.viirsCategories].sort(),
  })}`;

  return withParquetCache(cacheKey, async () => {
    const conn = await getDuckDbConn();
    const whereSql = buildFilterWhereClause({ ...params, useCellBins: true });

    const sql = `
      SELECT
        acq_date,
        sensor,
        platform,
        processing_status,
        daynight_native,
        confidence_bucket,
        SUM(detection_count)::INTEGER AS detection_count,
        SUM(frp_sum_mw)::DOUBLE AS frp_sum_mw,
        SUM(frp_valid_count)::INTEGER AS frp_valid_count,
        SUM(frp_null_count)::INTEGER AS frp_null_count,
        MAX(frp_max_mw)::DOUBLE AS frp_max_mw
      FROM read_parquet(${sqlStr(DAILY_AGG_PARQUET)})
      WHERE ${whereSql}
      GROUP BY acq_date, sensor, platform, processing_status, daynight_native, confidence_bucket
      ORDER BY acq_date ASC;
    `;

    const res = await conn.runAndReadAll(sql);
    return res.getRowObjects().map((r) => ({
      acq_date: String(r.acq_date),
      sensor: String(r.sensor) as SensorId,
      platform: String(r.platform) as PlatformId,
      processing_status: String(r.processing_status) as ProcessingStatus,
      daynight_native: String(r.daynight_native) as 'D' | 'N' | 'U',
      confidence_bucket: String(r.confidence_bucket),
      detection_count: Number(r.detection_count ?? 0),
      frp_sum_mw: Number(r.frp_sum_mw ?? 0),
      frp_valid_count: Number(r.frp_valid_count ?? 0),
      frp_null_count: Number(r.frp_null_count ?? 0),
      frp_max_mw: r.frp_max_mw !== null && r.frp_max_mw !== undefined ? Number(r.frp_max_mw) : null,
    }));
  });
}

/**
 * Fetches multi-year monthly totals for the same AOI across 2001..2026 to compute true historical seasonal baselines (FR-09).
 */
export async function queryParquetHistoricalMonthlyTotals(params: {
  bbox: BoundingBox;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence: number;
  viirsCategories: Array<'low' | 'nominal' | 'high'>;
}): Promise<
  Array<{
    year: number;
    month: string;
    modis_count: number;
    viirs_count: number;
    modis_frp_sum: number;
    viirs_frp_sum: number;
  }>
> {
  const manifest = getParquetManifest();
  if (!manifest?.available) return [];

  const cacheKey = `histMonthly:${JSON.stringify({
    b: params.bbox,
    sn: params.sensor,
    p: [...params.platforms].sort(),
    ps: params.processingStatus,
    dn: params.dayNight,
    mc: params.modisMinConfidence,
    vc: [...params.viirsCategories].sort(),
  })}`;

  return withParquetCache(cacheKey, async () => {
    const conn = await getDuckDbConn();
    const whereSql = buildFilterWhereClause({
      ...params,
      startDate: manifest.date_range.min_date,
      endDate: manifest.date_range.max_date,
      useCellBins: true,
    });

    const sql = `
      SELECT
        CAST(SUBSTR(acq_date, 1, 4) AS INTEGER) AS yr,
        SUBSTR(acq_date, 6, 2) AS mo,
        SUM(CASE WHEN sensor = 'MODIS' THEN detection_count ELSE 0 END)::INTEGER AS modis_count,
        SUM(CASE WHEN sensor = 'VIIRS' THEN detection_count ELSE 0 END)::INTEGER AS viirs_count,
        SUM(CASE WHEN sensor = 'MODIS' THEN frp_sum_mw ELSE 0 END)::DOUBLE AS modis_frp_sum,
        SUM(CASE WHEN sensor = 'VIIRS' THEN frp_sum_mw ELSE 0 END)::DOUBLE AS viirs_frp_sum
      FROM read_parquet(${sqlStr(DAILY_AGG_PARQUET)})
      WHERE ${whereSql}
      GROUP BY yr, mo
      ORDER BY yr ASC, mo ASC;
    `;

    const res = await conn.runAndReadAll(sql);
    return res.getRowObjects().map((r) => ({
      year: Number(r.yr),
      month: String(r.mo),
      modis_count: Number(r.modis_count ?? 0),
      viirs_count: Number(r.viirs_count ?? 0),
      modis_frp_sum: Number(r.modis_frp_sum ?? 0),
      viirs_frp_sum: Number(r.viirs_frp_sum ?? 0),
    }));
  });
}

/**
 * Aggregates spatial grid cells (0.25, 0.5, 1.0, or 2.0 deg) directly inside DuckDB from Parquet.
 */
export async function queryParquetMapGrid(params: {
  bbox: BoundingBox;
  cellSizeDeg: number;
  startDate: string;
  endDate: string;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence: number;
  viirsCategories: Array<'low' | 'nominal' | 'high'>;
}): Promise<MapGridCell[]> {
  const manifest = getParquetManifest();
  if (!manifest?.available) return [];

  const cellSize = [0.25, 0.5, 1.0, 2.0].includes(params.cellSizeDeg)
    ? params.cellSizeDeg
    : 0.5;
  const inv = 1 / cellSize;

  const cacheKey = `grid:${JSON.stringify({
    b: params.bbox,
    cs: cellSize,
    s: params.startDate,
    e: params.endDate,
    sn: params.sensor,
    p: [...params.platforms].sort(),
    ps: params.processingStatus,
    dn: params.dayNight,
    mc: params.modisMinConfidence,
    vc: [...params.viirsCategories].sort(),
  })}`;

  return withParquetCache(cacheKey, async () => {
    const conn = await getDuckDbConn();
    const whereSql = buildFilterWhereClause({ ...params, useCellBins: true });

    const sql = `
      SELECT
        (FLOOR(lat_bin * ${inv}) / ${inv})::DOUBLE AS g_lat,
        (FLOOR(lng_bin * ${inv}) / ${inv})::DOUBLE AS g_lng,
        SUM(CASE WHEN sensor = 'MODIS' THEN detection_count ELSE 0 END)::INTEGER AS modis_detections,
        SUM(CASE WHEN sensor = 'VIIRS' THEN detection_count ELSE 0 END)::INTEGER AS viirs_detections,
        SUM(CASE WHEN sensor = 'MODIS' THEN frp_sum_mw ELSE 0 END)::DOUBLE AS modis_frp_sum_mw,
        SUM(CASE WHEN sensor = 'VIIRS' THEN frp_sum_mw ELSE 0 END)::DOUBLE AS viirs_frp_sum_mw,
        STRING_AGG(DISTINCT platform, ',') AS platforms
      FROM read_parquet(${sqlStr(DAILY_AGG_PARQUET)})
      WHERE ${whereSql}
      GROUP BY g_lat, g_lng
      HAVING (SUM(detection_count)) > 0
      ORDER BY SUM(detection_count) DESC
      LIMIT 1800;
    `;

    const res = await conn.runAndReadAll(sql);
    return res.getRowObjects().map((r) => {
      const latBin = Number(r.g_lat);
      const lngBin = Number(r.g_lng);
      const modis = Number(r.modis_detections ?? 0);
      const viirs = Number(r.viirs_detections ?? 0);
      const platforms = String(r.platforms ?? '')
        .split(',')
        .filter(Boolean) as PlatformId[];

      return {
        cell_id: `${latBin}|${lngBin}`,
        lat_bin: latBin,
        lng_bin: lngBin,
        cell_size_deg: cellSize,
        centroid_lat: Number((latBin + cellSize / 2).toFixed(4)),
        centroid_lng: Number((lngBin + cellSize / 2).toFixed(4)),
        modis_detections: modis,
        viirs_detections: viirs,
        pooled_observation_count: modis + viirs,
        modis_frp_sum_mw: Number(Number(r.modis_frp_sum_mw ?? 0).toFixed(2)),
        viirs_frp_sum_mw: Number(Number(r.viirs_frp_sum_mw ?? 0).toFixed(2)),
        platforms,
        source_backing: 'PARQUET' as const,
      };
    });
  });
}

/**
 * Bounded M0_RAW point observations query for 2026-10-01..2026-11-12 from recent_observations_2026.parquet.
 */
export async function queryParquetRecentObservations(params: {
  bbox: BoundingBox;
  startUtc: string;
  endUtc: string;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence: number;
  viirsCategories: Array<'low' | 'nominal' | 'high'>;
  limit: number;
  offset: number;
}): Promise<{ items: CanonicalObservation[]; totalMatching: number } | null> {
  if (!fs.existsSync(RECENT_OBS_PARQUET)) return null;

  const startDate = params.startUtc.slice(0, 10);
  const endDate = params.endUtc.slice(0, 10);
  if (endDate < '2026-10-01') return null;

  const conn = await getDuckDbConn();
  const baseWhere = buildFilterWhereClause({
    bbox: params.bbox,
    startDate: startDate < '2026-10-01' ? '2026-10-01' : startDate,
    endDate,
    sensor: params.sensor,
    platforms: params.platforms,
    processingStatus: params.processingStatus,
    dayNight: params.dayNight,
    modisMinConfidence: params.modisMinConfidence,
    viirsCategories: params.viirsCategories,
    useCellBins: false,
  });

  // Extra strict confidence numeric filter on raw MODIS rows
  const extraModisFilter =
    params.modisMinConfidence > 0
      ? `AND (sensor != 'MODIS' OR TRY_CAST(confidence_raw AS DOUBLE) >= ${Number(
          params.modisMinConfidence
        )})`
      : '';

  const fullWhere = `${baseWhere} ${extraModisFilter}`;

  const countRes = await conn.runAndReadAll(`
    SELECT COUNT(*)::INTEGER AS total
    FROM read_parquet(${sqlStr(RECENT_OBS_PARQUET)})
    WHERE ${fullWhere};
  `);
  const totalMatching = Number(countRes.getRowObjects()[0]?.total ?? 0);

  if (totalMatching === 0) {
    return { items: [], totalMatching: 0 };
  }

  const rowsRes = await conn.runAndReadAll(`
    SELECT *
    FROM read_parquet(${sqlStr(RECENT_OBS_PARQUET)})
    WHERE ${fullWhere}
    ORDER BY acq_date DESC, acq_time_native DESC
    LIMIT ${Math.max(1, Math.min(250, params.limit))}
    OFFSET ${Math.max(0, params.offset)};
  `);

  const retrievedAt = getParquetManifest()?.generated_at_utc ?? new Date().toISOString();
  const items: CanonicalObservation[] = rowsRes.getRowObjects().map((r, idx) => {
    const sensor = String(r.sensor) as SensorId;
    const platform = String(r.platform) as PlatformId;
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    const acqDate = String(r.acq_date);
    const acqTime = String(r.acq_time_native);
    const { acqDatetimeUtc, paddedHhmm } = parseUtcAcquisitionTime(acqDate, acqTime);
    const confRaw = String(r.confidence_raw ?? '');
    const confBucket = String(r.confidence_bucket ?? 'nominal');
    const confNative =
      sensor === 'MODIS'
        ? Number.isFinite(Number(confRaw))
          ? Math.round(Number(confRaw))
          : confRaw
        : confBucket;

    return {
      observation_id: `${sensor}-${platform}-${acqDate}-${paddedHhmm}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      source_product: String(r.source_product),
      sensor,
      platform,
      instrument: sensor,
      latitude: lat,
      longitude: lng,
      acq_datetime_utc: acqDatetimeUtc,
      acq_date: acqDate,
      acq_time_native: paddedHhmm,
      frp_mw: r.frp !== null && r.frp !== undefined ? Number(r.frp) : null,
      brightness_native:
        sensor === 'MODIS' && r.brightness_or_ti4 !== null ? Number(r.brightness_or_ti4) : null,
      bright_ti4_native:
        sensor === 'VIIRS' && r.brightness_or_ti4 !== null ? Number(r.brightness_or_ti4) : null,
      bright_ti5_native:
        sensor === 'VIIRS' && r.bright_t31_or_ti5 !== null ? Number(r.bright_t31_or_ti5) : null,
      bright_t31_native:
        sensor === 'MODIS' && r.bright_t31_or_ti5 !== null ? Number(r.bright_t31_or_ti5) : null,
      scan_native: r.scan !== null ? Number(r.scan) : null,
      track_native: r.track !== null ? Number(r.track) : null,
      confidence_native: confNative,
      confidence_scheme:
        sensor === 'MODIS' ? 'MODIS_NUMERIC_0_100' : 'VIIRS_C2_CATEGORICAL',
      daynight_native:
        r.daynight_native === 'D' || r.daynight_native === 'N'
          ? r.daynight_native
          : null,
      type_native: null,
      processing_version: String(r.processing_version),
      processing_status: String(r.processing_status) as ProcessingStatus,
      collection: String(r.collection),
      source_retrieved_at_utc: retrievedAt,
      source_file_checksum: String(r.source_file_checksum),
      source_row_number: params.offset + idx + 1,
      raw_attributes: {
        acq_date: acqDate,
        acq_time: paddedHhmm,
        confidence: confRaw,
        version: String(r.processing_version),
        frp: r.frp !== null ? Number(r.frp) : null,
      },
    };
  });

  return { items, totalMatching };
}
