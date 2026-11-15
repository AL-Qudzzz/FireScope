import {
  CalendarBinRecord,
  CalendarMetricId,
  CanonicalObservation,
  CoLocationClassification,
  CoLocationCluster,
  CoLocationSummary,
  HarmonizationDiagnostics,
  HarmonizationSummary,
  HarmonizedBinPoint,
  PlatformId,
  SensorId,
} from '../types/firescope';

const MODIS_PLATFORMS: PlatformId[] = ['TERRA', 'AQUA'];
const VIIRS_PLATFORMS: PlatformId[] = ['SNPP', 'NOAA20', 'NOAA21'];

const PLATFORM_SERVICE_WINDOWS: Record<PlatformId, { start: string; end: string }> = {
  TERRA: { start: '2000-11-01', end: '9999-12-31' },
  AQUA: { start: '2002-07-04', end: '9999-12-31' },
  SNPP: { start: '2012-01-20', end: '2026-11-02' },
  NOAA20: { start: '2018-04-01', end: '9999-12-31' },
  NOAA21: { start: '2023-03-01', end: '9999-12-31' },
};

const EARTH_RADIUS_KM = 6371.0088;

function roundTo(value: number, decimals = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return quantileSorted(sorted, 0.5);
}

/**
 * Counts expected active MODIS and VIIRS satellites in a bin, respecting
 * official NASA commission/decommission dates as well as any active filter set
 * propagated via `bin.quality.active_platforms`.
 */
export function getExpectedActivePlatforms(
  startDateUtc: string,
  endDateUtc: string,
  activePlatforms?: PlatformId[],
  platformBreakdown?: Record<PlatformId, number>
): { modis: number; viirs: number } {
  const startDay = startDateUtc.slice(0, 10);
  const endDay = endDateUtc.slice(0, 10);

  const countFromList = (candidates: PlatformId[], list: Set<PlatformId>): number => {
    let count = 0;
    for (const p of candidates) {
      const win = PLATFORM_SERVICE_WINDOWS[p];
      const overlapsWindow = startDay <= win.end && endDay >= win.start;
      const observedInBin = (platformBreakdown?.[p] ?? 0) > 0;
      if ((list.has(p) && overlapsWindow) || observedInBin) {
        count += 1;
      }
    }
    return count;
  };

  if (activePlatforms && activePlatforms.length > 0) {
    const activeSet = new Set(activePlatforms);
    const modis = countFromList(MODIS_PLATFORMS, activeSet);
    const viirs = countFromList(VIIRS_PLATFORMS, activeSet);
    return { modis, viirs };
  }

  let modis = 0;
  for (const p of MODIS_PLATFORMS) {
    const win = PLATFORM_SERVICE_WINDOWS[p];
    if ((startDay <= win.end && endDay >= win.start) || (platformBreakdown?.[p] ?? 0) > 0) {
      modis += 1;
    }
  }
  let viirs = 0;
  for (const p of VIIRS_PLATFORMS) {
    const win = PLATFORM_SERVICE_WINDOWS[p];
    if ((startDay <= win.end && endDay >= win.start) || (platformBreakdown?.[p] ?? 0) > 0) {
      viirs += 1;
    }
  }
  return { modis, viirs };
}

function extractBinSensorValue(
  bin: CalendarBinRecord,
  sensor: 'MODIS' | 'VIIRS',
  metric: CalendarMetricId
): number | null {
  const countVal = bin.values[sensor];
  if (countVal === null) return null;
  if (metric === 'detection_count') return countVal;
  const sumMw = bin.frp_summary[sensor].sum_mw;
  if (typeof sumMw === 'number' && Number.isFinite(sumMw)) return sumMw;
  return countVal === 0 ? 0 : null;
}

interface OverlapSample {
  idx: number;
  rModis: number;
  rViirs: number;
  yModis2Sat: number;
  xLog: number; // ln(rViirs + 1)
  yLog: number; // ln(rModis + 1)
}

interface FitResult {
  mode: 'OLS_LOG_BRIDGE' | 'ROBUST_MEDIAN_RATIO';
  alpha: number;
  beta: number;
  kappa: number;
  rLog: number | null;
  rSquaredLog: number | null;
}

function fitBridgeParameters(samples: OverlapSample[]): FitResult {
  const ratios = samples
    .filter((s) => s.rModis > 0 && s.rViirs > 0)
    .map((s) => s.rViirs / s.rModis);
  const kappa = ratios.length > 0 ? Math.max(0.05, median(ratios)) : 1;

  if (samples.length < 3) {
    return {
      mode: 'ROBUST_MEDIAN_RATIO',
      alpha: 0,
      beta: 1,
      kappa,
      rLog: null,
      rSquaredLog: null,
    };
  }

  const n = samples.length;
  const meanX = samples.reduce((acc, s) => acc + s.xLog, 0) / n;
  const meanY = samples.reduce((acc, s) => acc + s.yLog, 0) / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const s of samples) {
    const dx = s.xLog - meanX;
    const dy = s.yLog - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  if (sxx <= 1e-9 || syy <= 1e-9) {
    return {
      mode: 'ROBUST_MEDIAN_RATIO',
      alpha: 0,
      beta: 1,
      kappa,
      rLog: null,
      rSquaredLog: null,
    };
  }

  const betaOls = sxy / sxx;
  const rLog = sxy / Math.sqrt(sxx * syy);
  const rSquaredLog = rLog * rLog;
  const alphaOls = meanY - betaOls * meanX;

  // Use OLS log-linear bridge when sample size >= 6, positive correlation, and physical slope
  if (samples.length >= 6 && rLog >= 0.25 && betaOls >= 0.15 && betaOls <= 2.5) {
    return {
      mode: 'OLS_LOG_BRIDGE',
      alpha: alphaOls,
      beta: betaOls,
      kappa,
      rLog,
      rSquaredLog,
    };
  }

  return {
    mode: 'ROBUST_MEDIAN_RATIO',
    alpha: alphaOls,
    beta: betaOls,
    kappa,
    rLog,
    rSquaredLog,
  };
}

function predictPerPlatformModis(rViirs: number, fit: FitResult): number {
  if (fit.mode === 'OLS_LOG_BRIDGE') {
    const predLog = fit.alpha + fit.beta * Math.log(rViirs + 1);
    return Math.max(0, Math.exp(predLog) - 1);
  }
  return fit.kappa > 0 ? Math.max(0, rViirs / fit.kappa) : rViirs;
}

function computeRobustZMap(
  values: Array<number | null>
): Array<number | null> {
  const validLogs: number[] = [];
  for (const v of values) {
    if (v !== null && Number.isFinite(v)) {
      validLogs.push(Math.log(Math.max(0, v) + 1));
    }
  }
  if (validLogs.length < 3) {
    return values.map(() => null);
  }
  const med = median(validLogs);
  const mad = median(validLogs.map((x) => Math.abs(x - med)));
  const scale = 1.4826 * mad;

  let stdDev = 0;
  if (scale <= 1e-9) {
    const meanVal = validLogs.reduce((a, b) => a + b, 0) / validLogs.length;
    const variance =
      validLogs.reduce((acc, x) => acc + (x - meanVal) * (x - meanVal), 0) / validLogs.length;
    stdDev = Math.sqrt(variance);
  }

  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return null;
    const logVal = Math.log(Math.max(0, v) + 1);
    if (scale > 1e-9) {
      return roundTo((logVal - med) / scale, 2);
    }
    if (stdDev > 1e-9) {
      return roundTo((logVal - med) / stdDev, 2);
    }
    return 0;
  });
}

/**
 * Computes empirical cross-sensor harmonization (M3) across temporal calendar bins:
 * 1. Normalizes extensive counts/FRP by active satellite counts (Terra/Aqua vs SNPP/NOAA-20/NOAA-21).
 * 2. Calibrates a cross-sensor bridge on active paired overlap bins using log-linear OLS
 *    (or robust per-satellite median ratio when sample variance/count is small).
 * 3. Performs chronological 70/30 hold-out (or LOOCV) out-of-sample error evaluation.
 * 4. Produces a continuous 2-satellite MODIS-equivalent series + 80% prediction intervals
 *    and non-parametric log-MAD robust Z-scores without ever mutating native raw counts.
 */
export function computeHarmonizedSeries(
  bins: CalendarBinRecord[],
  metric: CalendarMetricId = 'detection_count'
): HarmonizationSummary {
  const perBinPlatformCounts = bins.map((bin) =>
    getExpectedActivePlatforms(
      bin.time_bin_start_utc,
      bin.time_bin_end_utc,
      bin.quality.active_platforms,
      bin.platform_breakdown
    )
  );

  const perBinRaw = bins.map((bin, idx) => {
    const k = perBinPlatformCounts[idx];
    const modisRaw = extractBinSensorValue(bin, 'MODIS', metric);
    const viirsRaw = extractBinSensorValue(bin, 'VIIRS', metric);
    const rModis = modisRaw !== null && k.modis > 0 ? modisRaw / k.modis : null;
    const rViirs = viirsRaw !== null && k.viirs > 0 ? viirsRaw / k.viirs : null;
    return { kModis: k.modis, kViirs: k.viirs, modisRaw, viirsRaw, rModis, rViirs };
  });

  const overlapBinCount = perBinRaw.filter(
    (b) => b.modisRaw !== null && b.viirsRaw !== null
  ).length;

  const overlapSamples: OverlapSample[] = [];
  perBinRaw.forEach((b, idx) => {
    if (
      b.rModis !== null &&
      b.rViirs !== null &&
      b.modisRaw !== null &&
      b.viirsRaw !== null &&
      b.modisRaw > 0 &&
      b.viirsRaw > 0
    ) {
      overlapSamples.push({
        idx,
        rModis: b.rModis,
        rViirs: b.rViirs,
        yModis2Sat: 2 * b.rModis,
        xLog: Math.log(b.rViirs + 1),
        yLog: Math.log(b.rModis + 1),
      });
    }
  });

  const rawRatios = overlapSamples
    .map((s) => {
      const b = perBinRaw[s.idx];
      return b.modisRaw && b.viirsRaw && b.modisRaw > 0 ? b.viirsRaw / b.modisRaw : null;
    })
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const perPlatRatios = overlapSamples
    .map((s) => (s.rModis > 0 ? s.rViirs / s.rModis : null))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const modisRobustZs = computeRobustZMap(perBinRaw.map((b) => b.rModis));
  const viirsRobustZs = computeRobustZMap(perBinRaw.map((b) => b.rViirs));

  const calibrated = overlapSamples.length >= 2;
  const fullFit: FitResult | null = calibrated ? fitBridgeParameters(overlapSamples) : null;

  let validationScheme: HarmonizationDiagnostics['validation_scheme'] = 'INSUFFICIENT_OVERLAP';
  let holdoutSampleCount = 0;
  let holdoutMae: number | null = null;
  let holdoutRmse: number | null = null;

  if (overlapSamples.length >= 10) {
    validationScheme = 'CHRONOLOGICAL_70_30_HOLDOUT';
    const splitIdx = Math.max(6, Math.floor(overlapSamples.length * 0.7));
    const trainSamples = overlapSamples.slice(0, splitIdx);
    const testSamples = overlapSamples.slice(splitIdx);
    if (trainSamples.length >= 2 && testSamples.length >= 1) {
      const trainFit = fitBridgeParameters(trainSamples);
      let absErrSum = 0;
      let sqErrSum = 0;
      for (const test of testSamples) {
        const pred2Sat = 2 * predictPerPlatformModis(test.rViirs, trainFit);
        const err = pred2Sat - test.yModis2Sat;
        absErrSum += Math.abs(err);
        sqErrSum += err * err;
      }
      holdoutSampleCount = testSamples.length;
      holdoutMae = roundTo(absErrSum / testSamples.length, 2);
      holdoutRmse = roundTo(Math.sqrt(sqErrSum / testSamples.length), 2);
    }
  } else if (overlapSamples.length >= 4) {
    validationScheme = 'LEAVE_ONE_OUT_CV';
    let absErrSum = 0;
    let sqErrSum = 0;
    for (let i = 0; i < overlapSamples.length; i++) {
      const train = overlapSamples.filter((_, j) => j !== i);
      const held = overlapSamples[i];
      const looFit = fitBridgeParameters(train);
      const pred2Sat = 2 * predictPerPlatformModis(held.rViirs, looFit);
      const err = pred2Sat - held.yModis2Sat;
      absErrSum += Math.abs(err);
      sqErrSum += err * err;
    }
    holdoutSampleCount = overlapSamples.length;
    holdoutMae = roundTo(absErrSum / overlapSamples.length, 2);
    holdoutRmse = roundTo(Math.sqrt(sqErrSum / overlapSamples.length), 2);
  }

  let residualSigmaLog = 0;
  if (fullFit && overlapSamples.length >= 2) {
    const dof = Math.max(
      1,
      overlapSamples.length - (fullFit.mode === 'OLS_LOG_BRIDGE' ? 2 : 1)
    );
    let sqLogErr = 0;
    for (const s of overlapSamples) {
      const predRModis = predictPerPlatformModis(s.rViirs, fullFit);
      const logDiff = Math.log(s.rModis + 1) - Math.log(predRModis + 1);
      sqLogErr += logDiff * logDiff;
    }
    residualSigmaLog = roundTo(Math.sqrt(sqLogErr / dof), 4);
  }

  const Z_80 = 1.2816;
  const decimals = metric === 'frp_mw' ? 1 : 2;

  const points: HarmonizedBinPoint[] = bins.map((bin, idx) => {
    const b = perBinRaw[idx];
    const modisStd2Sat = b.rModis !== null ? 2 * b.rModis : null;
    const viirsCalib2Sat =
      fullFit && b.rViirs !== null ? 2 * predictPerPlatformModis(b.rViirs, fullFit) : null;

    let bridged: number | null = null;
    let lower80: number | null = null;
    let upper80: number | null = null;
    let bridgedSource: HarmonizedBinPoint['bridged_source'] = 'NO_DATA';

    if (modisStd2Sat !== null && viirsCalib2Sat !== null && (b.modisRaw ?? 0) > 0) {
      bridgedSource = 'OVERLAP_BLENDED';
      bridged = 0.6 * modisStd2Sat + 0.4 * viirsCalib2Sat;
      const halfSpreadLog = 0.4 * Z_80 * residualSigmaLog;
      const centerLog = Math.log(Math.max(0, bridged / 2) + 1);
      lower80 = 2 * Math.max(0, Math.exp(Math.max(0, centerLog - halfSpreadLog)) - 1);
      upper80 = 2 * Math.max(0, Math.exp(centerLog + halfSpreadLog) - 1);
    } else if (viirsCalib2Sat !== null && ((b.viirsRaw ?? 0) > 0 || modisStd2Sat === null)) {
      bridgedSource = 'VIIRS_CALIBRATED';
      bridged = viirsCalib2Sat;
      const predRModis = viirsCalib2Sat / 2;
      const predLog = Math.log(Math.max(0, predRModis) + 1);
      lower80 =
        viirsCalib2Sat === 0
          ? 0
          : 2 * Math.max(0, Math.exp(Math.max(0, predLog - Z_80 * residualSigmaLog)) - 1);
      upper80 =
        viirsCalib2Sat === 0
          ? 0
          : 2 * Math.max(0, Math.exp(predLog + Z_80 * residualSigmaLog) - 1);
    } else if (modisStd2Sat !== null) {
      bridgedSource = 'MODIS_OBSERVED';
      bridged = modisStd2Sat;
      lower80 = modisStd2Sat;
      upper80 = modisStd2Sat;
    }

    const mz = modisRobustZs[idx];
    const vz = viirsRobustZs[idx];
    let compositeZ: number | null = null;
    if (mz !== null && vz !== null) {
      compositeZ = roundTo((mz + vz) / 2, 2);
    } else if (mz !== null) {
      compositeZ = mz;
    } else if (vz !== null) {
      compositeZ = vz;
    }

    return {
      bin_key: bin.bin_key,
      label: bin.label,
      time_bin_start_utc: bin.time_bin_start_utc,
      time_bin_end_utc: bin.time_bin_end_utc,
      modis_active_platforms: b.kModis,
      viirs_active_platforms: b.kViirs,
      modis_raw: b.modisRaw !== null ? roundTo(b.modisRaw, decimals) : null,
      viirs_raw: b.viirsRaw !== null ? roundTo(b.viirsRaw, decimals) : null,
      modis_per_platform: b.rModis !== null ? roundTo(b.rModis, 2) : null,
      viirs_per_platform: b.rViirs !== null ? roundTo(b.rViirs, 2) : null,
      viirs_calibrated_modis_equiv:
        viirsCalib2Sat !== null ? roundTo(viirsCalib2Sat, decimals) : null,
      bridged_modis_equiv: bridged !== null ? roundTo(bridged, decimals) : null,
      bridged_lower_80: lower80 !== null ? roundTo(lower80, decimals) : null,
      bridged_upper_80: upper80 !== null ? roundTo(upper80, decimals) : null,
      bridged_source: bridgedSource,
      modis_robust_z: mz,
      viirs_robust_z: vz,
      composite_robust_z: compositeZ,
    };
  });

  const unitLabel = metric === 'frp_mw' ? 'FRP (MW)' : 'detections';
  const modeUsed: HarmonizationDiagnostics['calibration_mode'] = fullFit
    ? fullFit.mode
    : 'PLATFORM_NORMALIZED_ONLY';

  const formulaSummary =
    modeUsed === 'OLS_LOG_BRIDGE' && fullFit
      ? `Normalized R_s(t) = Y_s(t) / K_s(t); log bridge ln(R_MODIS+1) = ${roundTo(
          fullFit.alpha,
          3
        )} + ${roundTo(
          fullFit.beta,
          3
        )}·ln(R_VIIRS+1), scaled to 2-satellite MODIS-equivalent ${unitLabel}.`
      : modeUsed === 'ROBUST_MEDIAN_RATIO' && fullFit
      ? `Normalized R_s(t) = Y_s(t) / K_s(t); robust median ratio bridge R_MODIS = R_VIIRS / ${roundTo(
          fullFit.kappa,
          3
        )}, scaled to 2-satellite MODIS-equivalent ${unitLabel}.`
      : `Per-satellite normalization R_s(t) = Y_s(t) / K_s(t) computed; cross-sensor regression uncalibrated because fewer than 2 active MODIS+VIIRS overlap bins are present.`;

  return {
    diagnostics: {
      method_id: 'M3_EMPIRICAL_PLATFORM_BRIDGE',
      method_version: '1.0.0',
      metric_id: metric,
      calibrated,
      calibration_mode: modeUsed,
      overlap_bin_count: overlapBinCount,
      active_overlap_bin_count: overlapSamples.length,
      alpha_intercept: fullFit ? roundTo(fullFit.alpha, 4) : 0,
      beta_slope: fullFit ? roundTo(fullFit.beta, 4) : 1,
      per_platform_median_ratio:
        perPlatRatios.length > 0 ? roundTo(median(perPlatRatios), 3) : null,
      per_platform_iqr_ratio:
        perPlatRatios.length > 0
          ? [
              roundTo(quantileSorted(perPlatRatios, 0.25), 3),
              roundTo(quantileSorted(perPlatRatios, 0.75), 3),
            ]
          : null,
      raw_median_ratio: rawRatios.length > 0 ? roundTo(median(rawRatios), 3) : null,
      log_pearson_r: fullFit?.rLog !== null && fullFit?.rLog !== undefined ? roundTo(fullFit.rLog, 4) : null,
      log_r_squared:
        fullFit?.rSquaredLog !== null && fullFit?.rSquaredLog !== undefined
          ? roundTo(fullFit.rSquaredLog, 4)
          : null,
      validation_scheme: validationScheme,
      holdout_sample_count: holdoutSampleCount,
      holdout_mae: holdoutMae,
      holdout_rmse: holdoutRmse,
      residual_sigma_log: residualSigmaLog,
      formula_summary: formulaSummary,
      scientific_caveat:
        'Statistical MODIS-equivalent transfer bridge calibrated locally on this AOI/window. Native MODIS C6.1 (1 km) and VIIRS C2 (375 m) detections, native confidence schemes, and missing cloud/overpass clear-sky baselines are never mutated or fabricated.',
    },
    points,
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function getCoLocationRadiusKm(obs: CanonicalObservation): number {
  const maxDim = Math.max(obs.scan_native ?? 0, obs.track_native ?? 0, 1.0);
  return Math.max(1.5, Math.min(2.5, 0.75 * maxDim));
}

/**
 * Spatiotemporally clusters MODIS (~1 km) and VIIRS (~375 m) pixel detections into
 * thermal anomaly events using a spatial grid index + Union-Find within a bounded
 * footprint radius (1.5–2.5 km) and overpass window (±6 hours by default).
 */
export function clusterCrossSensorObservations(
  observations: CanonicalObservation[],
  temporalWindowHours = 6,
  maxReturnedClusters = 200
): CoLocationSummary {
  if (observations.length === 0) {
    return {
      evaluation_scope: 'FULL_BIN_POINTS',
      spatial_radius_km_rule: 'max(1.5 km, min(2.5 km, 0.75 * max(scan, track, 1.0)))',
      temporal_window_hours: temporalWindowHours,
      total_observations: 0,
      modis_total_detections: 0,
      viirs_total_detections: 0,
      total_clusters: 0,
      co_detected_clusters: 0,
      viirs_only_clusters: 0,
      modis_only_clusters: 0,
      co_detected_modis_obs: 0,
      co_detected_viirs_obs: 0,
      empirical_co_detected_viirs_per_modis: null,
      co_detected_modis_frp_mw: 0,
      co_detected_viirs_frp_mw: 0,
      clusters: [],
    };
  }
  let modisTotalDetections = 0;
  let viirsTotalDetections = 0;
  for (const obs of observations) {
    if (obs.sensor === 'MODIS') modisTotalDetections += 1;
    else viirsTotalDetections += 1;
  }

  const n = observations.length;
  const parent = new Int32Array(n);
  const rank = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };

  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb;
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra;
    } else {
      parent[rb] = ra;
      rank[ra] += 1;
    }
  };

  const timeMs = new Float64Array(n);
  const radiiKm = new Float64Array(n);
  const cellSizeDeg = 0.05; // ~5.5 km at equator, guarantees neighboring 2.5 km pairs are in 3x3 cells
  const grid = new Map<string, number[]>();

  for (let i = 0; i < n; i++) {
    const obs = observations[i];
    const parsed = Date.parse(obs.acq_datetime_utc);
    timeMs[i] = Number.isFinite(parsed) ? parsed : 0;
    radiiKm[i] = getCoLocationRadiusKm(obs);

    const gLat = Math.floor(obs.latitude / cellSizeDeg);
    const gLon = Math.floor(obs.longitude / cellSizeDeg);
    const key = `${gLat},${gLon}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }

  const maxDeltaMs = temporalWindowHours * 3600 * 1000;

  for (let i = 0; i < n; i++) {
    const obsI = observations[i];
    const gLat = Math.floor(obsI.latitude / cellSizeDeg);
    const gLon = Math.floor(obsI.longitude / cellSizeDeg);

    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        const neighbors = grid.get(`${gLat + dLat},${gLon + dLon}`);
        if (!neighbors) continue;
        for (const j of neighbors) {
          if (j <= i) continue;
          if (Math.abs(timeMs[i] - timeMs[j]) > maxDeltaMs) continue;
          const thresholdKm = Math.max(radiiKm[i], radiiKm[j]);
          const distKm = haversineKm(
            obsI.latitude,
            obsI.longitude,
            observations[j].latitude,
            observations[j].longitude
          );
          if (distKm <= thresholdKm) {
            union(i, j);
          }
        }
      }
    }
  }

  const groups = new Map<number, CanonicalObservation[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root);
    if (arr) arr.push(observations[i]);
    else groups.set(root, [observations[i]]);
  }

  const clusters: CoLocationCluster[] = [];
  let coDetectedClusters = 0;
  let viirsOnlyClusters = 0;
  let modisOnlyClusters = 0;
  let coDetectedModisObs = 0;
  let coDetectedViirsObs = 0;
  let coDetectedModisFrp = 0;
  let coDetectedViirsFrp = 0;

  let clusterSeq = 1;
  for (const group of groups.values()) {
    let modisCount = 0;
    let viirsCount = 0;
    let modisFrp = 0;
    let viirsFrp = 0;
    let sumLat = 0;
    let sumLon = 0;
    let minMs = Infinity;
    let maxMs = -Infinity;
    let earliestUtc = group[0].acq_datetime_utc;
    let latestUtc = group[0].acq_datetime_utc;
    const platSet = new Set<PlatformId>();
    const obsIds: string[] = [];

    for (const obs of group) {
      sumLat += obs.latitude;
      sumLon += obs.longitude;
      platSet.add(obs.platform);
      obsIds.push(obs.observation_id);

      const t = Date.parse(obs.acq_datetime_utc);
      if (Number.isFinite(t)) {
        if (t < minMs) {
          minMs = t;
          earliestUtc = obs.acq_datetime_utc;
        }
        if (t > maxMs) {
          maxMs = t;
          latestUtc = obs.acq_datetime_utc;
        }
      }

      if (obs.sensor === 'MODIS') {
        modisCount += 1;
        if (typeof obs.frp_mw === 'number' && Number.isFinite(obs.frp_mw)) {
          modisFrp += obs.frp_mw;
        }
      } else {
        viirsCount += 1;
        if (typeof obs.frp_mw === 'number' && Number.isFinite(obs.frp_mw)) {
          viirsFrp += obs.frp_mw;
        }
      }
    }

    let classification: CoLocationClassification;
    if (modisCount > 0 && viirsCount > 0) {
      classification = 'CO_DETECTED_BOTH';
      coDetectedClusters += 1;
      coDetectedModisObs += modisCount;
      coDetectedViirsObs += viirsCount;
      coDetectedModisFrp += modisFrp;
      coDetectedViirsFrp += viirsFrp;
    } else if (viirsCount > 0) {
      classification = 'VIIRS_ONLY_SMALL_OR_GAP';
      viirsOnlyClusters += 1;
    } else {
      classification = 'MODIS_ONLY_OVERPASS';
      modisOnlyClusters += 1;
    }

    clusters.push({
      cluster_id: `CL-${String(clusterSeq++).padStart(4, '0')}`,
      classification,
      centroid_lat: roundTo(sumLat / group.length, 4),
      centroid_lon: roundTo(sumLon / group.length, 4),
      earliest_utc: earliestUtc,
      latest_utc: latestUtc,
      time_span_minutes:
        Number.isFinite(minMs) && Number.isFinite(maxMs)
          ? Math.round((maxMs - minMs) / 60000)
          : 0,
      modis_count: modisCount,
      viirs_count: viirsCount,
      viirs_to_modis_ratio: modisCount > 0 && viirsCount > 0 ? roundTo(viirsCount / modisCount, 2) : null,
      modis_frp_sum_mw: roundTo(modisFrp, 2),
      viirs_frp_sum_mw: roundTo(viirsFrp, 2),
      platforms: Array.from(platSet),
      observation_ids: obsIds,
    });
  }

  clusters.sort(
    (a, b) =>
      b.modis_count + b.viirs_count - (a.modis_count + a.viirs_count) ||
      a.earliest_utc.localeCompare(b.earliest_utc)
  );

  return {
    evaluation_scope: 'FULL_BIN_POINTS',
    spatial_radius_km_rule: 'max(1.5 km, min(2.5 km, 0.75 * max(scan, track, 1.0)))',
    temporal_window_hours: temporalWindowHours,
    total_observations: observations.length,
    modis_total_detections: modisTotalDetections,
    viirs_total_detections: viirsTotalDetections,
    total_clusters: clusters.length,
    co_detected_clusters: coDetectedClusters,
    viirs_only_clusters: viirsOnlyClusters,
    modis_only_clusters: modisOnlyClusters,
    co_detected_modis_obs: coDetectedModisObs,
    co_detected_viirs_obs: coDetectedViirsObs,
    empirical_co_detected_viirs_per_modis:
      coDetectedModisObs > 0 ? roundTo(coDetectedViirsObs / coDetectedModisObs, 2) : null,
    co_detected_modis_frp_mw: roundTo(coDetectedModisFrp, 2),
    co_detected_viirs_frp_mw: roundTo(coDetectedViirsFrp, 2),
    clusters: clusters.slice(0, maxReturnedClusters),
  };
}

export interface SpatialBucketInput {
  acq_date: string;
  lat_bin?: number;
  lng_bin?: number;
  sensor: SensorId;
  platform: PlatformId;
  detection_count: number;
  frp_sum_mw: number;
}

/**
 * Evaluates full-bin MODIS/VIIRS spatial concordance across 100% of 0.25-deg daily grid buckets
 * (used for pre-Oct-2026 Parquet daily aggregates and Seeded Global Presets without row sampling bias).
 */
export function computeBucketSpatialConcordance(
  buckets: SpatialBucketInput[],
  maxReturnedClusters = 200
): CoLocationSummary | null {
  const cellGroups = new Map<
    string,
    {
      acqDate: string;
      latBin: number;
      lngBin: number;
      modisCount: number;
      viirsCount: number;
      modisFrpSum: number;
      viirsFrpSum: number;
      platforms: Set<PlatformId>;
    }
  >();

  let totalObs = 0;
  let modisTotal = 0;
  let viirsTotal = 0;

  for (const b of buckets) {
    if (
      typeof b.lat_bin !== 'number' ||
      !Number.isFinite(b.lat_bin) ||
      typeof b.lng_bin !== 'number' ||
      !Number.isFinite(b.lng_bin) ||
      b.detection_count <= 0
    ) {
      continue;
    }

    totalObs += b.detection_count;
    const key = `${b.acq_date}|${b.lat_bin}|${b.lng_bin}`;
    let group = cellGroups.get(key);
    if (!group) {
      group = {
        acqDate: b.acq_date,
        latBin: b.lat_bin,
        lngBin: b.lng_bin,
        modisCount: 0,
        viirsCount: 0,
        modisFrpSum: 0,
        viirsFrpSum: 0,
        platforms: new Set<PlatformId>(),
      };
      cellGroups.set(key, group);
    }

    group.platforms.add(b.platform);
    if (b.sensor === 'MODIS') {
      modisTotal += b.detection_count;
      group.modisCount += b.detection_count;
      group.modisFrpSum += b.frp_sum_mw;
    } else {
      viirsTotal += b.detection_count;
      group.viirsCount += b.detection_count;
      group.viirsFrpSum += b.frp_sum_mw;
    }
  }

  if (cellGroups.size === 0 || totalObs === 0) {
    return null;
  }

  const clusters: CoLocationCluster[] = [];
  let coDetectedClusters = 0;
  let viirsOnlyClusters = 0;
  let modisOnlyClusters = 0;
  let coDetectedModisObs = 0;
  let coDetectedViirsObs = 0;
  let coDetectedModisFrp = 0;
  let coDetectedViirsFrp = 0;
  let seq = 1;

  for (const cell of cellGroups.values()) {
    let classification: CoLocationClassification;
    if (cell.modisCount > 0 && cell.viirsCount > 0) {
      classification = 'CO_DETECTED_BOTH';
      coDetectedClusters += 1;
      coDetectedModisObs += cell.modisCount;
      coDetectedViirsObs += cell.viirsCount;
      coDetectedModisFrp += cell.modisFrpSum;
      coDetectedViirsFrp += cell.viirsFrpSum;
    } else if (cell.viirsCount > 0) {
      classification = 'VIIRS_ONLY_SMALL_OR_GAP';
      viirsOnlyClusters += 1;
    } else {
      classification = 'MODIS_ONLY_OVERPASS';
      modisOnlyClusters += 1;
    }

    clusters.push({
      cluster_id: `GRID-${seq++}`,
      classification,
      centroid_lat: roundTo(cell.latBin + 0.125, 4),
      centroid_lon: roundTo(cell.lngBin + 0.125, 4),
      earliest_utc: `${cell.acqDate}T00:00:00Z`,
      latest_utc: `${cell.acqDate}T23:59:59Z`,
      time_span_minutes: 1440,
      modis_count: cell.modisCount,
      viirs_count: cell.viirsCount,
      viirs_to_modis_ratio:
        cell.modisCount > 0 && cell.viirsCount > 0
          ? roundTo(cell.viirsCount / cell.modisCount, 2)
          : null,
      modis_frp_sum_mw: roundTo(cell.modisFrpSum, 2),
      viirs_frp_sum_mw: roundTo(cell.viirsFrpSum, 2),
      platforms: Array.from(cell.platforms).sort(),
      observation_ids: [],
    });
  }

  clusters.sort(
    (a, b) =>
      b.modis_count + b.viirs_count - (a.modis_count + a.viirs_count) ||
      a.earliest_utc.localeCompare(b.earliest_utc)
  );

  return {
    evaluation_scope: 'FULL_BIN_GRID_BUCKETS',
    spatial_radius_km_rule: '0.25° × 0.25° grid cell same-UTC-day concordance',
    temporal_window_hours: 24,
    total_observations: totalObs,
    modis_total_detections: modisTotal,
    viirs_total_detections: viirsTotal,
    total_clusters: clusters.length,
    co_detected_clusters: coDetectedClusters,
    viirs_only_clusters: viirsOnlyClusters,
    modis_only_clusters: modisOnlyClusters,
    co_detected_modis_obs: coDetectedModisObs,
    co_detected_viirs_obs: coDetectedViirsObs,
    empirical_co_detected_viirs_per_modis:
      coDetectedModisObs > 0 ? roundTo(coDetectedViirsObs / coDetectedModisObs, 2) : null,
    co_detected_modis_frp_mw: roundTo(coDetectedModisFrp, 2),
    co_detected_viirs_frp_mw: roundTo(coDetectedViirsFrp, 2),
    clusters: clusters.slice(0, maxReturnedClusters),
  };
}
