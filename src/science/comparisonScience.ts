import {
  AoiComparisonResponse,
  AoiComparisonSummary,
  AoiDefinition,
  BinCoverageState,
  BoundingBox,
  CalendarAnalyticsResponse,
  CalendarBinRecord,
  CanonicalObservation,
  DataSourceBacking,
  FrpSummaryStats,
  Granularity,
  MapGridCell,
  PeriodBinValue,
  PeriodComparisonResponse,
  PeriodComparisonRow,
  PlatformId,
  PlatformRegistryEntry,
  ProcessingStatus,
  SensorFilter,
  SensorId,
  YoyYearSummary,
} from '../types/firescope';
import {
  computeSeasonalBaseline,
  computeThresholds,
  generateTimeBins,
  isPlatformAvailableInWindow,
  isPointInAoi,
} from './fireScience';

/**
 * Unified daily bucket interface shared by DuckDB Parquet aggregates and live/fixture records.
 */
export interface DailyAggregateBucket {
  acq_date: string;
  lat_bin?: number;
  lng_bin?: number;
  sensor: SensorId;
  platform: PlatformId;
  processing_status: ProcessingStatus;
  daynight_native: 'D' | 'N' | 'U';
  confidence_bucket: string;
  detection_count: number;
  frp_sum_mw: number;
  frp_valid_count: number;
  frp_null_count: number;
  frp_max_mw?: number | null;
}

/**
 * Converts CanonicalObservations into DailyAggregateBuckets (after NRT->STANDARD deduplication).
 */
export function observationsToDailyBuckets(
  records: CanonicalObservation[]
): DailyAggregateBucket[] {
  const byKey = new Map<string, DailyAggregateBucket>();

  for (const r of records) {
    const latBin = Math.floor(r.latitude * 4) / 4;
    const lngBin = Math.floor(r.longitude * 4) / 4;
    const dn = r.daynight_native === 'D' || r.daynight_native === 'N' ? r.daynight_native : 'U';
    let confBucket = 'nominal';
    if (r.sensor === 'MODIS') {
      const c = typeof r.confidence_native === 'number' ? r.confidence_native : 50;
      confBucket = c < 30 ? 'low_0_29' : c < 80 ? 'nominal_30_79' : 'high_80_100';
    } else {
      const s = String(r.confidence_native ?? 'nominal').toLowerCase();
      confBucket = s === 'low' || s === 'l' ? 'low' : s === 'high' || s === 'h' ? 'high' : 'nominal';
    }

    const key = `${r.acq_date}|${latBin}|${lngBin}|${r.sensor}|${r.platform}|${r.processing_status}|${dn}|${confBucket}`;
    const existing = byKey.get(key);
    const hasFrp = typeof r.frp_mw === 'number' && Number.isFinite(r.frp_mw) && r.frp_mw >= 0;

    if (!existing) {
      byKey.set(key, {
        acq_date: r.acq_date,
        lat_bin: latBin,
        lng_bin: lngBin,
        sensor: r.sensor,
        platform: r.platform,
        processing_status: r.processing_status,
        daynight_native: dn,
        confidence_bucket: confBucket,
        detection_count: 1,
        frp_sum_mw: hasFrp ? r.frp_mw! : 0,
        frp_valid_count: hasFrp ? 1 : 0,
        frp_null_count: hasFrp ? 0 : 1,
        frp_max_mw: hasFrp ? r.frp_mw! : null,
      });
    } else {
      existing.detection_count += 1;
      if (hasFrp) {
        existing.frp_sum_mw += r.frp_mw!;
        existing.frp_valid_count += 1;
        existing.frp_max_mw =
          existing.frp_max_mw === null || existing.frp_max_mw === undefined
            ? r.frp_mw!
            : Math.max(existing.frp_max_mw, r.frp_mw!);
      } else {
        existing.frp_null_count += 1;
      }
    }
  }

  return Array.from(byKey.values());
}

function summarizeBucketFrp(buckets: DailyAggregateBucket[], sensor: SensorId): FrpSummaryStats {
  const sBuckets = buckets.filter((b) => b.sensor === sensor);
  let validCount = 0;
  let nullCount = 0;
  let sumMw = 0;
  let maxMw: number | null = null;
  const statuses = new Set<ProcessingStatus>();

  for (const b of sBuckets) {
    validCount += b.frp_valid_count;
    nullCount += b.frp_null_count;
    sumMw += b.frp_sum_mw;
    if (b.frp_max_mw !== null && b.frp_max_mw !== undefined) {
      maxMw = maxMw === null ? b.frp_max_mw : Math.max(maxMw, b.frp_max_mw);
    }
    statuses.add(b.processing_status);
  }

  if (validCount === 0) {
    return {
      sensor,
      unit: 'MW',
      sum_mw: null,
      mean_mw: null,
      median_mw: null,
      p90_mw: null,
      max_mw: null,
      valid_count: 0,
      null_count: nullCount,
      processing_status_note: 'No valid FRP records in selected bin.',
    };
  }

  const meanMw = sumMw / validCount;
  const statusStr = Array.from(statuses).join('/') || 'N/A';

  return {
    sensor,
    unit: 'MW',
    sum_mw: Number(sumMw.toFixed(2)),
    mean_mw: Number(meanMw.toFixed(2)),
    median_mw: null,
    p90_mw: null,
    max_mw: maxMw !== null ? Number(maxMw.toFixed(2)) : null,
    valid_count: validCount,
    null_count: nullCount,
    processing_status_note: `Computed across ${validCount.toLocaleString()} valid ${sensor} record(s) (${statusStr}). Median/P90 unavailable from pre-aggregated daily Parquet buckets; Sum/Mean/Max exact.`,
  };
}

/**
 * Aggregates pre-filtered DailyAggregateBuckets (from DuckDB Parquet + Live FIRMS)
 * into a complete CalendarAnalyticsResponse including multi-year seasonal baselines (FR-09).
 */
export function aggregateCalendarFromBuckets(params: {
  buckets: DailyAggregateBucket[];
  historicalMonthTotals?: Array<{
    year: number;
    month: string; // '01'..'12'
    modis_count: number;
    viirs_count: number;
    modis_frp_sum: number;
    viirs_frp_sum: number;
  }>;
  aoi: AoiDefinition;
  startDate: string;
  endDate: string;
  granularity: Granularity;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  metric: 'detection_count' | 'frp_mw';
  platformRegistry: PlatformRegistryEntry[];
  archiveCoverageStart: string;
  archiveCoverageEnd: string;
  dataMode: CalendarAnalyticsResponse['data_mode'];
  demoNotice: string;
  sources: string[];
  retrievedAtUtc: string;
  latestAcquisitionUtc: string;
  archiveChecksums: string[];
  supersededNrtTotal?: number;
  duplicatesRemovedTotal?: number;
}): CalendarAnalyticsResponse {
  const {
    buckets,
    historicalMonthTotals = [],
    aoi,
    startDate,
    endDate,
    granularity,
    sensor,
    platforms,
    processingStatus,
    dayNight,
    metric,
    platformRegistry,
    archiveCoverageStart,
    archiveCoverageEnd,
    dataMode,
    demoNotice,
    sources,
    retrievedAtUtc,
    latestAcquisitionUtc,
    archiveChecksums,
    supersededNrtTotal = 0,
    duplicatesRemovedTotal = 0,
  } = params;

  const bins = generateTimeBins(startDate, endDate, granularity);

  const selectedRegistry = platformRegistry.filter((p) => {
    if (sensor !== 'ALL' && p.sensor !== sensor) return false;
    if (!platforms.includes(p.platform_id)) return false;
    return true;
  });

  const series: CalendarBinRecord[] = bins.map((bin) => {
    const binStartDateStr = bin.startUtc.slice(0, 10);
    const binEndDateStr = new Date(bin.endMs - 1000).toISOString().slice(0, 10);

    const activePlatforms: PlatformId[] = [];
    const unavailablePlatforms: PlatformId[] = [];

    for (const p of selectedRegistry) {
      if (
        binStartDateStr >= archiveCoverageStart &&
        binStartDateStr <= archiveCoverageEnd &&
        isPlatformAvailableInWindow(p, binStartDateStr, binEndDateStr)
      ) {
        activePlatforms.push(p.platform_id);
      } else {
        unavailablePlatforms.push(p.platform_id);
      }
    }

    const binBuckets = buckets.filter(
      (b) => b.acq_date >= binStartDateStr && b.acq_date <= binEndDateStr
    );

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

    let modisSumCount = 0;
    let viirsSumCount = 0;
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

    for (const b of binBuckets) {
      if (b.sensor === 'MODIS') modisSumCount += b.detection_count;
      else viirsSumCount += b.detection_count;

      platformBreakdown[b.platform] = (platformBreakdown[b.platform] ?? 0) + b.detection_count;
      processingBreakdown[b.processing_status] =
        (processingBreakdown[b.processing_status] ?? 0) + b.detection_count;

      if (b.sensor === 'MODIS') {
        if (b.confidence_bucket === 'low_0_29') modisConfBins.low_0_29 += b.detection_count;
        else if (b.confidence_bucket === 'high_80_100')
          modisConfBins.high_80_100 += b.detection_count;
        else modisConfBins.nominal_30_79 += b.detection_count;
      } else {
        if (b.confidence_bucket === 'low') viirsConfBins.low += b.detection_count;
        else if (b.confidence_bucket === 'high') viirsConfBins.high += b.detection_count;
        else viirsConfBins.nominal += b.detection_count;
      }
    }

    const modisCount = modisAvailable ? modisSumCount : null;
    const viirsCount = viirsAvailable ? viirsSumCount : null;

    let coverageState: BinCoverageState = 'OBSERVED_ACTIVE';
    let coverageNote = 'MODIS C6.1 and VIIRS C2 records available for this window.';

    if (binStartDateStr < archiveCoverageStart || binStartDateStr > archiveCoverageEnd) {
      coverageState = 'NO_SOURCE_DATA';
      coverageNote = `Selected period is outside loaded archive coverage (${archiveCoverageStart} to ${archiveCoverageEnd}).`;
    } else if (activePlatforms.length === 0) {
      coverageState = 'NO_SOURCE_DATA';
      coverageNote = `No active platform data available for ${unavailablePlatforms.join(', ')} in this window.`;
    } else if (unavailablePlatforms.length > 0) {
      const totalDet = (modisCount ?? 0) + (viirsCount ?? 0);
      coverageState = totalDet > 0 ? 'PARTIAL_COVERAGE' : 'NO_DETECTIONS_IN_AVAILABLE_RECORDS';
      coverageNote = `Partial platform coverage: ${unavailablePlatforms.join(', ')} unavailable in this window. Active: ${activePlatforms.join(', ')}.`;
    } else if ((modisCount ?? 0) + (viirsCount ?? 0) === 0) {
      coverageState = 'NO_DETECTIONS_IN_AVAILABLE_RECORDS';
      coverageNote =
        'No detections in available records. Zero satellite detections do not prove absence of fire (clouds, overpass timing, or canopy may obscure activity).';
    }

    const modisFrp = summarizeBucketFrp(binBuckets, 'MODIS');
    const viirsFrp = summarizeBucketFrp(binBuckets, 'VIIRS');

    const pooledCount =
      modisCount === null && viirsCount === null
        ? null
        : (modisCount ?? 0) + (viirsCount ?? 0);

    // Real seasonal baseline comparison (FR-09):
    // Only compare full historical same-month totals when granularity === 'month' and multi-year history is loaded.
    const binYear = Number(binStartDateStr.slice(0, 4));
    const binMonth = binStartDateStr.slice(5, 7);
    const binDaysInMonth = new Date(Date.UTC(binYear, Number(binMonth), 0)).getUTCDate();
    const monthNaturalStartStr = `${binYear}-${binMonth}-01`;
    const monthNaturalEndStr = `${binYear}-${binMonth}-${String(binDaysInMonth).padStart(2, '0')}`;
    const isPartialMonthBin =
      granularity === 'month' &&
      (binStartDateStr > monthNaturalStartStr ||
        binEndDateStr < monthNaturalEndStr ||
        (archiveCoverageEnd.slice(0, 7) === `${binYear}-${binMonth}` &&
          archiveCoverageEnd < monthNaturalEndStr));

    const hasFullMonthCoverageForSensor = (sensorKey: SensorId, yr: number, mo: string) => {
      const mStart = `${yr}-${mo}-01`;
      const dCount = new Date(Date.UTC(yr, Number(mo), 0)).getUTCDate();
      const mEnd = `${yr}-${mo}-${String(dCount).padStart(2, '0')}`;
      return selectedRegistry.some(
        (p) =>
          p.sensor === sensorKey &&
          p.first_observation_date <= mStart &&
          p.last_observation_date >= mEnd
      );
    };

    const useMonthlyHistory =
      granularity === 'month' && historicalMonthTotals.length > 0;

    const modisPrior =
      useMonthlyHistory && modisAvailable
        ? historicalMonthTotals.filter(
            (h) =>
              h.month === binMonth &&
              h.year < binYear &&
              hasFullMonthCoverageForSensor('MODIS', h.year, h.month)
          )
        : [];
    const viirsPrior =
      useMonthlyHistory && viirsAvailable
        ? historicalMonthTotals.filter(
            (h) =>
              h.month === binMonth &&
              h.year < binYear &&
              hasFullMonthCoverageForSensor('VIIRS', h.year, h.month)
          )
        : [];

    const modisBaselineYears = modisPrior.map((h) => h.year);
    const modisHistoricalVals = modisPrior.map((h) =>
      metric === 'frp_mw' ? h.modis_frp_sum : h.modis_count
    );
    const viirsBaselineYears = viirsPrior.map((h) => h.year);
    const viirsHistoricalVals = viirsPrior.map((h) =>
      metric === 'frp_mw' ? h.viirs_frp_sum : h.viirs_count
    );

    const observedModis =
      metric === 'frp_mw' ? modisFrp.sum_mw ?? 0 : modisCount ?? 0;
    const observedViirs =
      metric === 'frp_mw' ? viirsFrp.sum_mw ?? 0 : viirsCount ?? 0;

    const modisBaseline = computeSeasonalBaseline(
      observedModis,
      modisHistoricalVals,
      modisBaselineYears,
      'MODIS'
    );
    const viirsBaseline = computeSeasonalBaseline(
      observedViirs,
      viirsHistoricalVals,
      viirsBaselineYears,
      'VIIRS'
    );

    if (isPartialMonthBin && modisBaseline.status_label !== 'Baseline unavailable (insufficient history)') {
      modisBaseline.caveat_note = `Incomplete UTC period (${binStartDateStr} to ${
        archiveCoverageEnd < binEndDateStr ? archiveCoverageEnd : binEndDateStr
      }): observed partial month compared against full prior months. ${modisBaseline.caveat_note}`;
    }
    if (isPartialMonthBin && viirsBaseline.status_label !== 'Baseline unavailable (insufficient history)') {
      viirsBaseline.caveat_note = `Incomplete UTC period (${binStartDateStr} to ${
        archiveCoverageEnd < binEndDateStr ? archiveCoverageEnd : binEndDateStr
      }): observed partial month compared against full prior months. ${viirsBaseline.caveat_note}`;
    }

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
        superseded_nrt_count: supersededNrtTotal,
        exact_duplicates_removed: duplicatesRemovedTotal,
      },
      seasonal_baseline: {
        MODIS: modisBaseline,
        VIIRS: viirsBaseline,
      },
    };
  });

  // For non-monthly windows or when multi-year monthly history is unavailable, use within-window active bins if >= 3 bins exist
  if (granularity !== 'month' || historicalMonthTotals.length === 0) {
    const modisSeriesVals = series
      .map((s) =>
        s.values.MODIS === null
          ? null
          : metric === 'frp_mw'
          ? s.frp_summary.MODIS.sum_mw ?? 0
          : s.values.MODIS
      )
      .filter((v): v is number => typeof v === 'number');
    const viirsSeriesVals = series
      .map((s) =>
        s.values.VIIRS === null
          ? null
          : metric === 'frp_mw'
          ? s.frp_summary.VIIRS.sum_mw ?? 0
          : s.values.VIIRS
      )
      .filter((v): v is number => typeof v === 'number');

    for (const b of series) {
      const mUnavailable = b.values.MODIS === null;
      const vUnavailable = b.values.VIIRS === null;
      const mRes = computeSeasonalBaseline(
        metric === 'frp_mw' ? b.frp_summary.MODIS.sum_mw ?? 0 : b.values.MODIS ?? 0,
        !mUnavailable && modisSeriesVals.length >= 3 ? modisSeriesVals : [],
        [],
        'MODIS'
      );
      const vRes = computeSeasonalBaseline(
        metric === 'frp_mw' ? b.frp_summary.VIIRS.sum_mw ?? 0 : b.values.VIIRS ?? 0,
        !vUnavailable && viirsSeriesVals.length >= 3 ? viirsSeriesVals : [],
        [],
        'VIIRS'
      );
      if (mRes.status_label !== 'Baseline unavailable (insufficient history)') {
        mRes.caveat_note =
          'Within-selected-window descriptive baseline across active bins (multi-year seasonal history is evaluated at monthly granularity).';
      }
      if (vRes.status_label !== 'Baseline unavailable (insufficient history)') {
        vRes.caveat_note =
          'Within-selected-window descriptive baseline across active bins (multi-year seasonal history is evaluated at monthly granularity).';
      }
      b.seasonal_baseline = { MODIS: mRes, VIIRS: vRes };
    }
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

  const inWindowBuckets = buckets.filter(
    (b) => b.acq_date >= startDate && b.acq_date <= endDate
  );

  return {
    data_mode: dataMode,
    demo_notice: demoNotice,
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
      MODIS_frp: summarizeBucketFrp(inWindowBuckets, 'MODIS'),
      VIIRS_frp: summarizeBucketFrp(inWindowBuckets, 'VIIRS'),
      superseded_nrt_total: supersededNrtTotal,
      duplicates_removed_total: duplicatesRemovedTotal,
    },
    thresholds: {
      MODIS: computeThresholds(
        series.map((s) =>
          metric === 'frp_mw' ? s.frp_summary.MODIS.sum_mw : s.values.MODIS
        )
      ),
      VIIRS: computeThresholds(
        series.map((s) =>
          metric === 'frp_mw' ? s.frp_summary.VIIRS.sum_mw : s.values.VIIRS
        )
      ),
    },
    series,
    provenance: {
      sources,
      collections: [
        'MODIS C6.1 (MCD14DL / MCD14ML)',
        'VIIRS C2 (VNP14IMGTDL / VJ114IMGTDL / VJ214IMGTDL)',
      ],
      retrieved_at_utc: retrievedAtUtc,
      latest_acquisition_utc: latestAcquisitionUtc,
      archive_checksums: archiveChecksums,
    },
  };
}

function toPeriodBinValue(bin: CalendarBinRecord): PeriodBinValue {
  const statuses: ProcessingStatus[] = [];
  for (const st of ['STANDARD', 'NRT', 'RT', 'URT'] as ProcessingStatus[]) {
    if ((bin.processing_breakdown[st] ?? 0) > 0) statuses.push(st);
  }
  return {
    bin_key: bin.bin_key,
    label: bin.label,
    modis_detections: bin.values.MODIS,
    viirs_detections: bin.values.VIIRS,
    modis_frp_sum_mw: bin.frp_summary.MODIS.sum_mw,
    modis_frp_mean_mw: bin.frp_summary.MODIS.mean_mw,
    viirs_frp_sum_mw: bin.frp_summary.VIIRS.sum_mw,
    viirs_frp_mean_mw: bin.frp_summary.VIIRS.mean_mw,
    coverage_state: bin.coverage_state,
    active_platforms: bin.quality.active_platforms,
    processing_statuses: statuses,
  };
}

/**
 * FR-08: Builds like-for-like historical period comparison keeping MODIS & VIIRS strictly separate
 * and surfacing platform-era availability differences (e.g. pre-NOAA-20 vs post-NOAA-21 or S-NPP Nov 2026 gap).
 */
export function buildPeriodComparisonResponse(params: {
  aoi: AoiDefinition;
  periodA: CalendarAnalyticsResponse;
  periodB: CalendarAnalyticsResponse;
  periodALabel: string;
  periodBLabel: string;
  yoySummary: YoyYearSummary[];
  dataBacking: DataSourceBacking;
  sources: string[];
  retrievedAtUtc: string;
  archiveChecksums: string[];
}): PeriodComparisonResponse {
  const {
    aoi,
    periodA,
    periodB,
    periodALabel,
    periodBLabel,
    yoySummary,
    dataBacking,
    sources,
    retrievedAtUtc,
    archiveChecksums,
  } = params;

  const maxLen = Math.max(periodA.series.length, periodB.series.length);
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const alignedSeries: PeriodComparisonRow[] = [];
  for (let i = 0; i < maxLen; i++) {
    const binA = periodA.series[i] ?? null;
    const binB = periodB.series[i] ?? null;

    let alignedLabel = `Bin ${i + 1}`;
    if (periodA.query.granularity === 'month' && (binA || binB)) {
      const key = (binA ?? binB)!.bin_key;
      const mIdx = Number(key.slice(5, 7)) - 1;
      alignedLabel = monthNames[mIdx] ?? key.slice(5, 7);
    } else if (binA && binB) {
      alignedLabel = `${binA.bin_key.slice(5)} vs ${binB.bin_key.slice(5)}`;
    } else if (binA || binB) {
      alignedLabel = (binA ?? binB)!.bin_key.slice(5);
    }

    const valA = binA ? toPeriodBinValue(binA) : null;
    const valB = binB ? toPeriodBinValue(binB) : null;

    const modisDelta =
      valA?.modis_detections !== null &&
      valA?.modis_detections !== undefined &&
      valB?.modis_detections !== null &&
      valB?.modis_detections !== undefined
        ? valB.modis_detections - valA.modis_detections
        : null;

    const viirsDelta =
      valA?.viirs_detections !== null &&
      valA?.viirs_detections !== undefined &&
      valB?.viirs_detections !== null &&
      valB?.viirs_detections !== undefined
        ? valB.viirs_detections - valA.viirs_detections
        : null;

    alignedSeries.push({
      aligned_index: i,
      aligned_label: alignedLabel,
      period_a: valA,
      period_b: valB,
      modis_delta: modisDelta,
      viirs_delta: viirsDelta,
    });
  }

  const pAModis = periodA.totals.MODIS_detections;
  const pBModis = periodB.totals.MODIS_detections;
  const pAViirs = periodA.totals.VIIRS_detections;
  const pBViirs = periodB.totals.VIIRS_detections;

  const warnings: string[] = [];
  const platformsA = new Set<PlatformId>();
  const platformsB = new Set<PlatformId>();
  periodA.series.forEach((b) => b.quality.active_platforms.forEach((p) => platformsA.add(p)));
  periodB.series.forEach((b) => b.quality.active_platforms.forEach((p) => platformsB.add(p)));

  const onlyInA = Array.from(platformsA).filter((p) => !platformsB.has(p));
  const onlyInB = Array.from(platformsB).filter((p) => !platformsA.has(p));
  if (onlyInA.length > 0 || onlyInB.length > 0) {
    warnings.push(
      `Sensor-era platform availability differs between periods (${periodALabel}: [${Array.from(platformsA).join(', ')}] vs ${periodBLabel}: [${Array.from(platformsB).join(', ')}]). Do not interpret extra satellite platforms as an automatic physical fire increase.`
    );
  }

  const hasNrtB = periodB.series.some((b) => (b.processing_breakdown.NRT ?? 0) > 0);
  const hasStdA = periodA.series.some((b) => (b.processing_breakdown.STANDARD ?? 0) > 0);
  if (hasStdA && hasNrtB) {
    warnings.push(
      `Processing lifecycle difference: ${periodALabel} uses retrospective STANDARD science-quality records, whereas ${periodBLabel} includes near real-time (NRT) records (~5-month science processing lag).`
    );
  }

  if (periodB.query.end_date > '2026-11-02' && platformsB.has('NOAA20')) {
    warnings.push(
      'VIIRS Suomi-NPP archive coverage ends 2026-11-02; post-Nov 2 2026 VIIRS totals come from NOAA-20 and NOAA-21 only.'
    );
  }

  return {
    aoi: {
      id: aoi.id,
      name: aoi.name,
      bbox: aoi.bbox,
      timezone: aoi.timezone,
      area_sq_km: aoi.areaSqKm,
    },
    period_a: {
      label: periodALabel,
      start_date: periodA.query.start_date,
      end_date: periodA.query.end_date,
    },
    period_b: {
      label: periodBLabel,
      start_date: periodB.query.start_date,
      end_date: periodB.query.end_date,
    },
    granularity: periodA.query.granularity,
    sensor: periodA.query.sensor,
    metric: periodA.query.metric,
    data_backing: dataBacking,
    totals: {
      period_a_modis: pAModis,
      period_b_modis: pBModis,
      modis_delta: pBModis - pAModis,
      modis_pct_change:
        pAModis > 0 ? Number((((pBModis - pAModis) / pAModis) * 100).toFixed(1)) : null,
      period_a_viirs: pAViirs,
      period_b_viirs: pBViirs,
      viirs_delta: pBViirs - pAViirs,
      viirs_pct_change:
        pAViirs > 0 ? Number((((pBViirs - pAViirs) / pAViirs) * 100).toFixed(1)) : null,
      period_a_modis_frp_mean_mw: periodA.totals.MODIS_frp.mean_mw,
      period_b_modis_frp_mean_mw: periodB.totals.MODIS_frp.mean_mw,
      period_a_viirs_frp_mean_mw: periodA.totals.VIIRS_frp.mean_mw,
      period_b_viirs_frp_mean_mw: periodB.totals.VIIRS_frp.mean_mw,
    },
    availability_warnings: warnings,
    aligned_series: alignedSeries,
    yoy_summary: yoySummary,
    method: {
      id: 'M2_COMPARATIVE',
      version: '1.0.0',
      description:
        'FR-08 Like-for-like temporal period comparison preserving separate MODIS (1 km) and VIIRS (375 m) series with platform-era & NRT/STANDARD provenance.',
      formula: 'Delta_{s}(A, t_B - t_A) = N_{s}(A, t_B) - N_{s}(A, t_A)',
      non_claims: [
        'Detection count differences across periods are affected by platform launches (e.g. NOAA-20 in 2018, NOAA-21 in 2023), cloud cover, and orbital drift.',
        'MODIS and VIIRS series remain strictly unpooled for trend deltas.',
      ],
    },
    provenance: {
      sources,
      retrieved_at_utc: retrievedAtUtc,
      archive_checksums: archiveChecksums,
    },
  };
}

/**
 * Side-by-side comparison of two AOIs over an identical UTC time window.
 */
export function buildAoiComparisonResponse(params: {
  aoiA: AoiDefinition;
  analyticsA: CalendarAnalyticsResponse;
  backingA: DataSourceBacking;
  aoiB: AoiDefinition;
  analyticsB: CalendarAnalyticsResponse;
  backingB: DataSourceBacking;
  retrievedAtUtc: string;
}): AoiComparisonResponse {
  const { aoiA, analyticsA, backingA, aoiB, analyticsB, backingB, retrievedAtUtc } = params;

  const summarize = (
    aoi: AoiDefinition,
    cal: CalendarAnalyticsResponse,
    backing: DataSourceBacking
  ): AoiComparisonSummary => {
    const areaK = Math.max(0.01, aoi.areaSqKm / 1000);
    let peakBin: CalendarBinRecord | null = null;
    for (const b of cal.series) {
      const score = (b.values.MODIS ?? 0) + (b.values.VIIRS ?? 0);
      const best = peakBin ? (peakBin.values.MODIS ?? 0) + (peakBin.values.VIIRS ?? 0) : -1;
      if (score > best) peakBin = b;
    }

    return {
      aoi: {
        id: aoi.id,
        name: aoi.name,
        regionLabel: aoi.regionLabel,
        bbox: aoi.bbox,
        timezone: aoi.timezone,
        area_sq_km: aoi.areaSqKm,
        biome: aoi.biome,
      },
      data_backing: backing,
      modis_detections: cal.totals.MODIS_detections,
      viirs_detections: cal.totals.VIIRS_detections,
      pooled_observation_count: cal.totals.pooled_observation_count,
      modis_per_1000_sq_km: Number((cal.totals.MODIS_detections / areaK).toFixed(3)),
      viirs_per_1000_sq_km: Number((cal.totals.VIIRS_detections / areaK).toFixed(3)),
      modis_frp: cal.totals.MODIS_frp,
      viirs_frp: cal.totals.VIIRS_frp,
      platform_totals: cal.totals.platform_totals,
      peak_bin_label: peakBin?.label ?? null,
      peak_bin_viirs: peakBin?.values.VIIRS ?? null,
      peak_bin_modis: peakBin?.values.MODIS ?? null,
    };
  };

  const warnings: string[] = [];
  if (backingA !== backingB) {
    warnings.push(
      `Data source backing differs between AOIs (${aoiA.name}: ${backingA} vs ${aoiB.name}: ${backingB}).`
    );
  }
  const areaRatio =
    Math.max(aoiA.areaSqKm, aoiB.areaSqKm) / Math.max(1, Math.min(aoiA.areaSqKm, aoiB.areaSqKm));
  if (areaRatio >= 3) {
    warnings.push(
      `AOI geographic extents differ substantially (${aoiA.areaSqKm.toLocaleString()} km² vs ${aoiB.areaSqKm.toLocaleString()} km²). Both raw totals and detections per 1,000 km² AOI extent are shown separately per sensor; per-km² density does not adjust for land cover or cloud cover.`
    );
  }

  const alignedSeries = analyticsA.series.map((bA, idx) => {
    const bB = analyticsB.series[idx];
    return {
      bin_key: bA.bin_key,
      label: bA.label,
      aoi_a_modis: bA.values.MODIS,
      aoi_a_viirs: bA.values.VIIRS,
      aoi_b_modis: bB?.values.MODIS ?? null,
      aoi_b_viirs: bB?.values.VIIRS ?? null,
    };
  });

  return {
    query: {
      start_date: analyticsA.query.start_date,
      end_date: analyticsA.query.end_date,
      granularity: analyticsA.query.granularity,
      sensor: analyticsA.query.sensor,
      metric: analyticsA.query.metric,
    },
    aoi_a: summarize(aoiA, analyticsA, backingA),
    aoi_b: summarize(aoiB, analyticsB, backingB),
    aligned_series: alignedSeries,
    comparability_warnings: warnings,
    method: {
      id: 'M2_COMPARATIVE',
      version: '1.0.0',
      description:
        'Side-by-side multi-AOI comparison over identical UTC window and sensor filters.',
      caveat:
        'Detection density per 1,000 km² divides raw satellite hotspot detections by geometric AOI bbox area. It is not burned-area fraction and does not correct for cloud obstruction or biome omission differences.',
    },
    provenance: {
      sources: Array.from(
        new Set([...analyticsA.provenance.sources, ...analyticsB.provenance.sources])
      ),
      retrieved_at_utc: retrievedAtUtc,
      archive_checksums: Array.from(
        new Set([
          ...analyticsA.provenance.archive_checksums,
          ...analyticsB.provenance.archive_checksums,
        ])
      ),
    },
  };
}

/**
 * Pure spatial grid/cluster rollup from CanonicalObservations (used for live FIRMS feeds & tests).
 */
export function aggregateObservationsToGrid(params: {
  observations: CanonicalObservation[];
  cellSizeDeg: number;
  bounds?: BoundingBox;
  aoi?: AoiDefinition;
}): MapGridCell[] {
  const { observations, cellSizeDeg, bounds, aoi } = params;
  const inv = 1 / cellSizeDeg;
  const cells = new Map<
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

  for (const r of observations) {
    if (aoi && !isPointInAoi(r.latitude, r.longitude, aoi)) continue;
    if (bounds) {
      if (r.latitude < bounds.south || r.latitude > bounds.north) continue;
      // Handle wrapped longitudes gracefully
      const inRaw = r.longitude >= bounds.west && r.longitude <= bounds.east;
      const inPlus360 = r.longitude + 360 >= bounds.west && r.longitude + 360 <= bounds.east;
      const inMinus360 = r.longitude - 360 >= bounds.west && r.longitude - 360 <= bounds.east;
      if (!inRaw && !inPlus360 && !inMinus360) continue;
    }

    const latBin = Number((Math.floor(r.latitude * inv) / inv).toFixed(4));
    const lngBin = Number((Math.floor(r.longitude * inv) / inv).toFixed(4));
    const key = `${latBin}|${lngBin}`;
    let acc = cells.get(key);
    if (!acc) {
      acc = {
        latBin,
        lngBin,
        modis: 0,
        viirs: 0,
        modisFrp: 0,
        viirsFrp: 0,
        platforms: new Set<PlatformId>(),
      };
      cells.set(key, acc);
    }
    if (r.sensor === 'MODIS') {
      acc.modis += 1;
      if (typeof r.frp_mw === 'number' && Number.isFinite(r.frp_mw)) acc.modisFrp += r.frp_mw;
    } else {
      acc.viirs += 1;
      if (typeof r.frp_mw === 'number' && Number.isFinite(r.frp_mw)) acc.viirsFrp += r.frp_mw;
    }
    acc.platforms.add(r.platform);
  }

  return Array.from(cells.entries())
    .map(([key, c]) => ({
      cell_id: key,
      lat_bin: c.latBin,
      lng_bin: c.lngBin,
      cell_size_deg: cellSizeDeg,
      centroid_lat: Number((c.latBin + cellSizeDeg / 2).toFixed(4)),
      centroid_lng: Number((c.lngBin + cellSizeDeg / 2).toFixed(4)),
      modis_detections: c.modis,
      viirs_detections: c.viirs,
      pooled_observation_count: c.modis + c.viirs,
      modis_frp_sum_mw: Number(c.modisFrp.toFixed(2)),
      viirs_frp_sum_mw: Number(c.viirsFrp.toFixed(2)),
      platforms: Array.from(c.platforms),
      source_backing: 'LIVE' as const,
    }))
    .sort((a, b) => b.pooled_observation_count - a.pooled_observation_count);
}

/**
 * Deterministic astronomical solar day/night terminator curve (night polygon boundary in WGS84).
 * Provides verifiable Day vs Night overpass context without inventing cloud or weather metrics.
 */
export function computeSolarTerminatorPolygon(dateUtc: Date): Array<[number, number]> {
  const rad2deg = 180 / Math.PI;
  const deg2rad = Math.PI / 180;

  const startOfYear = Date.UTC(dateUtc.getUTCFullYear(), 0, 1);
  const dayOfYear = (dateUtc.getTime() - startOfYear) / 86400000 + 1;
  const utcHours =
    dateUtc.getUTCHours() + dateUtc.getUTCMinutes() / 60 + dateUtc.getUTCSeconds() / 3600;

  // Approximate solar declination (deg)
  const decl = 23.44 * Math.sin(deg2rad * (360 / 365.24) * (dayOfYear - 81));
  const declRad = decl * deg2rad;

  // Subsolar longitude (deg)
  const subsolarLng = (12 - utcHours) * 15;

  const curve: Array<[number, number]> = [];
  for (let lng = -180; lng <= 180; lng += 5) {
    const ha = (lng - subsolarLng) * deg2rad;
    let lat = 0;
    if (Math.abs(Math.tan(declRad)) > 1e-6) {
      lat = Math.atan(-Math.cos(ha) / Math.tan(declRad)) * rad2deg;
    } else {
      lat = Math.cos(ha) >= 0 ? -85 : 85;
    }
    lat = Math.max(-85, Math.min(85, lat));
    curve.push([Number(lat.toFixed(2)), lng]);
  }

  // Close night side polygon toward winter pole
  const nightPoleLat = decl >= 0 ? -85 : 85;
  const polygon: Array<[number, number]> = [
    [nightPoleLat, -180],
    ...curve,
    [nightPoleLat, 180],
  ];
  return polygon;
}

/**
 * Generates CSV export with definitions & SHA-256 provenance for FR-08 Period Comparison.
 */
export function generatePeriodComparisonCsv(comp: PeriodComparisonResponse): string {
  const headerComments = [
    `# FireScope FR-08 Historical Period Comparison Export`,
    `# AOI: ${comp.aoi.name} (${comp.aoi.id})`,
    `# Period A: ${comp.period_a.label} (${comp.period_a.start_date} to ${comp.period_a.end_date})`,
    `# Period B: ${comp.period_b.label} (${comp.period_b.start_date} to ${comp.period_b.end_date})`,
    `# Granularity: ${comp.granularity} | Sensor Mode: ${comp.sensor} | Data Backing: ${comp.data_backing}`,
    `# Method: ${comp.method.id} v${comp.method.version} | Formula: ${comp.method.formula}`,
    `# Caveat: MODIS and VIIRS counts are kept strictly separate. Differences across eras can reflect new platform launches or cloud/overpass variations.`,
    `# Sources: ${comp.provenance.sources.join('; ')}`,
    `# Retrieved At (UTC): ${comp.provenance.retrieved_at_utc}`,
    `# SHA-256 Checksums: ${comp.provenance.archive_checksums.join(', ')}`,
  ];

  const columns = [
    'aligned_index',
    'aligned_label',
    'period_a_bin',
    'period_b_bin',
    'period_a_modis_detections',
    'period_b_modis_detections',
    'modis_delta',
    'period_a_viirs_detections',
    'period_b_viirs_detections',
    'viirs_delta',
    'period_a_modis_frp_mean_mw',
    'period_b_modis_frp_mean_mw',
    'period_a_viirs_frp_mean_mw',
    'period_b_viirs_frp_mean_mw',
    'period_a_platforms',
    'period_b_platforms',
  ];

  const rows = comp.aligned_series.map((r) => [
    r.aligned_index,
    `"${r.aligned_label}"`,
    r.period_a?.bin_key ?? '',
    r.period_b?.bin_key ?? '',
    r.period_a?.modis_detections ?? '',
    r.period_b?.modis_detections ?? '',
    r.modis_delta ?? '',
    r.period_a?.viirs_detections ?? '',
    r.period_b?.viirs_detections ?? '',
    r.viirs_delta ?? '',
    r.period_a?.modis_frp_mean_mw ?? '',
    r.period_b?.modis_frp_mean_mw ?? '',
    r.period_a?.viirs_frp_mean_mw ?? '',
    r.period_b?.viirs_frp_mean_mw ?? '',
    `"${(r.period_a?.active_platforms ?? []).join(';')}"`,
    `"${(r.period_b?.active_platforms ?? []).join(';')}"`,
  ]);

  return [...headerComments, columns.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Generates CSV export with definitions & SHA-256 provenance for Multi-AOI Side-by-Side Comparison.
 */
export function generateAoiComparisonCsv(comp: AoiComparisonResponse): string {
  const headerComments = [
    `# FireScope Multi-AOI Side-by-Side Comparison Export`,
    `# AOI A: ${comp.aoi_a.aoi.name} (${comp.aoi_a.aoi.id}) | Area Extent: ${comp.aoi_a.aoi.area_sq_km} km2 | Backing: ${comp.aoi_a.data_backing}`,
    `# AOI B: ${comp.aoi_b.aoi.name} (${comp.aoi_b.aoi.id}) | Area Extent: ${comp.aoi_b.aoi.area_sq_km} km2 | Backing: ${comp.aoi_b.data_backing}`,
    `# Time Window (UTC): ${comp.query.start_date} to ${comp.query.end_date} | Granularity: ${comp.query.granularity} | Sensor Mode: ${comp.query.sensor}`,
    `# Method: ${comp.method.id} v${comp.method.version} | Caveat: ${comp.method.caveat}`,
    `# Sources: ${comp.provenance.sources.join('; ')}`,
    `# Retrieved At (UTC): ${comp.provenance.retrieved_at_utc}`,
    `# SHA-256 Checksums: ${comp.provenance.archive_checksums.join(', ')}`,
  ];

  const columns = [
    'bin_key',
    'label',
    'aoi_a_modis_detections',
    'aoi_a_viirs_detections',
    'aoi_b_modis_detections',
    'aoi_b_viirs_detections',
  ];

  const rows = comp.aligned_series.map((r) => [
    r.bin_key,
    `"${r.label}"`,
    r.aoi_a_modis ?? '',
    r.aoi_a_viirs ?? '',
    r.aoi_b_modis ?? '',
    r.aoi_b_viirs ?? '',
  ]);

  return [...headerComments, columns.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
