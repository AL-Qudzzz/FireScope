import {
  AoiDefinition,
  BinCoverageState,
  BinSpatialConcordance,
  BoundingBox,
  CalendarAnalyticsResponse,
  CalendarBinRecord,
  CanonicalObservation,
  CrossSensorHarmonizationSummary,
  FrpSummaryStats,
  GatedMethodLevelId,
  GeoPoint,
  Granularity,
  MethodLevelId,
  PlatformId,
  PlatformRegistryEntry,
  ProcessingStatus,
  SeasonalBaselineComparison,
  SensorFilter,
  SensorId,
  ViirsPlatformNormalizationSummary,
} from '../types/firescope';
import { computeHarmonizedSeries, computePlatformExposure } from './harmonizationScience';

export const PRODUCTION_ALLOWED_METHODS: readonly MethodLevelId[] = [
  'M0_RAW',
  'M1_AGGREGATED',
  'M2_COMPARATIVE',
] as const;

export const GATED_EXPERIMENTAL_METHODS: readonly GatedMethodLevelId[] = [
  'M3_CALIBRATED',
  'M3_EMPIRICAL_PLATFORM_BRIDGE',
  'M4_BIAS_AWARE',
] as const;

/**
 * Verifies whether a scientific method level is approved for production analytical output.
 * M3 (Empirical Platform Bridge / Calibrated MODIS-equivalent) and M4 (Bias-Aware) are gated
 * in production per AGENTS.md and docs/TECHNICAL_RESEARCH.md.
 */
export function isMethodLevelAllowedInProduction(
  methodId: string
): methodId is MethodLevelId {
  return (PRODUCTION_ALLOWED_METHODS as readonly string[]).includes(methodId);
}

/**
 * Hard production gate preventing M3/M4 experimental cross-sensor calibration or
 * observation-probability correction from running in production.
 */
export function assertProductionMethodGate(methodId: string): asserts methodId is MethodLevelId {
  if (!isMethodLevelAllowedInProduction(methodId)) {
    throw new Error(
      `Scientific Production Gate Violation: Method "${methodId}" is disabled in production. ` +
        `Only M0_RAW, M1_AGGREGATED, and M2_COMPARATIVE native sensor outputs are approved. ` +
        `M3/M4 cross-sensor scaling and MODIS-equivalent calibration are strictly prohibited without integrator sign-off.`
    );
  }
}

export { computeHarmonizedSeries };


/**
 * Computes 0.25° × 0.25° spatial cell co-location counts, Jaccard index, and conditional
 * co-detection rates from pre-aggregated cell counts.
 */
export function computeSpatialConcordanceFromCounts(
  paramsOrCoLocated:
    | {
        coLocated?: number;
        modisOnly?: number;
        viirsOnly?: number;
        coLocatedCells?: number;
        modisOnlyCells?: number;
        viirsOnlyCells?: number;
        gridResolutionDeg?: number;
      }
    | number,
  modisOnlyArg?: number,
  viirsOnlyArg?: number,
  gridResArg = 0.25
): BinSpatialConcordance {
  const coLocatedRaw =
    typeof paramsOrCoLocated === 'number'
      ? paramsOrCoLocated
      : paramsOrCoLocated.coLocated ?? paramsOrCoLocated.coLocatedCells ?? 0;
  const modisOnlyRaw =
    typeof paramsOrCoLocated === 'number'
      ? modisOnlyArg ?? 0
      : paramsOrCoLocated.modisOnly ?? paramsOrCoLocated.modisOnlyCells ?? 0;
  const viirsOnlyRaw =
    typeof paramsOrCoLocated === 'number'
      ? viirsOnlyArg ?? 0
      : paramsOrCoLocated.viirsOnly ?? paramsOrCoLocated.viirsOnlyCells ?? 0;
  const gridResolutionDeg =
    typeof paramsOrCoLocated === 'number'
      ? gridResArg
      : paramsOrCoLocated.gridResolutionDeg ?? 0.25;

  const coLocatedCellsCount = Math.max(0, Math.trunc(coLocatedRaw));
  const modisOnlyCellsCount = Math.max(0, Math.trunc(modisOnlyRaw));
  const viirsOnlyCellsCount = Math.max(0, Math.trunc(viirsOnlyRaw));
  const activeCellsTotal =
    coLocatedCellsCount + modisOnlyCellsCount + viirsOnlyCellsCount;
  const modisCellsTotal = coLocatedCellsCount + modisOnlyCellsCount;
  const viirsCellsTotal = coLocatedCellsCount + viirsOnlyCellsCount;

  const spatialPct =
    activeCellsTotal > 0
      ? Number(((coLocatedCellsCount / activeCellsTotal) * 100).toFixed(2))
      : null;
  const jaccardIdx =
    activeCellsTotal > 0
      ? Number((coLocatedCellsCount / activeCellsTotal).toFixed(4))
      : null;
  const modisPct =
    modisCellsTotal > 0
      ? Number(((coLocatedCellsCount / modisCellsTotal) * 100).toFixed(2))
      : null;
  const viirsPct =
    viirsCellsTotal > 0
      ? Number(((coLocatedCellsCount / viirsCellsTotal) * 100).toFixed(2))
      : null;

  const modisCondRate =
    modisCellsTotal > 0
      ? Number((coLocatedCellsCount / modisCellsTotal).toFixed(4))
      : null;
  const viirsCondRate =
    viirsCellsTotal > 0
      ? Number((coLocatedCellsCount / viirsCellsTotal).toFixed(4))
      : null;

  return {
    method_id: 'M2_GRID_DAILY_025_DEG',
    m2_method_id: 'M2_GRID_DAILY_025_DEG',
    method_name: '0.25° × 0.25° Daily Grid Cell Co-Occurrence (24h UTC)',
    spatial_resolution: `${gridResolutionDeg}° × ${gridResolutionDeg}° WGS84 grid cell (~27.8 km × 27.8 km at equator)`,
    temporal_resolution: '24h UTC calendar day',
    spatial_threshold_km: Number((gridResolutionDeg * 111.32).toFixed(1)),
    temporal_threshold_hours: 24,
    aggregation_method: 'FIXED_GRID_CELL_DAY_PARTITION',
    grid_resolution_deg: gridResolutionDeg,
    active_cells_total: activeCellsTotal,
    total_active_cells: activeCellsTotal,
    co_located_cells_count: coLocatedCellsCount,
    co_located_cells: coLocatedCellsCount,
    modis_only_cells_count: modisOnlyCellsCount,
    modis_only_cells: modisOnlyCellsCount,
    viirs_only_cells_count: viirsOnlyCellsCount,
    viirs_only_cells: viirsOnlyCellsCount,
    modis_eligible_cells_count: modisCellsTotal,
    modis_eligible_count: modisCellsTotal,
    viirs_eligible_cells_count: viirsCellsTotal,
    viirs_eligible_count: viirsCellsTotal,
    intersection_count: coLocatedCellsCount,
    union_count: activeCellsTotal,
    spatial_co_located_cells_pct: spatialPct,
    spatial_concordance_pct: spatialPct,
    cell_concordance_pct: spatialPct,
    jaccard_index: jaccardIdx,
    modis_cell_co_detection_pct: modisPct,
    modis_cell_co_detected_pct: modisPct,
    modis_co_detected_by_viirs_pct: modisPct,
    modis_conditional_rate: modisCondRate,
    viirs_cell_co_detection_pct: viirsPct,
    viirs_cell_co_detected_pct: viirsPct,
    viirs_co_detected_by_modis_pct: viirsPct,
    viirs_conditional_rate: viirsCondRate,
  };
}

/**
 * Computes 0.25° × 0.25° spatial cell co-location counts and percentage from cell sensor flags
 * or from two sets of MODIS and VIIRS cell keys.
 */
export function computeSpatialConcordanceFromCells(
  cellSensorFlagsOrModisSet:
    | Array<{ modis: boolean; viirs: boolean }>
    | Set<string>,
  viirsSet?: Set<string>,
  gridResolutionDeg = 0.25
): BinSpatialConcordance {
  if (cellSensorFlagsOrModisSet instanceof Set) {
    const modisCells = cellSensorFlagsOrModisSet;
    const viirsCells = viirsSet ?? new Set<string>();
    let coLocated = 0;
    let modisOnly = 0;
    for (const mKey of modisCells) {
      if (viirsCells.has(mKey)) {
        coLocated += 1;
      } else {
        modisOnly += 1;
      }
    }
    let viirsOnly = 0;
    for (const vKey of viirsCells) {
      if (!modisCells.has(vKey)) {
        viirsOnly += 1;
      }
    }
    return computeSpatialConcordanceFromCounts({
      coLocated,
      modisOnly,
      viirsOnly,
      gridResolutionDeg,
    });
  }

  let coLocatedCellsCount = 0;
  let modisOnlyCellsCount = 0;
  let viirsOnlyCellsCount = 0;

  for (const c of cellSensorFlagsOrModisSet) {
    if (!c.modis && !c.viirs) continue;
    if (c.modis && c.viirs) {
      coLocatedCellsCount += 1;
    } else if (c.modis) {
      modisOnlyCellsCount += 1;
    } else if (c.viirs) {
      viirsOnlyCellsCount += 1;
    }
  }

  return computeSpatialConcordanceFromCounts({
    coLocated: coLocatedCellsCount,
    modisOnly: modisOnlyCellsCount,
    viirsOnly: viirsOnlyCellsCount,
    gridResolutionDeg,
  });
}

/**
 * Computes M2 descriptive VIIRS Platform-Normalized Observation Rate (R_VIIRS = V / k_eff_VIIRS)
 * across a series of UTC time bins, excluding NO_SOURCE_DATA / COVERAGE_UNKNOWN bins from denominators.
 */
export function computeViirsPlatformNormalization(
  seriesOrParams:
    | CalendarBinRecord[]
    | {
        series: CalendarBinRecord[];
        selectedPlatforms?: PlatformId[];
        platformRegistry?: PlatformRegistryEntry[];
        startDate?: string;
        endDate?: string;
        coveredDateWindows?: Array<{ start: string; end: string }>;
      }
): ViirsPlatformNormalizationSummary {
  const series = Array.isArray(seriesOrParams)
    ? seriesOrParams
    : seriesOrParams.series;
  const fallbackSelectedPlatforms = Array.isArray(seriesOrParams)
    ? undefined
    : seriesOrParams.selectedPlatforms;
  const fallbackRegistry = Array.isArray(seriesOrParams)
    ? undefined
    : seriesOrParams.platformRegistry;
  const coveredDateWindows = Array.isArray(seriesOrParams)
    ? undefined
    : seriesOrParams.coveredDateWindows;

  const perPlatformCounts = { SNPP: 0, NOAA20: 0, NOAA21: 0 };
  const perPlatformCoveredBins = { SNPP: 0, NOAA20: 0, NOAA21: 0 };
  const perPlatformCoveredDays = { SNPP: 0, NOAA20: 0, NOAA21: 0 };
  const availableViirsSet = new Set<'SNPP' | 'NOAA20' | 'NOAA21'>();

  let coveredBinsTotal = 0;
  let sumKViirs = 0;
  let totalEligibleDays = 0;
  let totalViirsPlatformDays = 0;
  let totalViirsDetections = 0;

  for (const bin of series) {
    bin.m3_status = 'M3_DISABLED';
    const isCovered =
      bin.coverage_state !== 'NO_SOURCE_DATA' &&
      bin.coverage_state !== 'COVERAGE_UNKNOWN';

    const binStart = bin.time_bin_start_utc?.slice(0, 10) ?? '2020-01-01';
    const binEnd = bin.time_bin_end_utc?.slice(0, 10) ?? binStart;

    let activeViirsPlats: Array<'SNPP' | 'NOAA20' | 'NOAA21'> = [];
    if (isCovered) {
      if (bin.quality?.active_platforms && bin.quality.active_platforms.length > 0) {
        activeViirsPlats = bin.quality.active_platforms.filter(
          (p): p is 'SNPP' | 'NOAA20' | 'NOAA21' =>
            p === 'SNPP' || p === 'NOAA20' || p === 'NOAA21'
        );
      } else if (fallbackSelectedPlatforms) {
        const candidateViirs = fallbackSelectedPlatforms.filter(
          (p): p is 'SNPP' | 'NOAA20' | 'NOAA21' =>
            p === 'SNPP' || p === 'NOAA20' || p === 'NOAA21'
        );
        if (fallbackRegistry && fallbackRegistry.length > 0) {
          const canonicalFirstDate: Record<'SNPP' | 'NOAA20' | 'NOAA21', string> = {
            SNPP: '2012-01-20',
            NOAA20: '2018-04-01',
            NOAA21: '2023-03-01',
          };
          activeViirsPlats = candidateViirs.filter((p) => {
            const reg = fallbackRegistry.find((r) => r.platform_id === p);
            const firstDate = reg?.first_observation_date ?? canonicalFirstDate[p];
            const lastDate = reg?.last_observation_date ?? '2099-12-31';
            return binEnd >= firstDate && binStart <= lastDate;
          });
        } else {
          activeViirsPlats = candidateViirs;
        }
      }
    }

    const exposure = isCovered
      ? computePlatformExposure(
          binStart,
          binEnd,
          activeViirsPlats.length > 0
            ? activeViirsPlats
            : fallbackSelectedPlatforms,
          bin.platform_breakdown,
          coveredDateWindows
        )
      : {
          modis_active_platforms: 0,
          viirs_active_platforms: 0,
          eligible_days: 0,
          modis_platform_days: 0,
          viirs_platform_days: 0,
          modis_effective_platform_count: 0,
          viirs_effective_platform_count: 0,
          per_platform_covered_days: {
            TERRA: 0,
            AQUA: 0,
            SNPP: 0,
            NOAA20: 0,
            NOAA21: 0,
          },
        };

    const kViirs =
      activeViirsPlats.length > 0
        ? activeViirsPlats.length
        : isCovered && typeof bin.k_viirs_active === 'number' && bin.k_viirs_active > 0
          ? bin.k_viirs_active
          : exposure.viirs_active_platforms;
    bin.k_viirs_active = kViirs;
    bin.eligible_days = exposure.eligible_days;
    bin.viirs_platform_days = exposure.viirs_platform_days;
    bin.viirs_effective_platform_count =
      exposure.eligible_days > 0 && exposure.viirs_platform_days > 0
        ? exposure.viirs_effective_platform_count
        : kViirs > 0
          ? kViirs
          : null;

    if (!isCovered || bin.values?.VIIRS === null || kViirs === 0) {
      bin.viirs_per_platform = null;
      bin.viirs_per_effective_platform = null;
      continue;
    }

    coveredBinsTotal += 1;
    sumKViirs += kViirs;
    totalEligibleDays += exposure.eligible_days;
    totalViirsPlatformDays += exposure.viirs_platform_days;
    perPlatformCoveredDays.SNPP += exposure.per_platform_covered_days.SNPP;
    perPlatformCoveredDays.NOAA20 += exposure.per_platform_covered_days.NOAA20;
    perPlatformCoveredDays.NOAA21 += exposure.per_platform_covered_days.NOAA21;

    const vCount = bin.values?.VIIRS ?? 0;
    totalViirsDetections += vCount;
    const binEffRate =
      exposure.eligible_days > 0 && exposure.viirs_platform_days > 0
        ? Number(((vCount * exposure.eligible_days) / exposure.viirs_platform_days).toFixed(2))
        : Number((vCount / kViirs).toFixed(2));
    bin.viirs_per_platform = binEffRate;
    bin.viirs_per_effective_platform = binEffRate;

    for (const p of activeViirsPlats) {
      availableViirsSet.add(p);
      perPlatformCoveredBins[p] += 1;
    }
    if (bin.platform_breakdown) {
      perPlatformCounts.SNPP += bin.platform_breakdown.SNPP ?? 0;
      perPlatformCounts.NOAA20 += bin.platform_breakdown.NOAA20 ?? 0;
      perPlatformCounts.NOAA21 += bin.platform_breakdown.NOAA21 ?? 0;
    }
  }

  const requestedBinsTotal = series.length;
  const effectiveKViirs =
    totalEligibleDays > 0 && totalViirsPlatformDays > 0
      ? Number((totalViirsPlatformDays / totalEligibleDays).toFixed(2))
      : coveredBinsTotal > 0 && sumKViirs > 0
        ? Number((sumKViirs / coveredBinsTotal).toFixed(2))
        : null;

  const viirsPerActivePlatform =
    totalEligibleDays > 0 && totalViirsPlatformDays > 0
      ? Number(((totalViirsDetections * totalEligibleDays) / totalViirsPlatformDays).toFixed(2))
      : effectiveKViirs !== null && effectiveKViirs > 0
        ? Number((totalViirsDetections / effectiveKViirs).toFixed(2))
        : null;

  const viirsPerPlatformBin =
    sumKViirs > 0 ? Number((totalViirsDetections / sumKViirs).toFixed(2)) : null;

  const coverageCompletenessPct =
    requestedBinsTotal > 0
      ? Math.round((coveredBinsTotal / requestedBinsTotal) * 100)
      : null;

  const availableViirsList = Array.from(availableViirsSet);
  const integerExpectedViirs = availableViirsList.length;
  const integerNormalizedRate =
    integerExpectedViirs > 0
      ? Number((totalViirsDetections / integerExpectedViirs).toFixed(2))
      : null;
  const formulaStr =
    'R_VIIRS,eff = V / k_eff, where k_eff = (sum_p d_p) / D across covered platform-days d_p and eligible days D';

  return {
    method_id: 'M2_COMPARATIVE',
    normalization_formula: formulaStr,
    formula: formulaStr,
    total_viirs_detections: totalViirsDetections,
    raw_viirs_total: totalViirsDetections,
    raw_viirs_detections: totalViirsDetections,
    available_viirs_platforms: availableViirsList,
    active_viirs_platforms: availableViirsList,
    per_platform_counts: perPlatformCounts,
    per_platform_covered_bins: perPlatformCoveredBins,
    per_platform_covered_days: perPlatformCoveredDays,
    covered_bins_total: coveredBinsTotal,
    requested_bins_total: requestedBinsTotal,
    window_days: totalEligibleDays,
    eligible_days: totalEligibleDays,
    viirs_platform_days: totalViirsPlatformDays,
    effective_k_viirs: effectiveKViirs,
    effective_active_platforms: effectiveKViirs ?? 0,
    effective_viirs_platforms: effectiveKViirs,
    expected_viirs_platforms: integerExpectedViirs,
    viirs_effective_platform_count: effectiveKViirs,
    viirs_per_active_platform: viirsPerActivePlatform,
    viirs_per_effective_platform: viirsPerActivePlatform,
    normalized_viirs_per_platform: integerNormalizedRate,
    viirs_per_platform_bin: viirsPerPlatformBin,
    coverage_completeness_pct: coverageCompletenessPct,
    platform_status_note:
      availableViirsList.length > 0
        ? `Active VIIRS platforms in covered bins: ${availableViirsList.join(', ')} (platform-days = ${totalViirsPlatformDays}/${totalEligibleDays}d, k_eff = ${effectiveKViirs ?? 0})`
        : 'No active VIIRS platforms in covered bins.',
    scientific_caveat:
      'Exposure-weighted M2 observation-rate metric (R_VIIRS,eff = V / k_eff, where k_eff = sum(d_p)/D) accounting for exact active VIIRS platform-days (S-NPP through 2026-11-02, NOAA-20 from 2018-04-01, NOAA-21 from 2023-03-01). Not a calibrated fire count, physical incident total, or M3 cross-sensor bridge.',
  };
}

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
 * Identifies verified offshore marine oil/gas platform flare zones and deep pelagic ocean basins
 * far from landmasses and volcanic islands. Never rejects coastal towns, Brazil, Africa, or island chains.
 */
export function isVerifiedOffshoreMarineCoordinate(lat: number, lng: number): boolean {
  if (!validateCoordinates(lat, lng)) return false;

  // 1. Southeast Asia verified offshore oil/gas rig fields
  // West Natuna offshore (Belanak/Kerisi/Kakap): avoids Anambas (2.8..3.5, 105.6..106.5) & Natuna Besar (3.6..4.3, 107.9..108.5)
  if (lat >= 3.85 && lat <= 5.8 && lng >= 104.8 && lng <= 107.6) return true;
  // Sarawak / Luconia / Baram offshore gas fields: avoids Bintulu coast (<3.52), Miri coast (4.1..4.55, 113.8..114.2) & Brunei/Labuan (>114.35)
  if (lat >= 3.55 && lat <= 5.8 && lng >= 111.0 && lng <= 113.55) return true;
  if (lat >= 4.58 && lat <= 5.8 && lng > 113.55 && lng <= 114.35) return true;
  // Vietnam Nam Con Son / Bach Ho offshore rigs
  if (lat >= 7.2 && lat <= 9.2 && lng >= 107.8 && lng <= 110.2) return true;
  // West Java Sea ONWJ / Ardjuna / Cinta offshore platforms (north of Java coast -6.05, east of Thousand Islands 106.7)
  if (lat >= -6.02 && lat <= -4.8 && lng >= 106.75 && lng <= 108.8) return true;
  // East Java Sea Poleng offshore platform (north of Madura -6.88, south of Bawean -5.9)
  if (lat >= -6.75 && lat <= -6.2 && lng >= 112.75 && lng <= 113.25) return true;
  // Timor Sea offshore LNG / gas flares (between Timor, Yamdena, and Tiwi Islands)
  if (lat >= -10.6 && lat <= -9.2 && lng >= 128.0 && lng <= 130.8) return true;
  // Gulf of Thailand central offshore platforms
  if (lat >= 7.2 && lat <= 10.2 && lng >= 101.0 && lng <= 103.5) return true;

  // 2. North Sea offshore oil/gas rigs (strictly between UK and Norway)
  if (lat >= 55.2 && lat <= 61.8 && lng >= -0.6 && lng <= 4.4) return true;

  // 3. Persian Gulf central offshore rigs (strictly away from Iran, Saudi, Qatar, Bahrain, UAE coasts)
  if (lat >= 25.05 && lat <= 29.3 && lng >= 49.3 && lng <= 53.6) {
    const inBahrainQatar = lat >= 24.4 && lat <= 26.4 && lng >= 50.4 && lng <= 51.7;
    const onIranCoast = (lat >= 27.35 && lng >= 51.8) || (lat >= 28.8 && lng >= 50.1);
    const onSaudiCoast = (lat <= 26.9 && lng <= 50.35) || (lat <= 28.0 && lng <= 49.5);
    if (!inBahrainQatar && !onIranCoast && !onSaudiCoast) return true;
  }

  // 4. Grand Banks (Hibernia / Terra Nova) Atlantic offshore platforms
  if (lat >= 46.0 && lat <= 47.5 && lng >= -49.5 && lng <= -47.5) return true;

  // 5. Bay of Campeche / Cantarell Gulf of Mexico offshore platforms
  if (lat >= 19.0 && lat <= 20.5 && lng >= -92.8 && lng <= -91.5) return true;

  // 6. Gulf of Guinea offshore oil platforms (strictly south of Niger Delta coast 4.20N)
  if (lat >= 2.2 && lat <= 4.2 && lng >= 4.5 && lng <= 8.2) return true;

  // 7. Deep pelagic open-ocean basins (away from oceanic islands and continental shelves)
  if (lat >= -55 && lat <= -8 && lng >= -33 && lng <= 8) return true; // Deep South Atlantic
  if (lat >= 15 && lat <= 42 && lng >= -56 && lng <= -32) return true; // Deep Central North Atlantic
  if (lat >= -46 && lat <= -22 && lng >= 60 && lng <= 92) return true; // Deep Indian Ocean
  if (lat >= -45 && lat <= -12 && lng >= 92 && lng <= 112) return true; // Deep SE Indian Ocean

  return false;
}

/**
 * Classifies whether a canonical NASA FIRMS observation is a verified offshore/marine anomaly
 * (either explicit NASA FIRMS `type=3` offshore flag or verified offshore oil/gas / deep pelagic zone).
 * Does not mutate raw observations.
 */
export function isOffshoreMarineObservation(
  obs: Pick<CanonicalObservation, 'latitude' | 'longitude' | 'type_native'>
): boolean {
  if (obs.type_native === 3 || String(obs.type_native ?? '').trim() === '3') {
    return true;
  }
  return isVerifiedOffshoreMarineCoordinate(obs.latitude, obs.longitude);
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

  const maxMw = validValues[validValues.length - 1];
  const statuses = Array.from(new Set(sensorRecords.map((r) => r.processing_status))).join('/');

  return {
    sensor,
    unit: 'MW',
    sum_mw: Number(sum.toFixed(2)),
    mean_mw: Number(mean.toFixed(2)),
    median_mw: Number(median.toFixed(2)),
    p90_mw: Number(p90.toFixed(2)),
    max_mw: Number(maxMw.toFixed(2)),
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
  archiveCoverageStart?: string;
  archiveCoverageEnd?: string;
  retrievedAtUtc: string;
  latestAcquisitionUtc: string;
  archiveChecksums: string[];
  enableExperimentalM3?: boolean;
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
    archiveCoverageStart = '2024-01-01',
    archiveCoverageEnd = '2026-11-13',
    retrievedAtUtc,
    latestAcquisitionUtc,
    archiveChecksums,
    enableExperimentalM3 = false,
  } = params;

  // Step 1: filter to AOI
  const aoiRecords = allRawRecords.filter((r) => isPointInAoi(r.latitude, r.longitude, aoi));

  // Step 2: deduplicate exact rows and supersede NRT with Standard
  const { canonical, supersededNrtCount, exactDuplicatesRemoved } =
    deduplicateAndSupersedeObservations(aoiRecords);

  // Step 3: apply sensor, platform, processing status, day/night, and native confidence filters
  const filteredRecords = canonical.filter((r) => {
    if (sensor !== 'ALL' && r.sensor !== sensor) return false;
    if (!platforms.includes(r.platform)) return false;
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

  // Historical/live coverage window (defaults to demo snapshot bounds unless overridden by server live window)
  const archiveStartStr = archiveCoverageStart;
  const archiveEndStr = archiveCoverageEnd;
  const availableModisRecords: CanonicalObservation[] = [];
  const availableViirsRecords: CanonicalObservation[] = [];

  const series: CalendarBinRecord[] = bins.map((bin) => {
    const binStartDateStr = bin.startUtc.slice(0, 10);
    const binEndDateStr = new Date(bin.endMs - 1000).toISOString().slice(0, 10);

    const activePlatforms: PlatformId[] = [];
    const unavailablePlatforms: PlatformId[] = [];

    const selectedRegistry = platformRegistry.filter((p) => {
      if (sensor !== 'ALL' && p.sensor !== sensor) return false;
      if (!platforms.includes(p.platform_id)) return false;
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
      coverageNote = `Selected period is outside loaded NASA FIRMS coverage (${archiveStartStr} to ${archiveEndStr}).`;
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
    const availableBinRecords: CanonicalObservation[] = [];
    const binCellMap = new Map<string, { modis: boolean; viirs: boolean }>();
    const isCoveredBin =
      (coverageState as BinCoverageState) !== 'NO_SOURCE_DATA' &&
      (coverageState as BinCoverageState) !== 'COVERAGE_UNKNOWN';

    for (const r of binRecords) {
      if (!isCoveredBin) continue;
      if (r.sensor === 'MODIS' && !modisAvailable) continue;
      if (r.sensor === 'VIIRS' && !viirsAvailable) continue;
      availableBinRecords.push(r);
      if (r.sensor === 'MODIS') availableModisRecords.push(r);
      else availableViirsRecords.push(r);

      const latBin = Math.floor(r.latitude * 4) / 4;
      const lngBin = Math.floor(r.longitude * 4) / 4;
      const cellKey = `${r.acq_date}|${latBin}|${lngBin}`;
      const existingCell = binCellMap.get(cellKey) ?? { modis: false, viirs: false };
      if (r.sensor === 'MODIS') existingCell.modis = true;
      else existingCell.viirs = true;
      binCellMap.set(cellKey, existingCell);

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

    const modisFrp = computeFrpSummary(availableBinRecords, 'MODIS');
    const viirsFrp = computeFrpSummary(availableBinRecords, 'VIIRS');

    const pooledCount =
      modisCount === null && viirsCount === null
        ? null
        : (modisCount ?? 0) + (viirsCount ?? 0);

    const spatialConcordance: BinSpatialConcordance | undefined = isCoveredBin
      ? computeSpatialConcordanceFromCells(Array.from(binCellMap.values()))
      : undefined;

    return {
      bin_key: bin.binKey,
      label: bin.label,
      time_bin_start_utc: bin.startUtc,
      time_bin_end_utc: bin.endUtc,
      granularity,
      coverage_state: coverageState,
      values: {
        MODIS: isCoveredBin ? modisCount : null,
        VIIRS: isCoveredBin ? viirsCount : null,
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
      pooled_observation_count: isCoveredBin ? pooledCount : null,
      pooled_caveat:
        'Unweighted arithmetic sum of MODIS and VIIRS observation records. Not a normalized cross-sensor fire count or unique incident total.',
      quality: {
        coverage_note: coverageNote,
        active_platforms: activePlatforms,
        unavailable_platforms: unavailablePlatforms,
        superseded_nrt_count: supersededNrtCount,
        exact_duplicates_removed: exactDuplicatesRemoved,
      },
      spatial_concordance: spatialConcordance,
    };
  });

  // Compute P1 Seasonal Baseline comparisons across active bins
  const modisSeriesVals = series
    .map((s) => s.values.MODIS)
    .filter((v): v is number => typeof v === 'number');
  const viirsSeriesVals = series
    .map((s) => s.values.VIIRS)
    .filter((v): v is number => typeof v === 'number');
  const distinctSeriesYears = Array.from(
    new Set(series.map((s) => Number(s.time_bin_start_utc.slice(0, 4))).filter(Number.isFinite))
  );
  const effectiveBaselineYears = distinctSeriesYears.length >= 3 ? distinctSeriesYears : [];

  for (const bin of series) {
    const mUnavailable = bin.values.MODIS === null;
    const vUnavailable = bin.values.VIIRS === null;
    const mBase = computeSeasonalBaseline(
      bin.values.MODIS ?? 0,
      !mUnavailable && modisSeriesVals.length >= 3 ? modisSeriesVals : [],
      !mUnavailable && modisSeriesVals.length >= 3 ? effectiveBaselineYears : [],
      'MODIS'
    );
    const vBase = computeSeasonalBaseline(
      bin.values.VIIRS ?? 0,
      !vUnavailable && viirsSeriesVals.length >= 3 ? viirsSeriesVals : [],
      !vUnavailable && viirsSeriesVals.length >= 3 ? effectiveBaselineYears : [],
      'VIIRS'
    );
    if (effectiveBaselineYears.length === 0) {
      if (mBase.status_label !== 'Baseline unavailable (insufficient history)') {
        mBase.caveat_note =
          'Within-selected-window descriptive comparison across active bins (not a multi-year seasonal climatology).';
      }
      if (vBase.status_label !== 'Baseline unavailable (insufficient history)') {
        vBase.caveat_note =
          'Within-selected-window descriptive comparison across active bins (not a multi-year seasonal climatology).';
      }
    }
    bin.seasonal_baseline = {
      MODIS: mBase,
      VIIRS: vBase,
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

  const cellSensorMap = new Map<string, { modis: boolean; viirs: boolean }>();
  const coveredRecords = [...availableModisRecords, ...availableViirsRecords];
  for (const r of coveredRecords) {
    if (r.acq_date < startDate || r.acq_date > endDate) continue;
    const latBin = Math.floor(r.latitude * 4) / 4;
    const lngBin = Math.floor(r.longitude * 4) / 4;
    const cKey = `${r.acq_date}|${latBin}|${lngBin}`;
    const existing = cellSensorMap.get(cKey) ?? { modis: false, viirs: false };
    if (r.sensor === 'MODIS') existing.modis = true;
    else existing.viirs = true;
    cellSensorMap.set(cKey, existing);
  }

  const methodId: MethodLevelId = sensor === 'ALL' ? 'M2_COMPARATIVE' : 'M1_AGGREGATED';
  assertProductionMethodGate(methodId);

  const viirsNormalization = computeViirsPlatformNormalization(series);

  const crossSensorHarmonization = computeCrossSensorHarmonization({
    series,
    thresholds: { MODIS: thresholdsModis, VIIRS: thresholdsViirs },
    totalModis,
    totalViirs,
    granularity,
    startDate,
    endDate,
    aoiName: aoi.name,
    cellSensorFlags: Array.from(cellSensorMap.values()),
  });

  return {
    data_mode: 'DEMO_SNAPSHOT',
    data_backing: 'DEMO_FIXTURE_BASELINE',
    m3_production_status: 'M3_DISABLED',
    requested_window: { start_date: startDate, end_date: endDate },
    actual_coverage_window: {
      start_date: archiveStartStr <= archiveEndStr ? archiveStartStr : null,
      end_date: archiveStartStr <= archiveEndStr ? archiveEndStr : null,
    },
    incomplete_coverage: startDate < archiveStartStr || endDate > archiveEndStr,
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
      id: methodId,
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
      MODIS_frp: computeFrpSummary(availableModisRecords, 'MODIS'),
      VIIRS_frp: computeFrpSummary(availableViirsRecords, 'VIIRS'),
      superseded_nrt_total: supersededNrtCount,
      duplicates_removed_total: exactDuplicatesRemoved,
    },
    cross_sensor_harmonization: crossSensorHarmonization,
    viirs_platform_normalization: viirsNormalization,
    thresholds: {
      MODIS: thresholdsModis,
      VIIRS: thresholdsViirs,
    },
    series,
    ...(enableExperimentalM3
      ? { harmonization: computeHarmonizedSeries(series, metric) }
      : {}),
    provenance: {
      sources: ['NASA FIRMS Archive Snapshot', 'MODIS Collection 6.1', 'VIIRS 375m Collection 2'],
      collections: ['MODIS C6.1 (MCD14DL / MCD14ML)', 'VIIRS C2 (VNP14IMGTDL / VJ114IMGTDL / VJ214IMGTDL)'],
      retrieved_at_utc: retrievedAtUtc,
      latest_acquisition_utc: latestAcquisitionUtc,
      archive_checksums: archiveChecksums,
    },
  };
}

/**
 * Computes M2 Cross-Sensor Harmonization & Concordance metrics across common UTC time bins
 * and 0.25° × 0.25° spatial cells without pooling or falsifying cross-sensor counts.
 */
export function computeCrossSensorHarmonization(params: {
  series: CalendarBinRecord[];
  thresholds: {
    MODIS: [number, number, number, number];
    VIIRS: [number, number, number, number];
  };
  totalModis: number;
  totalViirs: number;
  granularity: Granularity;
  startDate: string;
  endDate: string;
  aoiName: string;
  cellSensorFlags?: Array<{ modis: boolean; viirs: boolean }>;
  precomputedCellCounts?: {
    coLocated: number;
    modisOnly: number;
    viirsOnly: number;
  };
}): CrossSensorHarmonizationSummary {
  const {
    series,
    thresholds,
    totalModis,
    totalViirs,
    granularity,
    startDate,
    endDate,
    aoiName,
    cellSensorFlags = [],
    precomputedCellCounts,
  } = params;

  let coDetectedBins = 0;
  let viirsOnlyBins = 0;
  let modisOnlyBins = 0;
  let quietVerifiedBins = 0;
  let coveredBinsCount = 0;

  for (const bin of series) {
    if (
      bin.coverage_state === 'NO_SOURCE_DATA' ||
      bin.coverage_state === 'COVERAGE_UNKNOWN'
    ) {
      bin.cross_sensor_regime = 'COVERAGE_GAP';
      continue;
    }

    coveredBinsCount += 1;
    const m = bin.values.MODIS ?? 0;
    const v = bin.values.VIIRS ?? 0;

    if (m === 0 && v === 0) {
      bin.cross_sensor_regime = 'QUIET_VERIFIED';
      quietVerifiedBins += 1;
    } else if (m > 0 && v > 0) {
      coDetectedBins += 1;
      const mPeak = m >= thresholds.MODIS[1];
      const vPeak = v >= thresholds.VIIRS[1];
      bin.cross_sensor_regime = mPeak && vPeak ? 'DUAL_SENSOR_PEAK' : 'DUAL_SENSOR_ACTIVE';
    } else if (v > 0 && m === 0) {
      viirsOnlyBins += 1;
      bin.cross_sensor_regime = 'VIIRS_375M_DOMINATED';
    } else {
      modisOnlyBins += 1;
      bin.cross_sensor_regime = 'MODIS_1KM_ONLY';
    }
  }

  const activeBinsTotal = coDetectedBins + viirsOnlyBins + modisOnlyBins;
  const temporalConcordancePct =
    activeBinsTotal > 0 ? Math.round((coDetectedBins / activeBinsTotal) * 100) : null;

  const spatialStats = precomputedCellCounts
    ? computeSpatialConcordanceFromCounts(precomputedCellCounts)
    : computeSpatialConcordanceFromCells(cellSensorFlags);
  const spatialCoLocatedCellsPct = spatialStats.spatial_co_located_cells_pct;

  const coverageCompletenessPct =
    series.length > 0 ? Math.round((coveredBinsCount / series.length) * 100) : null;

  const viirsToModisRatio =
    totalModis > 0 ? Number((totalViirs / totalModis).toFixed(2)) : null;

  let dominantRegimeNote = 'No active thermal anomalies detected across available sensors in this window.';
  if (activeBinsTotal > 0) {
    if (coDetectedBins >= viirsOnlyBins && coDetectedBins >= modisOnlyBins && coDetectedBins > 0) {
      dominantRegimeNote = `Dual-sensor corroboration in ${coDetectedBins}/${activeBinsTotal} active ${granularity} bin(s) (${temporalConcordancePct}% temporal concordance${
        spatialCoLocatedCellsPct !== null ? `, ${spatialCoLocatedCellsPct}% 0.25° spatial co-location` : ''
      })${
        viirsToModisRatio !== null ? `; VIIRS 375 m recorded ${viirsToModisRatio}× detections relative to MODIS 1 km.` : '.'
      }`;
    } else if (viirsOnlyBins > coDetectedBins && viirsOnlyBins >= modisOnlyBins) {
      dominantRegimeNote = `VIIRS 375 m-dominated regime (${viirsOnlyBins}/${activeBinsTotal} active ${granularity} bin(s) detected only by VIIRS 375 m), reflecting smaller or cooler sub-kilometer burning.`;
    } else {
      dominantRegimeNote = `MODIS 1 km-only regime (${modisOnlyBins}/${activeBinsTotal} active ${granularity} bin(s) detected only by MODIS Terra/Aqua; e.g., pre-2012 archive era or morning Terra overpass).`;
    }
  }

  // Compute log Pearson r across co-detected bins when >= 3 co-detected bins exist
  const logPairs: Array<[number, number]> = [];
  for (const bin of series) {
    const m = bin.values.MODIS ?? 0;
    const v = bin.values.VIIRS ?? 0;
    if (m > 0 && v > 0) {
      logPairs.push([Math.log1p(m), Math.log1p(v)]);
    }
  }
  let logPearsonR: number | null = null;
  if (logPairs.length >= 3) {
    const n = logPairs.length;
    const meanX = logPairs.reduce((s, p) => s + p[0], 0) / n;
    const meanY = logPairs.reduce((s, p) => s + p[1], 0) / n;
    let cov = 0;
    let varX = 0;
    let varY = 0;
    for (const [x, y] of logPairs) {
      const dx = x - meanX;
      const dy = y - meanY;
      cov += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }
    if (varX > 1e-9 && varY > 1e-9) {
      logPearsonR = Number((cov / Math.sqrt(varX * varY)).toFixed(3));
    }
  }

  return {
    method_id: 'M2_COMPARATIVE',
    m2_spatial_method_id: 'M2_GRID_DAILY_025_DEG',
    m2_spatial_method_name: '0.25° × 0.25° Daily Grid Cell Co-Occurrence (24h UTC)',
    method_version: '1.2.0',
    formula:
      'Concordance_T = count(t : N_MODIS(A,t) > 0 AND N_VIIRS(A,t) > 0) / count(t : N_MODIS(A,t) > 0 OR N_VIIRS(A,t) > 0); Concordance_S (Jaccard) = |C_M cap C_V| / |C_M cup C_V|; Ratio_{V:M} = N_VIIRS / N_MODIS',
    spatial_unit: `${aoiName} (AOI & 0.25° × 0.25° WGS84 grid cells)`,
    time_window: `${startDate} to ${endDate} (UTC ${granularity} bins)`,
    spatial_resolution: '0.25° × 0.25° WGS84 grid cell (~27.8 km × 27.8 km at equator)',
    temporal_resolution: '24h UTC calendar day',
    spatial_threshold_km: 27.8,
    temporal_threshold_hours: 24,
    aggregation_method: 'FIXED_GRID_CELL_DAY_PARTITION',
    active_bins_total: activeBinsTotal,
    co_detected_bins_count: coDetectedBins,
    viirs_only_bins_count: viirsOnlyBins,
    modis_only_bins_count: modisOnlyBins,
    quiet_verified_bins_count: quietVerifiedBins,
    temporal_concordance_pct: temporalConcordancePct,
    temporal_concordance: {
      total_active_bins: activeBinsTotal,
      co_active_bins: coDetectedBins,
      co_detected_bins: coDetectedBins,
      modis_only_bins: modisOnlyBins,
      viirs_only_bins: viirsOnlyBins,
      temporal_jaccard_pct: temporalConcordancePct,
      log_pearson_r: logPearsonR,
    },
    spatial_co_located_cells_pct: spatialCoLocatedCellsPct,
    spatial_concordance: spatialStats,
    active_cells_total: spatialStats.active_cells_total,
    co_located_cells_count: spatialStats.co_located_cells_count,
    modis_only_cells_count: spatialStats.modis_only_cells_count,
    viirs_only_cells_count: spatialStats.viirs_only_cells_count,
    modis_eligible_cells_count: spatialStats.modis_eligible_cells_count,
    viirs_eligible_cells_count: spatialStats.viirs_eligible_cells_count,
    intersection_count: spatialStats.intersection_count,
    union_count: spatialStats.union_count,
    jaccard_index: spatialStats.jaccard_index,
    modis_cell_co_detection_pct: spatialStats.modis_cell_co_detection_pct,
    modis_co_detected_by_viirs_pct: spatialStats.modis_co_detected_by_viirs_pct,
    modis_conditional_rate: spatialStats.modis_conditional_rate,
    viirs_cell_co_detection_pct: spatialStats.viirs_cell_co_detection_pct,
    viirs_co_detected_by_modis_pct: spatialStats.viirs_co_detected_by_modis_pct,
    viirs_conditional_rate: spatialStats.viirs_conditional_rate,
    coverage_completeness_pct: coverageCompletenessPct,
    viirs_to_modis_ratio: viirsToModisRatio,
    empirical_viirs_to_modis_ratio: viirsToModisRatio,
    dominant_regime_note: dominantRegimeNote,
    scientific_caveat:
      'M2 Cross-Sensor Harmonization aligns MODIS C6.1 (1 km) and VIIRS C2 (375 m) onto identical UTC time bins and 0.25° spatial cells (M2_GRID_DAILY_025_DEG) to measure landscape-scale sensor co-occurrence without pooling raw counts as a normalized fire total. Coarse 0.25° daily cell co-occurrence (~771 km² at equator) is distinct from acute point-level clustering (M2_POINT_PROXIMITY_6H, 1.5–2.5 km, ±6h).',
  };
}

