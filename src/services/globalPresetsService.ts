import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PRESET_AOIS } from '../data/firmsArchiveData';
import { DailyAggregateBucket } from '../science/comparisonScience';
import { isPointInAoi } from '../science/fireScience';
import {
  AoiDefinition,
  BoundingBox,
  CanonicalObservation,
  MapGridCell,
  PlatformId,
  ProcessingStatus,
  SensorFilter,
} from '../types/firescope';

export interface GlobalPresetsManifest {
  available: boolean;
  schema_version: string;
  generated_at_utc: string;
  source: string;
  aoi_ids: string[];
  coverage_windows: Array<{ start_date: string; end_date: string }>;
  aoi_row_summary: Record<string, Record<string, number>>;
  canonical_rows_total: number;
  bucket_rows_total: number;
  representative_observations_total: number;
  superseded_nrt_count: number;
  exact_duplicates_removed: number;
  checksums: string[];
}

interface GlobalPresetsFilePayload {
  schema_version: string;
  generated_at_utc: string;
  source: string;
  aoi_ids: string[];
  coverage_windows: Array<{ start_date: string; end_date: string }>;
  aoi_row_summary: Record<string, Record<string, number>>;
  canonical_rows_total: number;
  bucket_rows_total?: number;
  representative_observations_total?: number;
  superseded_nrt_count: number;
  exact_duplicates_removed: number;
  checksums: string[];
  daily_buckets?: DailyAggregateBucket[];
  observations: CanonicalObservation[];
}

const DATA_FILE_PATH = path.resolve(
  process.cwd(),
  'data/processed/global_presets_nasa.json.gz'
);

let cachedData: GlobalPresetsFilePayload | null | undefined;
let cachedSeededAois: AoiDefinition[] = [];

function loadGlobalPresetsFile(): GlobalPresetsFilePayload | null {
  if (cachedData !== undefined) return cachedData;
  try {
    if (!fs.existsSync(DATA_FILE_PATH)) {
      cachedData = null;
      cachedSeededAois = [];
      return null;
    }
    const raw = zlib.gunzipSync(fs.readFileSync(DATA_FILE_PATH)).toString('utf8');
    const parsed = JSON.parse(raw) as GlobalPresetsFilePayload;
    if (!parsed || !Array.isArray(parsed.observations)) {
      cachedData = null;
      cachedSeededAois = [];
      return null;
    }
    cachedData = parsed;
    cachedSeededAois = PRESET_AOIS.filter((a) => parsed.aoi_ids.includes(a.id));
    return cachedData;
  } catch {
    cachedData = null;
    cachedSeededAois = [];
    return null;
  }
}

export function resetGlobalPresetsCache(): void {
  cachedData = undefined;
  cachedSeededAois = [];
}

export function getGlobalPresetsManifest(): GlobalPresetsManifest | null {
  const data = loadGlobalPresetsFile();
  if (!data) return null;
  return {
    available: true,
    schema_version: data.schema_version,
    generated_at_utc: data.generated_at_utc,
    source: data.source,
    aoi_ids: data.aoi_ids,
    coverage_windows: data.coverage_windows,
    aoi_row_summary: data.aoi_row_summary,
    canonical_rows_total: data.canonical_rows_total,
    bucket_rows_total: data.bucket_rows_total ?? data.daily_buckets?.length ?? 0,
    representative_observations_total:
      data.representative_observations_total ?? data.observations.length,
    superseded_nrt_count: data.superseded_nrt_count,
    exact_duplicates_removed: data.exact_duplicates_removed,
    checksums: data.checksums,
  };
}

export function isAoiInSeededGlobalPresets(aoi: AoiDefinition): boolean {
  const data = loadGlobalPresetsFile();
  if (!data || cachedSeededAois.length === 0) return false;
  if (data.aoi_ids.includes(aoi.id)) return true;

  return cachedSeededAois.some(
    (seedAoi) =>
      aoi.bbox.west >= seedAoi.bbox.west &&
      aoi.bbox.east <= seedAoi.bbox.east &&
      aoi.bbox.south >= seedAoi.bbox.south &&
      aoi.bbox.north <= seedAoi.bbox.north
  );
}

export function isRangeCoveredBySeededGlobalPresets(
  aoi: AoiDefinition,
  startDate: string,
  endDate: string
): boolean {
  const data = loadGlobalPresetsFile();
  if (!data || !isAoiInSeededGlobalPresets(aoi)) return false;
  return data.coverage_windows.some(
    (win) => startDate >= win.start_date && endDate <= win.end_date
  );
}

function matchesConfidenceBucket(
  b: DailyAggregateBucket,
  modisMinConfidence: number,
  viirsCategories: Array<'low' | 'nominal' | 'high'>
): boolean {
  if (b.sensor === 'MODIS') {
    if (modisMinConfidence <= 0) return true;
    if (modisMinConfidence >= 80) return b.confidence_bucket === 'high_80_100';
    if (modisMinConfidence >= 30) {
      return (
        b.confidence_bucket === 'nominal_30_79' ||
        b.confidence_bucket === 'high_80_100'
      );
    }
    return true;
  }
  return viirsCategories.includes(b.confidence_bucket as 'low' | 'nominal' | 'high');
}

/**
 * Queries lossless 0.25-deg daily aggregate buckets from `global_presets_nasa.json`
 * respecting spatial bbox, date range, sensor, platform, processing status, day/night,
 * and native confidence filters cleanly (matching Parquet bucket semantics).
 */
export function queryGlobalPresetBuckets(params: {
  bbox: BoundingBox;
  startDate: string;
  endDate: string;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence: number;
  viirsCategories: Array<'low' | 'nominal' | 'high'>;
}): DailyAggregateBucket[] {
  const data = loadGlobalPresetsFile();
  if (!data || !Array.isArray(data.daily_buckets) || params.platforms.length === 0) {
    return [];
  }

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
  } = params;

  const platformSet = new Set(platforms);
  const results: DailyAggregateBucket[] = [];

  for (let i = 0; i < data.daily_buckets.length; i++) {
    const b = data.daily_buckets[i];
    if (b.acq_date < startDate || b.acq_date > endDate) continue;
    if (sensor !== 'ALL' && b.sensor !== sensor) continue;
    if (!platformSet.has(b.platform)) continue;
    if (processingStatus !== 'ALL' && b.processing_status !== processingStatus) continue;
    if (dayNight !== 'ALL' && b.daynight_native !== dayNight) continue;
    if (!matchesConfidenceBucket(b, modisMinConfidence, viirsCategories)) continue;

    if (typeof b.lat_bin === 'number' && typeof b.lng_bin === 'number') {
      // Cell center / overlap check matching Parquet partitioning (cell covers [bin, bin + 0.25))
      const cellMinLat = b.lat_bin;
      const cellMaxLat = b.lat_bin + 0.25;
      const cellMinLng = b.lng_bin;
      const cellMaxLng = b.lng_bin + 0.25;
      if (
        cellMaxLat <= bbox.south ||
        cellMinLat > bbox.north ||
        cellMaxLng <= bbox.west ||
        cellMinLng > bbox.east
      ) {
        continue;
      }
    }

    results.push(b);
  }

  return results;
}

export function bucketsToMapGridCells(
  buckets: DailyAggregateBucket[],
  cellSizeDeg: number,
  sourceBacking: MapGridCell['source_backing'] = 'PARQUET'
): MapGridCell[] {
  const cellSize = Math.max(0.25, Math.min(2.0, cellSizeDeg));
  const inv = Math.round(1 / cellSize);
  const byCell = new Map<
    string,
    {
      latBin: number;
      lngBin: number;
      modis: number;
      viirs: number;
      modisFrp: number;
      viirsFrp: number;
      platforms: Set<PlatformId>;
    }
  >();

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (typeof b.lat_bin !== 'number' || typeof b.lng_bin !== 'number') continue;
    const gLat = Math.floor(b.lat_bin * inv) / inv;
    const gLng = Math.floor(b.lng_bin * inv) / inv;
    const cellId = `${gLat}|${gLng}`;
    let acc = byCell.get(cellId);
    if (!acc) {
      acc = {
        latBin: gLat,
        lngBin: gLng,
        modis: 0,
        viirs: 0,
        modisFrp: 0,
        viirsFrp: 0,
        platforms: new Set<PlatformId>(),
      };
      byCell.set(cellId, acc);
    }
    if (b.sensor === 'MODIS') {
      acc.modis += b.detection_count;
      acc.modisFrp += b.frp_sum_mw;
    } else {
      acc.viirs += b.detection_count;
      acc.viirsFrp += b.frp_sum_mw;
    }
    acc.platforms.add(b.platform);
  }

  return Array.from(byCell.entries())
    .map(([cellId, c]) => ({
      cell_id: cellId,
      lat_bin: c.latBin,
      lng_bin: c.lngBin,
      cell_size_deg: cellSize,
      centroid_lat: Number((c.latBin + cellSize / 2).toFixed(4)),
      centroid_lng: Number((c.lngBin + cellSize / 2).toFixed(4)),
      modis_detections: c.modis,
      viirs_detections: c.viirs,
      pooled_observation_count: c.modis + c.viirs,
      modis_frp_sum_mw: Number(c.modisFrp.toFixed(2)),
      viirs_frp_sum_mw: Number(c.viirsFrp.toFixed(2)),
      platforms: Array.from(c.platforms),
      source_backing: sourceBacking,
    }))
    .sort((a, b) => b.pooled_observation_count - a.pooled_observation_count)
    .slice(0, 1800);
}

export function queryGlobalPresetObservations(params: {
  aoi: AoiDefinition;
  startDate?: string;
  endDate?: string;
  startMs?: number;
  endMs?: number;
  sensor?: SensorFilter;
  platforms?: PlatformId[];
  processingStatus?: ProcessingStatus | 'ALL';
  dayNight?: 'ALL' | 'D' | 'N';
  modisMinConfidence?: number;
  viirsCategories?: Array<'low' | 'nominal' | 'high'>;
}): CanonicalObservation[] {
  const data = loadGlobalPresetsFile();
  if (!data) return [];

  const {
    aoi,
    startDate,
    endDate,
    startMs,
    endMs,
    sensor = 'ALL',
    platforms,
    processingStatus = 'ALL',
    dayNight = 'ALL',
    modisMinConfidence = 0,
    viirsCategories = ['low', 'nominal', 'high'],
  } = params;

  const platformSet = platforms ? new Set(platforms) : null;
  const results: CanonicalObservation[] = [];

  for (let i = 0; i < data.observations.length; i++) {
    const obs = data.observations[i];
    if (startDate && obs.acq_date < startDate) continue;
    if (endDate && obs.acq_date > endDate) continue;
    if (startMs !== undefined || endMs !== undefined) {
      const t = Date.parse(obs.acq_datetime_utc);
      if (startMs !== undefined && t < startMs) continue;
      if (endMs !== undefined && t > endMs) continue;
    }
    if (sensor !== 'ALL' && obs.sensor !== sensor) continue;
    if (platformSet && !platformSet.has(obs.platform)) continue;
    if (processingStatus !== 'ALL' && obs.processing_status !== processingStatus) continue;
    if (dayNight !== 'ALL' && obs.daynight_native !== dayNight) continue;
    if (obs.sensor === 'MODIS' && typeof obs.confidence_native === 'number') {
      if (obs.confidence_native < modisMinConfidence) continue;
    }
    if (obs.sensor === 'VIIRS' && typeof obs.confidence_native === 'string') {
      if (!viirsCategories.includes(obs.confidence_native as 'low' | 'nominal' | 'high')) {
        continue;
      }
    }
    if (!isPointInAoi(obs.latitude, obs.longitude, aoi)) continue;
    results.push(obs);
  }

  return results;
}
