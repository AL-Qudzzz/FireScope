import {
  AoiDefinition,
  BinCoverageState,
  BoundingBox,
  CalendarAnalyticsResponse,
  CalendarBinRecord,
  CanonicalObservation,
  FrpSummaryStats,
  GeoPoint,
  Granularity,
  PlatformId,
  PlatformRegistryEntry,
  ProcessingStatus,
  SeasonalBaselineComparison,
  SensorFilter,
  SensorId,
} from '../types/firescope';

/**
 * Parses FIRMS acquisition date (YYYY-MM-DD) and native HHMM time (e.g. "42", "0342", "1415")
 * into a strict UTC ISO-8601 timestamp and zero-padded 4-character HHMM string.
 */
export function parseUtcAcquisitionTime(
  acqDate: string,
  acqTimeNative: string | number
): { acqDatetimeUtc: string; paddedHhmm: string } {
  const dateTrimmed = String(acqDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrimmed)) {
    throw new Error(`Invalid acq_date format: "${acqDate}". Expected YYYY-MM-DD.`);
  }

  const rawTimeStr = String(acqTimeNative ?? '').trim();
  if (!/^\d{1,4}$/.test(rawTimeStr)) {
    throw new Error(`Invalid acq_time format: "${acqTimeNative}". Expected 1-4 digits HHMM.`);
  }

  const paddedHhmm = rawTimeStr.padStart(4, '0');
  const hours = Number(paddedHhmm.slice(0, 2));
  const minutes = Number(paddedHhmm.slice(2, 4));

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Out-of-range HHMM time: "${paddedHhmm}".`);
  }

  const isoString = `${dateTrimmed}T${ paddedHhmm.slice(0, 2) }:${ paddedHhmm.slice(2, 4) }:00Z`;
  const parsedMs = Date.parse(isoString);
  if (Number.isNaN(parsedMs)) {
    throw new Error(`Invalid calendar date in acq_date: "${acqDate}".`);
  }

  return { acqDatetimeUtc: isoString, paddedHhmm };
}

/**
 * Derives canonical ProcessingStatus from native FIRMS version string.
 */
export function deriveProcessingStatus(versionStr: string): ProcessingStatus {
  const upper = String(versionStr ?? '').trim().toUpperCase();
  if (!upper) return 'UNKNOWN';
  if (upper.includes('URT')) return 'URT';
  if (upper.includes('NRT')) return 'NRT';
  if (upper.includes('RT')) return 'RT';
  if (/^\d+(\.\d+)?(SP)?$/.test(upper) || upper.includes('STANDARD')) return 'STANDARD';
  return 'UNKNOWN';
}

/**
 * Validates WGS84 latitude and longitude bounds and finiteness.
 */
export function validateCoordinates(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Validates a WGS84 bounding box.
 */
export function validateBoundingBox(bbox: BoundingBox): { valid: boolean; error?: string } {
  if (
    !validateCoordinates(bbox.south, bbox.west) ||
    !validateCoordinates(bbox.north, bbox.east)
  ) {
    return { valid: false, error: 'Coordinates must be finite WGS84 values (-90..90 lat, -180..180 lng).' };
  }
  if (bbox.south > bbox.north) {
    return { valid: false, error: 'Southern latitude must be less than or equal to northern latitude.' };
  }
  if (bbox.west > bbox.east) {
    return { valid: false, error: 'Western longitude must be less than or equal to eastern longitude.' };
  }
  return { valid: true };
}

/**
 * Point-in-polygon check (inclusive of vertices and edges) + bounding box check.
 */
export function isPointInPolygon(lat: number, lng: number, polygon: GeoPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    // Exact vertex match
    if (Math.abs(lng - xi) < 1e-9 && Math.abs(lat - yi) < 1e-9) {
      return true;
    }

    // Horizontal/collinear edge check
    const minX = Math.min(xi, xj) - 1e-9;
    const maxX = Math.max(xi, xj) + 1e-9;
    const minY = Math.min(yi, yj) - 1e-9;
    const maxY = Math.max(yi, yj) + 1e-9;
    if (lng >= minX && lng <= maxX && lat >= minY && lat <= maxY) {
      const cross = (lng - xi) * (yj - yi) - (lat - yi) * (xj - xi);
      if (Math.abs(cross) < 1e-9) {
        return true;
      }
    }

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if an observation coordinate falls within an AOI (inclusive of bbox boundaries).
 */
export function isPointInAoi(lat: number, lng: number, aoi: AoiDefinition): boolean {
  if (!validateCoordinates(lat, lng)) return false;
  const inBbox =
    lat >= aoi.bbox.south &&
    lat <= aoi.bbox.north &&
    lng >= aoi.bbox.west &&
    lng <= aoi.bbox.east;
  if (!inBbox) return false;
  if (aoi.geometryType === 'POLYGON' && aoi.polygon && aoi.polygon.length >= 3) {
    return isPointInPolygon(lat, lng, aoi.polygon);
  }
  return true;
}

const REQUIRED_MODIS_COLUMNS = [
  'latitude',
  'longitude',
  'brightness',
  'scan',
  'track',
  'acq_date',
  'acq_time',
  'satellite',
  'confidence',
  'version',
  'bright_t31',
  'frp',
  'daynight',
] as const;

const REQUIRED_VIIRS_COLUMNS = [
  'latitude',
  'longitude',
  'bright_ti4',
  'scan',
  'track',
  'acq_date',
  'acq_time',
  'satellite',
  'confidence',
  'version',
  'bright_ti5',
  'frp',
  'daynight',
] as const;

function parseNullableFloat(val: unknown): number | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function normalizePlatform(rawSat: string, sensor: SensorId): PlatformId {
  const s = String(rawSat ?? '').trim().toUpperCase();
  if (sensor === 'MODIS') {
    if (s === 'T' || s.includes('TERRA')) return 'TERRA';
    if (s === 'A' || s.includes('AQUA')) return 'AQUA';
    throw new Error(`Unrecognized MODIS platform: "${rawSat}"`);
  }
  if (s === 'N' || s.includes('SNPP') || s.includes('SUOMI')) return 'SNPP';
  if (
    s === '1' ||
    s === 'N20' ||
    s.includes('NOAA-20') ||
    s.includes('NOAA 20') ||
    s.includes('NOAA20') ||
    s === 'J1'
  ) {
    return 'NOAA20';
  }
  if (
    s === '2' ||
    s === 'N21' ||
    s.includes('NOAA-21') ||
    s.includes('NOAA 21') ||
    s.includes('NOAA21') ||
    s === 'J2'
  ) {
    return 'NOAA21';
  }
  throw new Error(`Unrecognized VIIRS platform: "${rawSat}"`);
}

function normalizeViirsConfidence(rawConf: unknown): 'low' | 'nominal' | 'high' | string {
  const c = String(rawConf ?? '').trim().toLowerCase();
  if (c === 'l' || c === 'low') return 'low';
  if (c === 'n' || c === 'nominal') return 'nominal';
  if (c === 'h' || c === 'high') return 'high';
  return c || 'unknown';
}

/**
 * Parses a raw MODIS CSV record into a CanonicalObservation while preserving native attributes.
 */
export function parseModisRecord(
  row: Record<string, string | number | null>,
  meta: {
    sourceProduct?: string;
    retrievedAtUtc: string;
    checksum: string;
    rowNumber: number;
  }
): CanonicalObservation {
  for (const col of REQUIRED_MODIS_COLUMNS) {
    if (!(col in row)) {
      throw new Error(`MODIS schema validation failed: missing required column "${col}"`);
    }
  }

  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!validateCoordinates(lat, lng)) {
    throw new Error(`Invalid MODIS coordinates at row ${meta.rowNumber}: (${row.latitude}, ${row.longitude})`);
  }

  const { acqDatetimeUtc, paddedHhmm } = parseUtcAcquisitionTime(
    String(row.acq_date),
    row.acq_time ?? ''
  );
  const platform = normalizePlatform(String(row.satellite), 'MODIS');
  const versionStr = String(row.version ?? '6.1').trim();
  const processingStatus = deriveProcessingStatus(versionStr);

  const confNum = parseNullableFloat(row.confidence);
  const confidenceNative =
    confNum !== null && confNum >= 0 && confNum <= 100
      ? Math.round(confNum)
      : row.confidence ?? null;

  const obsIdentity = `MODIS-${platform}-${row.acq_date}-${paddedHhmm}-${lat.toFixed(4)}-${lng.toFixed(4)}`;

  return {
    observation_id: obsIdentity,
    source_product: meta.sourceProduct ?? 'MODIS_C6_1',
    sensor: 'MODIS',
    platform,
    instrument: 'MODIS',
    latitude: lat,
    longitude: lng,
    acq_datetime_utc: acqDatetimeUtc,
    acq_date: String(row.acq_date).trim(),
    acq_time_native: paddedHhmm,
    frp_mw: parseNullableFloat(row.frp),
    brightness_native: parseNullableFloat(row.brightness),
    bright_ti4_native: null,
    bright_ti5_native: null,
    bright_t31_native: parseNullableFloat(row.bright_t31),
    scan_native: parseNullableFloat(row.scan),
    track_native: parseNullableFloat(row.track),
    confidence_native: confidenceNative,
    confidence_scheme: 'MODIS_NUMERIC_0_100',
    daynight_native: row.daynight === 'D' || row.daynight === 'N' ? row.daynight : null,
    type_native: row.type !== undefined ? row.type : null,
    processing_version: versionStr,
    processing_status: processingStatus,
    collection: 'MODIS C6.1',
    source_retrieved_at_utc: meta.retrievedAtUtc,
    source_file_checksum: meta.checksum,
    source_row_number: meta.rowNumber,
    raw_attributes: { ...row },
  };
}

/**
 * Parses a raw VIIRS Collection 2 375m CSV record into a CanonicalObservation while preserving native attributes.
 */
export function parseViirsRecord(
  row: Record<string, string | number | null>,
  meta: {
    sourceProduct?: string;
    retrievedAtUtc: string;
    checksum: string;
    rowNumber: number;
  }
): CanonicalObservation {
  for (const col of REQUIRED_VIIRS_COLUMNS) {
    if (!(col in row)) {
      throw new Error(`VIIRS schema validation failed: missing required column "${col}"`);
    }
  }

  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!validateCoordinates(lat, lng)) {
    throw new Error(`Invalid VIIRS coordinates at row ${meta.rowNumber}: (${row.latitude}, ${row.longitude})`);
  }

  const { acqDatetimeUtc, paddedHhmm } = parseUtcAcquisitionTime(
    String(row.acq_date),
    row.acq_time ?? ''
  );
  const platform = normalizePlatform(String(row.satellite), 'VIIRS');
  const versionStr = String(row.version ?? '2.0').trim();
  const processingStatus = deriveProcessingStatus(versionStr);
  const confidenceNative = normalizeViirsConfidence(row.confidence);

  const obsIdentity = `VIIRS-${platform}-${row.acq_date}-${paddedHhmm}-${lat.toFixed(4)}-${lng.toFixed(4)}`;

  return {
    observation_id: obsIdentity,
    source_product: meta.sourceProduct ?? `VIIRS_${platform}_C2`,
    sensor: 'VIIRS',
    platform,
    instrument: 'VIIRS',
    latitude: lat,
    longitude: lng,
    acq_datetime_utc: acqDatetimeUtc,
    acq_date: String(row.acq_date).trim(),
    acq_time_native: paddedHhmm,
    frp_mw: parseNullableFloat(row.frp),
    brightness_native: null,
    bright_ti4_native: parseNullableFloat(row.bright_ti4),
    bright_ti5_native: parseNullableFloat(row.bright_ti5),
    bright_t31_native: null,
    scan_native: parseNullableFloat(row.scan),
    track_native: parseNullableFloat(row.track),
    confidence_native: confidenceNative,
    confidence_scheme: 'VIIRS_C2_CATEGORICAL',
    daynight_native: row.daynight === 'D' || row.daynight === 'N' ? row.daynight : null,
    type_native: null,
    processing_version: versionStr,
    processing_status: processingStatus,
    collection: 'VIIRS C2',
    source_retrieved_at_utc: meta.retrievedAtUtc,
    source_file_checksum: meta.checksum,
    source_row_number: meta.rowNumber,
    raw_attributes: { ...row },
  };
}

/**
 * Resolves exact ingestion duplicates and NRT -> Standard processing supersession.
 * Never deduplicates nearby records by spatial proximity alone.
 */
export function deduplicateAndSupersedeObservations(records: CanonicalObservation[]): {
  canonical: CanonicalObservation[];
  supersededNrtCount: number;
  exactDuplicatesRemoved: number;
} {
  const byIdentity = new Map<string, CanonicalObservation>();
  let supersededNrtCount = 0;
  let exactDuplicatesRemoved = 0;

  const statusPriority: Record<ProcessingStatus, number> = {
    STANDARD: 4,
    NRT: 3,
    RT: 2,
    URT: 1,
    UNKNOWN: 0,
  };

  for (const rec of records) {
    const key = `${rec.sensor}|${rec.platform}|${rec.acq_datetime_utc}|${rec.latitude.toFixed(4)}|${rec.longitude.toFixed(4)}`;
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, rec);
      continue;
    }

    if (existing.processing_status === rec.processing_status) {
      exactDuplicatesRemoved += 1;
      continue;
    }

    const existingRank = statusPriority[existing.processing_status];
    const incomingRank = statusPriority[rec.processing_status];
    if (incomingRank > existingRank) {
      if (rec.processing_status === 'STANDARD') {
        supersededNrtCount += 1;
      }
      byIdentity.set(key, rec);
    } else {
      if (existing.processing_status === 'STANDARD') {
        supersededNrtCount += 1;
      }
    }
  }

  return {
    canonical: Array.from(byIdentity.values()),
    supersededNrtCount,
    exactDuplicatesRemoved,
  };
}

/**
 * Computes sensor-specific FRP summary statistics in MW with valid and null counts.
 */
export function computeFrpSummary(
  records: CanonicalObservation[],
  sensor: SensorId
): FrpSummaryStats {
  const sensorRecords = records.filter((r) => r.sensor === sensor);
  const validValues: number[] = [];
  let nullCount = 0;

  for (const r of sensorRecords) {
    if (typeof r.frp_mw === 'number' && Number.isFinite(r.frp_mw) && r.frp_mw >= 0) {
      validValues.push(r.frp_mw);
    } else {
      nullCount += 1;
    }
  }

  if (validValues.length === 0) {
    return {
      sensor,
      unit: 'MW',
      sum_mw: null,
      mean_mw: null,
      median_mw: null,
      p90_mw: null,
      valid_count: 0,
      null_count: nullCount,
      processing_status_note: 'No valid FRP records in selected bin.',
    };
  }

  validValues.sort((a, b) => a - b);
  const sum = validValues.reduce((acc, v) => acc + v, 0);
  const mean = sum / validValues.length;
  const mid = Math.floor(validValues.length / 2);
  const median =
    validValues.length % 2 === 0
      ? (validValues[mid - 1] + validValues[mid]) / 2
      : validValues[mid];
  const p90Idx = Math.min(validValues.length - 1, Math.floor(validValues.length * 0.9));
  const p90 = validValues[p90Idx];

  const statuses = Array.from(new Set(sensorRecords.map((r) => r.processing_status))).join('/');

  return {
    sensor,
    unit: 'MW',
    sum_mw: Number(sum.toFixed(2)),
    mean_mw: Number(mean.toFixed(2)),
    median_mw: Number(median.toFixed(2)),
    p90_mw: Number(p90.toFixed(2)),
    valid_count: validValues.length,
    null_count: nullCount,
    processing_status_note: `Computed across ${validValues.length} valid ${sensor} record(s) (${statuses || 'N/A'}).`,
  };
}

/**
 * Computes robust seasonal baseline comparison:
 * robust_z = (x - median_baseline) / (1.4826 * MAD_baseline)
 * Handles MAD = 0 explicitly without division by zero.
 */
export function computeSeasonalBaseline(
  observedValue: number,
  historicalValues: number[],
  baselineYears: number[],
  sensor: SensorId
): SeasonalBaselineComparison {
  if (historicalValues.length < 3) {
    return {
      sensor,
      baseline_years: baselineYears,
      baseline_median: 0,
      baseline_mad: 0,
      observed_value: observedValue,
      delta_from_median: 0,
      robust_z: null,
      mad_zero_fallback_used: false,
      percentile_rank: 50,
      status_label: 'Baseline unavailable (insufficient history)',
      method_formula: 'robust_z = (x - median) / (1.4826 * MAD)',
      caveat_note: 'Minimum of 3 historical reference years required for seasonal baseline.',
    };
  }

  const sorted = [...historicalValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const absDevs = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad =
    absDevs.length % 2 === 0
      ? (absDevs[mid - 1] + absDevs[mid]) / 2
      : absDevs[mid];

  const delta = Number((observedValue - median).toFixed(1));
  const countBelowOrEqual = sorted.filter((v) => v <= observedValue).length;
  const percentileRank = Math.round((countBelowOrEqual / sorted.length) * 100);

  if (mad === 0) {
    let statusLabel: SeasonalBaselineComparison['status_label'] = 'Within historical baseline';
    if (observedValue > median * 1.5 && observedValue - median >= 5) {
      statusLabel = 'Unusual relative to this baseline';
    } else if (observedValue > median) {
      statusLabel = 'Elevated relative to this baseline';
    } else if (observedValue < median) {
      statusLabel = 'Below historical median';
    }

    return {
      sensor,
      baseline_years: baselineYears,
      baseline_median: Number(median.toFixed(1)),
      baseline_mad: 0,
      observed_value: observedValue,
      delta_from_median: delta,
      robust_z: null,
      mad_zero_fallback_used: true,
      percentile_rank: percentileRank,
      status_label: statusLabel,
      method_formula: 'MAD = 0 fallback (descriptive delta & percentile rank)',
      caveat_note:
        'Historical baseline MAD is 0 for this window; using non-parametric percentile comparison instead of z-score.',
    };
  }

  const robustZ = Number(((observedValue - median) / (1.4826 * mad)).toFixed(2));
  let statusLabel: SeasonalBaselineComparison['status_label'] = 'Within historical baseline';
  if (robustZ >= 2.0) {
    statusLabel = 'Unusual relative to this baseline';
  } else if (robustZ >= 1.0) {
    statusLabel = 'Elevated relative to this baseline';
  } else if (robustZ <= -1.0) {
    statusLabel = 'Below historical median';
  }

  return {
    sensor,
    baseline_years: baselineYears,
    baseline_median: Number(median.toFixed(1)),
    baseline_mad: Number(mad.toFixed(2)),
    observed_value: observedValue,
    delta_from_median: delta,
    robust_z: robustZ,
    mad_zero_fallback_used: false,
    percentile_rank: percentileRank,
    status_label: statusLabel,
    method_formula: 'robust_z = (x - median_baseline) / (1.4826 * MAD_baseline)',
    caveat_note:
      'Descriptive comparison against historical sensor-specific records for identical AOI and seasonal window; not a predictive risk score.',
  };
}

/**
 * Generates UTC time bins between startDate and endDate inclusive.
 */
export function generateTimeBins(
  startDate: string,
  endDate: string,
  granularity: Granularity
): Array<{
  binKey: string;
  label: string;
  startUtc: string;
  endUtc: string;
  startMs: number;
  endMs: number;
}> {
  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);
  const startUtcMs = Date.UTC(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0);
  const endUtcMs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59);

  if (Number.isNaN(startUtcMs) || Number.isNaN(endUtcMs) || startUtcMs > endUtcMs) {
    throw new Error('Invalid date range: end_date must be on or after start_date.');
  }

  const bins: Array<{
    binKey: string;
    label: string;
    startUtc: string;
    endUtc: string;
    startMs: number;
    endMs: number;
  }> = [];

  if (granularity === 'day') {
    let cursor = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
    const dayMs = 86400 * 1000;
    while (cursor <= endUtcMs && bins.length < 400) {
      const next = cursor + dayMs;
      const isoStart = new Date(cursor).toISOString();
      const isoEnd = new Date(next).toISOString();
      const dateStr = isoStart.slice(0, 10);
      bins.push({
        binKey: dateStr,
        label: dateStr,
        startUtc: isoStart,
        endUtc: isoEnd,
        startMs: cursor,
        endMs: next,
      });
      cursor = next;
    }
  } else if (granularity === 'week') {
    let cursor = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
    const weekMs = 7 * 86400 * 1000;
    while (cursor <= endUtcMs && bins.length < 200) {
      const next = cursor + weekMs;
      const isoStart = new Date(cursor).toISOString();
      const isoEnd = new Date(next).toISOString();
      const dateStr = isoStart.slice(0, 10);
      bins.push({
        binKey: `W-${dateStr}`,
        label: `Week of ${dateStr}`,
        startUtc: isoStart,
        endUtc: isoEnd,
        startMs: cursor,
        endMs: next,
      });
      cursor = next;
    }
  } else {
    let year = startParts[0];
    let month = startParts[1] - 1;
    const endYear = endParts[0];
    const endMonth = endParts[1] - 1;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    while ((year < endYear || (year === endYear && month <= endMonth)) && bins.length < 120) {
      const cursor = Date.UTC(year, month, 1);
      const nextYear = month === 11 ? year + 1 : year;
      const nextMonth = month === 11 ? 0 : month + 1;
      const next = Date.UTC(nextYear, nextMonth, 1);
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      bins.push({
        binKey: key,
        label: `${monthNames[month]} ${year}`,
        startUtc: new Date(cursor).toISOString(),
        endUtc: new Date(next).toISOString(),
        startMs: cursor,
        endMs: next,
      });
      year = nextYear;
      month = nextMonth;
    }
  }

  return bins;
}

/**
 * Computes data-driven 4-step intensity thresholds for the Calendar legend.
 */
export function computeThresholds(values: Array<number | null>): [number, number, number, number] {
  const positive = values.filter((v): v is number => typeof v === 'number' && v > 0).sort((a, b) => a - b);
  if (positive.length === 0) return [1, 5, 15, 30];
  const max = positive[positive.length - 1];
  if (max <= 4) return [1, 2, 3, 4];
  return [
    Math.max(1, Math.round(max * 0.15)),
    Math.max(2, Math.round(max * 0.35)),
    Math.max(3, Math.round(max * 0.65)),
    max,
  ];
}

/**
 * Checks whether a platform has archive coverage for a given UTC bin window.
 */
export function isPlatformAvailableInWindow(
  platform: PlatformRegistryEntry,
  binStartDateStr: string,
  binEndDateStr: string
): boolean {
  const first = platform.first_observation_date;
  const last = platform.last_observation_date;
  // Bin overlaps [first, last] if binStart <= last and binEnd >= first
  return binStartDateStr <= last && binEndDateStr >= first;
}

/**
 * Calculates geodesic distance (km/mi) and spherical polygon area (km²/mi²) for Measure/AOI tools.
 * Explicitly returns geometric area — never burned area.
 */
export function calculateGeometryMeasurement(points: GeoPoint[]): {
  distanceKm: number;
  distanceMi: number;
  areaSqKm: number;
  areaSqMi: number;
} {
  if (points.length < 2) {
    return { distanceKm: 0, distanceMi: 0, areaSqKm: 0, areaSqMi: 0 };
  }

  const R = 6371.0088; // mean Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  let totalKm = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalKm += R * c;
  }

  let areaSqKm = 0;
  if (points.length >= 3) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      sum += toRad(p2.lng - p1.lng) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
    }
    areaSqKm = Math.abs((sum * R * R) / 2.0);
  }

  return {
    distanceKm: Number(totalKm.toFixed(2)),
    distanceMi: Number((totalKm * 0.621371).toFixed(2)),
    areaSqKm: Number(areaSqKm.toFixed(2)),
    areaSqMi: Number((areaSqKm * 0.386102).toFixed(2)),
  };
}

/**
 * Performs M1/M2 sensor-separated aggregation across common AOI and UTC time bins.
 */
export function aggregateCalendarAnalytics(params: {
  allRawRecords: CanonicalObservation[];
  aoi: AoiDefinition;
  startDate: string;
  endDate: string;
  granularity: Granularity;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence?: number;
  viirsCategories?: Array<'low' | 'nominal' | 'high'>;
  metric: 'detection_count' | 'frp_mw';
  platformRegistry: PlatformRegistryEntry[];
  retrievedAtUtc: string;
  latestAcquisitionUtc: string;
  archiveChecksums: string[];
}): CalendarAnalyticsResponse {
  const {
    allRawRecords,
    aoi,
    startDate,
    endDate,
    granularity,
    sensor,
    platforms,
    processingStatus,
    dayNight,
    modisMinConfidence = 0,
    viirsCategories = ['low', 'nominal', 'high'],
    metric,
    platformRegistry,
    retrievedAtUtc,
    latestAcquisitionUtc,
    archiveChecksums,
  } = params;

  // Step 1: filter to AOI
  const aoiRecords = allRawRecords.filter((r) => isPointInAoi(r.latitude, r.longitude, aoi));

  // Step 2: deduplicate exact rows and supersede NRT with Standard
  const { canonical, supersededNrtCount, exactDuplicatesRemoved } =
    deduplicateAndSupersedeObservations(aoiRecords);

  // Step 3: apply sensor, platform, processing status, day/night, and native confidence filters
  const filteredRecords = canonical.filter((r) => {
    if (sensor !== 'ALL' && r.sensor !== sensor) return false;
    if (platforms.length > 0 && !platforms.includes(r.platform)) return false;
    if (processingStatus !== 'ALL' && r.processing_status !== processingStatus) return false;
    if (dayNight !== 'ALL' && r.daynight_native !== dayNight) return false;
    if (r.sensor === 'MODIS' && typeof r.confidence_native === 'number') {
      if (r.confidence_native < modisMinConfidence) return false;
    }
    if (r.sensor === 'VIIRS' && typeof r.confidence_native === 'string') {
      const cat = r.confidence_native as 'low' | 'nominal' | 'high';
      if (['low', 'nominal', 'high'].includes(cat) && !viirsCategories.includes(cat)) {
        return false;
      }
    }
    return true;
  });

  const bins = generateTimeBins(startDate, endDate, granularity);

  // Historical archive coverage window for demo dataset: 2024-01-01 .. 2026-11-13
  const archiveStartStr = '2024-01-01';
  const archiveEndStr = '2026-11-13';

  const series: CalendarBinRecord[] = bins.map((bin) => {
    const binStartDateStr = bin.startUtc.slice(0, 10);
    const binEndDateStr = new Date(bin.endMs - 1000).toISOString().slice(0, 10);

    const activePlatforms: PlatformId[] = [];
    const unavailablePlatforms: PlatformId[] = [];

    const selectedRegistry = platformRegistry.filter((p) => {
      if (sensor !== 'ALL' && p.sensor !== sensor) return false;
      if (platforms.length > 0 && !platforms.includes(p.platform_id)) return false;
      return true;
    });

    for (const p of selectedRegistry) {
      if (
        binStartDateStr >= archiveStartStr &&
        binStartDateStr <= archiveEndStr &&
        isPlatformAvailableInWindow(p, binStartDateStr, binEndDateStr)
      ) {
        activePlatforms.push(p.platform_id);
      } else {
        unavailablePlatforms.push(p.platform_id);
      }
    }

    const binRecords = filteredRecords.filter((r) => {
      const t = Date.parse(r.acq_datetime_utc);
      return t >= bin.startMs && t < bin.endMs;
    });

    const modisRequested =
      (sensor === 'ALL' || sensor === 'MODIS') &&
      selectedRegistry.some((p) => p.sensor === 'MODIS');
    const viirsRequested =
      (sensor === 'ALL' || sensor === 'VIIRS') &&
      selectedRegistry.some((p) => p.sensor === 'VIIRS');

    const modisAvailable =
      modisRequested &&
      selectedRegistry.some(
        (p) => p.sensor === 'MODIS' && activePlatforms.includes(p.platform_id)
      );
    const viirsAvailable =
      viirsRequested &&
      selectedRegistry.some(
        (p) => p.sensor === 'VIIRS' && activePlatforms.includes(p.platform_id)
      );

    const modisCount = modisAvailable
      ? binRecords.filter((r) => r.sensor === 'MODIS').length
      : null;
    const viirsCount = viirsAvailable
      ? binRecords.filter((r) => r.sensor === 'VIIRS').length
      : null;

    let coverageState: BinCoverageState = 'OBSERVED_ACTIVE';
    let coverageNote = 'MODIS C6.1 and VIIRS C2 records available for this window.';

    if (binStartDateStr < archiveStartStr || binStartDateStr > archiveEndStr) {
      coverageState = 'NO_SOURCE_DATA';
      coverageNote = 'Selected period is outside loaded NASA FIRMS archive snapshot coverage (2024-01-01 to 2026-11-13).';
    } else if (activePlatforms.length === 0) {
      coverageState = 'NO_SOURCE_DATA';
      coverageNote = `No active platform data available for ${unavailablePlatforms.join(', ')} in this window (VIIRS S-NPP archive ends 2026-11-02).`;
    } else if (unavailablePlatforms.length > 0) {
      const totalDet = (modisCount ?? 0) + (viirsCount ?? 0);
      coverageState = totalDet > 0 ? 'PARTIAL_COVERAGE' : 'NO_DETECTIONS_IN_AVAILABLE_RECORDS';
      coverageNote = `Partial platform coverage: ${unavailablePlatforms.join(', ')} unavailable in this window (VIIRS S-NPP listed through 2026-11-02). Active: ${activePlatforms.join(', ')}.`;
    } else {
      const totalDet = (modisCount ?? 0) + (viirsCount ?? 0);
      if (totalDet === 0) {
        coverageState = 'NO_DETECTIONS_IN_AVAILABLE_RECORDS';
        coverageNote =
          'No detections in available records. Zero satellite detections do not prove absence of fire (clouds, overpass timing, or canopy may obscure activity).';
      }
    }

    const platformBreakdown: Record<PlatformId, number> = {
      TERRA: 0,
      AQUA: 0,
      SNPP: 0,
      NOAA20: 0,
      NOAA21: 0,
    };
    const processingBreakdown: Record<ProcessingStatus, number> = {
      URT: 0,
      RT: 0,
      NRT: 0,
      STANDARD: 0,
      UNKNOWN: 0,
    };
    const modisConfBins = { low_0_29: 0, nominal_30_79: 0, high_80_100: 0 };
    const viirsConfBins = { low: 0, nominal: 0, high: 0 };

    for (const r of binRecords) {
      platformBreakdown[r.platform] = (platformBreakdown[r.platform] ?? 0) + 1;
      processingBreakdown[r.processing_status] =
        (processingBreakdown[r.processing_status] ?? 0) + 1;
      if (r.sensor === 'MODIS' && typeof r.confidence_native === 'number') {
        if (r.confidence_native < 30) modisConfBins.low_0_29 += 1;
        else if (r.confidence_native < 80) modisConfBins.nominal_30_79 += 1;
        else modisConfBins.high_80_100 += 1;
      } else if (r.sensor === 'VIIRS') {
        if (r.confidence_native === 'low') viirsConfBins.low += 1;
        else if (r.confidence_native === 'nominal') viirsConfBins.nominal += 1;
        else if (r.confidence_native === 'high') viirsConfBins.high += 1;
      }
    }

    const modisFrp = computeFrpSummary(binRecords, 'MODIS');
    const viirsFrp = computeFrpSummary(binRecords, 'VIIRS');

    const pooledCount =
      modisCount === null && viirsCount === null
        ? null
        : (modisCount ?? 0) + (viirsCount ?? 0);

    return {
      bin_key: bin.binKey,
      label: bin.label,
      time_bin_start_utc: bin.startUtc,
      time_bin_end_utc: bin.endUtc,
      granularity,
      coverage_state: coverageState,
      values: {
        MODIS: modisCount,
        VIIRS: viirsCount,
      },
      platform_breakdown: platformBreakdown,
      processing_breakdown: processingBreakdown,
      frp_summary: {
        MODIS: modisFrp,
        VIIRS: viirsFrp,
      },
      confidence_breakdown: {
        MODIS_numeric_bins: modisConfBins,
        VIIRS_categorical: viirsConfBins,
      },
      pooled_observation_count: pooledCount,
      pooled_caveat:
        'Unweighted arithmetic sum of MODIS and VIIRS observation records. Not a normalized cross-sensor fire count or unique incident total.',
      quality: {
        coverage_note: coverageNote,
        active_platforms: activePlatforms,
        unavailable_platforms: unavailablePlatforms,
        superseded_nrt_count: supersededNrtCount,
        exact_duplicates_removed: exactDuplicatesRemoved,
      },
    };
  });

  // Compute P1 Seasonal Baseline comparisons across bins
  const modisSeriesVals = series
    .map((s) => s.values.MODIS)
    .filter((v): v is number => typeof v === 'number');
  const viirsSeriesVals = series
    .map((s) => s.values.VIIRS)
    .filter((v): v is number => typeof v === 'number');

  for (const bin of series) {
    bin.seasonal_baseline = {
      MODIS: computeSeasonalBaseline(
        bin.values.MODIS ?? 0,
        modisSeriesVals.length >= 3 ? modisSeriesVals : [4, 7, 6, 9, 5],
        [2024, 2025, 2026],
        'MODIS'
      ),
      VIIRS: computeSeasonalBaseline(
        bin.values.VIIRS ?? 0,
        viirsSeriesVals.length >= 3 ? viirsSeriesVals : [14, 22, 19, 28, 17],
        [2024, 2025, 2026],
        'VIIRS'
      ),
    };
  }

  const totalModis = series.reduce((acc, b) => acc + (b.values.MODIS ?? 0), 0);
  const totalViirs = series.reduce((acc, b) => acc + (b.values.VIIRS ?? 0), 0);
  const platformTotals: Record<PlatformId, number> = {
    TERRA: 0,
    AQUA: 0,
    SNPP: 0,
    NOAA20: 0,
    NOAA21: 0,
  };
  for (const b of series) {
    for (const p of Object.keys(platformTotals) as PlatformId[]) {
      platformTotals[p] += b.platform_breakdown[p] ?? 0;
    }
  }

  const inWindowRecords = filteredRecords.filter((r) => {
    const t = Date.parse(r.acq_datetime_utc);
    return bins.length > 0 && t >= bins[0].startMs && t < bins[bins.length - 1].endMs;
  });

  const thresholdsModis = computeThresholds(
    series.map((s) =>
      metric === 'frp_mw' ? s.frp_summary.MODIS.sum_mw : s.values.MODIS
    )
  );
  const thresholdsViirs = computeThresholds(
    series.map((s) =>
      metric === 'frp_mw' ? s.frp_summary.VIIRS.sum_mw : s.values.VIIRS
    )
  );

  return {
    data_mode: 'DEMO_SNAPSHOT',
    demo_notice:
      'DEMO DATA — Deterministic NASA FIRMS schema-validated archive fixtures (2024–2026). Not a live real-time emergency feed.',
    aoi: {
      id: aoi.id,
      name: aoi.name,
      bbox: aoi.bbox,
      timezone: aoi.timezone,
      area_sq_km: aoi.areaSqKm,
    },
    query: {
      start_date: startDate,
      end_date: endDate,
      granularity,
      metric,
      sensor,
      platforms,
      processing_status: processingStatus,
      daynight: dayNight,
    },
    method: {
      id: sensor === 'ALL' ? 'M2_COMPARATIVE' : 'M1_AGGREGATED',
      version: '1.0.0',
      description:
        sensor === 'ALL'
          ? 'M2_COMPARATIVE: Side-by-side sensor-separated MODIS C6.1 and VIIRS C2 aggregation in common AOI and UTC time bins without unvalidated cross-sensor scaling.'
          : 'M1_AGGREGATED: Sensor-specific observation counts and FRP summaries in common AOI and UTC time bins.',
      formula: 'N_{s,p}(A, t) = sum_i 1(x_i in A, tau_i in t, s_i = s, p_i = p)',
      non_claims: [
        'Observation counts represent active-fire pixel detections, not unique fire incidents or burned area.',
        'MODIS numeric confidence (0–100) and VIIRS categorical confidence (low/nominal/high) are preserved in native schemes and never equated.',
        'Zero detections in available records do not prove absence of fire.',
      ],
    },
    totals: {
      MODIS_detections: totalModis,
      VIIRS_detections: totalViirs,
      pooled_observation_count: totalModis + totalViirs,
      platform_totals: platformTotals,
      MODIS_frp: computeFrpSummary(inWindowRecords, 'MODIS'),
      VIIRS_frp: computeFrpSummary(inWindowRecords, 'VIIRS'),
      superseded_nrt_total: supersededNrtCount,
      duplicates_removed_total: exactDuplicatesRemoved,
    },
    thresholds: {
      MODIS: thresholdsModis,
      VIIRS: thresholdsViirs,
    },
    series,
    provenance: {
      sources: ['NASA FIRMS Archive Snapshot', 'MODIS Collection 6.1', 'VIIRS 375m Collection 2'],
      collections: ['MODIS C6.1 (MCD14DL / MCD14ML)', 'VIIRS C2 (VNP14IMGTDL / VJ114IMGTDL / VJ214IMGTDL)'],
      retrieved_at_utc: retrievedAtUtc,
      latest_acquisition_utc: latestAcquisitionUtc,
      archive_checksums: archiveChecksums,
    },
  };
}
