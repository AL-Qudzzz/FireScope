import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  CalendarAnalyticsResponse,
  CalendarBinRecord,
  Granularity,
  SensorFilter,
} from '../types/firescope';
import { InfoPopover } from './ProgressiveDisclosure';

interface CalendarHeatmapProps {
  analytics: CalendarAnalyticsResponse;
  selectedBinKey: string | null;
  onSelectBin: (binKey: string) => void;
  onChangeGranularity: (g: Granularity) => void;
  onChangeSensor: (s: SensorFilter) => void;
  onChangeMetric: (m: 'detection_count' | 'frp_mw') => void;
  onApplyDatePreset: (startDate: string, endDate: string, granularity: Granularity) => void;
  onOpenCompareHistory?: () => void;
  isLoading?: boolean;
  liveMinDate?: string;
  liveMaxDate?: string;
}

export const CalendarHeatmap: React.FC<CalendarHeatmapProps> = ({
  analytics,
  selectedBinKey,
  onSelectBin,
  onChangeGranularity,
  onChangeSensor,
  onChangeMetric,
  onApplyDatePreset,
  isLoading = false,
  liveMinDate = '2026-11-12',
  liveMaxDate = '2026-11-13',
}) => {
  const [hoveredBin, setHoveredBin] = useState<CalendarBinRecord | null>(null);

  const { series, query, thresholds } = analytics;
  const activeBin =
    hoveredBin ??
    series.find((b) => b.bin_key === selectedBinKey) ??
    series[series.length - 1] ??
    null;

  const isCompactWindow = series.length > 0 && series.length <= 2;
  const isShortWindow = series.length > 2 && series.length <= 4;

  const gridColumnsClass = isCompactWindow
    ? 'grid-cols-1 sm:grid-cols-2'
    : isShortWindow
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
    : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

  const getSingleSensorBgStyle = (
    val: number | null,
    sensor: 'MODIS' | 'VIIRS',
    coverageState: CalendarBinRecord['coverage_state']
  ): React.CSSProperties => {
    if (
      coverageState === 'NO_SOURCE_DATA' ||
      coverageState === 'COVERAGE_UNKNOWN' ||
      val === null
    ) {
      return {};
    }
    if (val === 0) {
      return { backgroundColor: 'var(--surface-2)' };
    }
    const [t1, t2, t3] = thresholds[sensor];
    const rgbVar = sensor === 'MODIS' ? 'var(--modis-rgb)' : 'var(--viirs-rgb)';
    const alpha = val <= t1 ? 0.1 : val <= t2 ? 0.18 : val <= t3 ? 0.28 : 0.38;
    return {
      backgroundColor: `rgba(${rgbVar}, ${alpha})`,
      borderColor: `rgba(${rgbVar}, 0.45)`,
    };
  };

  return (
    <section
      aria-label="AOI Burning-Activity Calendar"
      data-testid="burning-activity-calendar"
      aria-busy={isLoading}
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md p-4 space-y-4 h-full flex flex-col justify-between"
    >
      <div className="space-y-4">
        {/* Section Header */}
        <div className="pb-3 border-b border-[var(--border-subtle)] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[var(--ember)] shrink-0" />
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
                Burning-Activity Calendar
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
              <span>Select a date bin to inspect records</span>
              <InfoPopover
                title="How to Read the Activity Calendar"
                triggerLabel="How to read"
                align="right"
              >
                <div className="space-y-1.5">
                  <p>
                    Each UTC bin in{' '}
                    <strong className="text-[var(--text-primary)]">{analytics.aoi.name}</strong>{' '}
                    ({analytics.aoi.timezone}) keeps sensors separate:{' '}
                    <strong className="text-[var(--modis)]">amber bars</strong> show MODIS (1 km
                    C6.1) and <strong className="text-[var(--viirs)]">blue bars</strong> show VIIRS
                    (375 m C2).
                  </p>
                  <p>
                    Coverage states distinguish <strong>0 detections in records</strong>,{' '}
                    <strong>Partial gap</strong> (missing platform or period coverage), and hatched{' '}
                    <strong>No data / Unknown</strong> bins—no detection never proves no fire.
                  </p>
                </div>
              </InfoPopover>
            </div>
          </div>

          {/* Two Clean Control Clusters: Quick Presets + View Dimensions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Cluster 1: Quick Period Presets */}
            <div
              role="group"
              aria-label="Quick time window presets"
              className="flex flex-wrap items-center bg-[var(--surface-2)] p-0.5 rounded-md border border-[var(--border-subtle)] text-[11px]"
            >
              <button
                type="button"
                onClick={() => onApplyDatePreset(liveMinDate, liveMaxDate, 'day')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  query.granularity === 'day' &&
                  query.start_date === liveMinDate &&
                  query.end_date === liveMaxDate
                    ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Live 24h–48h
              </button>
              <button
                type="button"
                onClick={() => onApplyDatePreset('2026-10-15', liveMaxDate, 'day')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  query.granularity === 'day' &&
                  query.start_date === '2026-10-15' &&
                  query.end_date === liveMaxDate
                    ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Oct–Nov 2026 Daily
              </button>
              <button
                type="button"
                onClick={() => onApplyDatePreset('2024-01-01', liveMaxDate, 'month')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  query.granularity === 'month' &&
                  query.start_date === '2024-01-01' &&
                  query.end_date === liveMaxDate
                    ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                2024–2026 Monthly
              </button>
              <button
                type="button"
                onClick={() => onApplyDatePreset('2023-01-01', '2023-12-31', 'month')}
                title="2023 El Niño — Indonesia NASA FIRMS Archive"
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  query.granularity === 'month' && query.start_date === '2023-01-01'
                    ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                2023 El Niño
              </button>
              <button
                type="button"
                onClick={() => onApplyDatePreset('2015-01-01', '2015-12-31', 'month')}
                title="2015 El Niño — Indonesia NASA FIRMS Archive"
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  query.granularity === 'month' && query.start_date === '2015-01-01'
                    ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                2015 El Niño
              </button>
            </div>

            {/* Cluster 2: Granularity, Sensor Split & Metric */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <div
                role="group"
                aria-label="Calendar time granularity"
                className="flex items-center bg-[var(--surface-2)] p-0.5 rounded-md border border-[var(--border-subtle)]"
              >
                {(['day', 'week', 'month'] as Granularity[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onChangeGranularity(g)}
                    className={`px-2.5 py-1 rounded capitalize font-medium transition-colors ${
                      query.granularity === g
                        ? 'bg-[var(--ember)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div
                role="group"
                aria-label="Calendar sensor series mode"
                className="flex items-center bg-[var(--surface-2)] p-0.5 rounded-md border border-[var(--border-subtle)]"
              >
                {[
                  { id: 'ALL' as SensorFilter, label: 'Side-by-Side' },
                  { id: 'MODIS' as SensorFilter, label: 'MODIS' },
                  { id: 'VIIRS' as SensorFilter, label: 'VIIRS' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeSensor(item.id)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      query.sensor === item.id
                        ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div
                role="group"
                aria-label="Calendar analytical metric"
                className="flex items-center bg-[var(--surface-2)] p-0.5 rounded-md border border-[var(--border-subtle)]"
              >
                <button
                  type="button"
                  onClick={() => onChangeMetric('detection_count')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    query.metric === 'detection_count'
                      ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Detections
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMetric('frp_mw')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    query.metric === 'frp_mw'
                      ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Observed FRP · MW
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Independent Sensor Thresholds & Coverage Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded bg-[var(--surface-2)]/70 border border-[var(--border-subtle)] text-[11px]">
          <div className="flex flex-wrap items-center gap-3">
            {(query.sensor === 'ALL' || query.sensor === 'MODIS') && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[var(--modis-fill)] inline-block rounded-[1px]" />
                <span className="font-medium text-[var(--text-primary)]">
                  MODIS 1 km (max {thresholds.MODIS[3].toLocaleString()}
                  {query.metric === 'frp_mw' ? ' MW' : ''})
                </span>
              </div>
            )}

            {(query.sensor === 'ALL' || query.sensor === 'VIIRS') && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[var(--viirs-fill)] inline-block rounded-full" />
                <span className="font-medium text-[var(--text-primary)]">
                  VIIRS 375 m (max {thresholds.VIIRS[3].toLocaleString()}
                  {query.metric === 'frp_mw' ? ' MW' : ''})
                </span>
              </div>
            )}

            <InfoPopover title="Quantile Scale Thresholds" triggerLabel="Scale cutoffs">
              <div className="space-y-1.5">
                <p>
                  Independent 4-tier quantile cutoffs (≤Q1 · ≤Q2 · ≤Q3 · max) scaled separately per
                  sensor for{' '}
                  {query.metric === 'frp_mw' ? 'Observed FRP sum (MW)' : 'observation records'}:
                </p>
                {(query.sensor === 'ALL' || query.sensor === 'MODIS') && (
                  <div className="font-mono text-[10px] text-[var(--text-primary)]">
                    <span className="text-[var(--modis)] font-semibold">MODIS 1 km:</span>{' '}
                    ≤{thresholds.MODIS[0]} · ≤{thresholds.MODIS[1]} · ≤{thresholds.MODIS[2]} · max{' '}
                    {thresholds.MODIS[3]} {query.metric === 'frp_mw' ? 'MW' : 'rec'}
                  </div>
                )}
                {(query.sensor === 'ALL' || query.sensor === 'VIIRS') && (
                  <div className="font-mono text-[10px] text-[var(--text-primary)]">
                    <span className="text-[var(--viirs)] font-semibold">VIIRS 375 m:</span>{' '}
                    ≤{thresholds.VIIRS[0]} · ≤{thresholds.VIIRS[1]} · ≤{thresholds.VIIRS[2]} · max{' '}
                    {thresholds.VIIRS[3]} {query.metric === 'frp_mw' ? 'MW' : 'rec'}
                  </div>
                )}
              </div>
            </InfoPopover>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[var(--text-secondary)]">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-xs bg-[var(--surface-1)] border border-[var(--border-subtle)] inline-flex items-center justify-center font-mono text-[9px] text-[var(--text-muted)]">
                0
              </span>
              <span>0 detections in records</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-xs border border-[var(--warning)]/70 bg-[var(--surface-1)] inline-block" />
              <span>Partial gap</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-xs pattern-missing-coverage border border-dashed border-[var(--unknown)] inline-block" />
              <span>No data / Unknown</span>
            </div>
          </div>
        </div>

        {/* Adaptive Calendar Matrix Grid */}
        {isLoading ? (
          <div
            aria-label="Loading burning-activity calendar bins"
            className={`grid gap-2.5 ${gridColumnsClass}`}
          >
            {Array.from({ length: Math.max(2, Math.min(series.length || 6, 14)) }).map((_, idx) => (
              <div
                key={idx}
                className="h-24 rounded border border-[var(--border-subtle)] p-2.5 space-y-2"
              >
                <div className="h-3.5 w-20 rounded atlas-skeleton" />
                <div className="h-3 w-full rounded atlas-skeleton" />
                <div className="h-3 w-4/5 rounded atlas-skeleton" />
              </div>
            ))}
          </div>
        ) : (
          <div
            role="grid"
            aria-label={`Burning activity ${query.granularity} calendar bins`}
            className={`grid gap-2.5 ${gridColumnsClass}`}
          >
            {series.map((bin) => {
              const isSelected = bin.bin_key === (selectedBinKey ?? activeBin?.bin_key);
              const isMissing =
                bin.coverage_state === 'NO_SOURCE_DATA' ||
                bin.coverage_state === 'COVERAGE_UNKNOWN';
              const isZero = bin.coverage_state === 'NO_DETECTIONS_IN_AVAILABLE_RECORDS';
              const isPartial = bin.coverage_state === 'PARTIAL_COVERAGE';

              const modisVal =
                query.metric === 'frp_mw'
                  ? bin.frp_summary.MODIS.sum_mw
                  : bin.values.MODIS;
              const viirsVal =
                query.metric === 'frp_mw'
                  ? bin.frp_summary.VIIRS.sum_mw
                  : bin.values.VIIRS;

              const modisBarPct =
                modisVal && thresholds.MODIS[3] > 0
                  ? Math.min(100, Math.max(10, Math.round((modisVal / thresholds.MODIS[3]) * 100)))
                  : 0;
              const viirsBarPct =
                viirsVal && thresholds.VIIRS[3] > 0
                  ? Math.min(100, Math.max(10, Math.round((viirsVal / thresholds.VIIRS[3]) * 100)))
                  : 0;

              const singleSensorStyle =
                query.sensor === 'MODIS'
                  ? getSingleSensorBgStyle(modisVal, 'MODIS', bin.coverage_state)
                  : query.sensor === 'VIIRS'
                  ? getSingleSensorBgStyle(viirsVal, 'VIIRS', bin.coverage_state)
                  : {};

              const isUnusual =
                bin.seasonal_baseline?.MODIS.status_label ===
                  'Unusual relative to this baseline' ||
                bin.seasonal_baseline?.VIIRS.status_label ===
                  'Unusual relative to this baseline';

              return (
                <button
                  key={bin.bin_key}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={`${bin.label}: MODIS ${modisVal ?? 'No data'}, VIIRS ${
                    viirsVal ?? 'No data'
                  }, status ${bin.coverage_state}`}
                  onClick={() => onSelectBin(bin.bin_key)}
                  onMouseEnter={() => setHoveredBin(bin)}
                  onMouseLeave={() => setHoveredBin(null)}
                  onFocus={() => setHoveredBin(bin)}
                  style={singleSensorStyle}
                  className={`group relative text-left ${
                    isCompactWindow ? 'p-3.5' : 'p-2.5'
                  } rounded border transition-colors ${
                    isMissing
                      ? 'pattern-missing-coverage border-dashed border-[var(--unknown)]'
                      : isSelected
                      ? 'bg-[var(--surface-2)] border-[var(--selected)] ring-1 ring-[var(--selected)]'
                      : isPartial
                      ? 'bg-[var(--surface-1)] border-[var(--warning)]/70 hover:border-[var(--selected)]'
                      : 'bg-[var(--surface-1)] border-[var(--border-subtle)] hover:bg-[var(--surface-2)]/75 hover:border-[var(--border-strong)]'
                  }`}
                >
                  {/* Top Row: Bin Date Label + Unusual / Gap Indicator */}
                  <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5 mb-2">
                    <span
                      className={`${
                        isCompactWindow ? 'text-[13px]' : 'text-[11px]'
                      } font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap shrink-0`}
                    >
                      {bin.label}
                    </span>
                    {isUnusual && !isMissing && (
                      <span
                        title="Unusual relative to historical seasonal baseline"
                        className="text-[10px] font-mono text-[var(--ember)] font-semibold shrink-0"
                      >
                        ▲ Base
                      </span>
                    )}
                    {isPartial && !isUnusual && (
                      <span
                        title={bin.quality.coverage_note}
                        className="px-1.5 py-0.5 rounded bg-[var(--warning)]/12 text-[10px] font-mono text-[var(--warning)] font-medium shrink-0"
                      >
                        {isCompactWindow ? 'Partial gap' : 'Gap'}
                      </span>
                    )}
                  </div>

                  {/* Body: Missing vs Zero vs Compare / Single Sensor */}
                  {isMissing ? (
                    <div className={`${isCompactWindow ? 'py-3' : 'py-1.5'} space-y-1`}>
                      <div className="text-[11px] font-mono font-medium text-[var(--text-secondary)]">
                        No source records
                      </div>
                      {isCompactWindow && (
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {bin.quality.coverage_note}
                        </div>
                      )}
                    </div>
                  ) : isZero ? (
                    <div className="py-1 space-y-0.5">
                      <div className="text-[12px] font-mono text-[var(--text-secondary)] tabular-nums">
                        0 detections
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        Records verified
                      </div>
                    </div>
                  ) : query.sensor === 'ALL' ? (
                    <div className={isCompactWindow ? 'space-y-3' : 'space-y-1.5'}>
                      {/* MODIS independent bar & count */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                          <span className="text-[var(--text-secondary)] font-medium">
                            {isCompactWindow ? 'MODIS (1 km C6.1)' : 'M'}
                          </span>
                          <span
                            className={`${
                              isCompactWindow ? 'text-[14px]' : ''
                            } text-[var(--modis)] font-semibold`}
                          >
                            {modisVal !== null ? modisVal.toLocaleString() : 'N/A'}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                          <div
                            style={{ width: `${modisBarPct}%` }}
                            className="h-full bg-[var(--modis-fill)]"
                          />
                        </div>
                        {isCompactWindow && (
                          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                            <span>
                              Terra {bin.platform_breakdown.TERRA.toLocaleString()} · Aqua{' '}
                              {bin.platform_breakdown.AQUA.toLocaleString()}
                            </span>
                            <span>Mean FRP: {bin.frp_summary.MODIS.mean_mw ?? '—'} MW</span>
                          </div>
                        )}
                      </div>

                      {/* VIIRS independent bar & count */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                          <span className="text-[var(--text-secondary)] font-medium">
                            {isCompactWindow ? 'VIIRS (375 m C2)' : 'V'}
                          </span>
                          <span
                            className={`${
                              isCompactWindow ? 'text-[14px]' : ''
                            } text-[var(--viirs)] font-semibold`}
                          >
                            {viirsVal !== null ? viirsVal.toLocaleString() : 'N/A'}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                          <div
                            style={{ width: `${viirsBarPct}%` }}
                            className="h-full bg-[var(--viirs-fill)]"
                          />
                        </div>
                        {isCompactWindow && (
                          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                            <span>
                              S-NPP {bin.platform_breakdown.SNPP.toLocaleString()} · N20{' '}
                              {bin.platform_breakdown.NOAA20.toLocaleString()} · N21{' '}
                              {bin.platform_breakdown.NOAA21.toLocaleString()}
                            </span>
                            <span>Mean FRP: {bin.frp_summary.VIIRS.mean_mw ?? '—'} MW</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-1 space-y-1">
                      <div className="text-[16px] font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                        {query.sensor === 'MODIS'
                          ? modisVal !== null
                            ? modisVal.toLocaleString()
                            : 'N/A'
                          : viirsVal !== null
                          ? viirsVal.toLocaleString()
                          : 'N/A'}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                        {query.metric === 'frp_mw' ? 'MW sum' : `${query.sensor} records`}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Hover / Focus Inspector Bar */}
      {activeBin && (
        <div className="p-3 rounded bg-[var(--surface-2)]/80 border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              Bin: {activeBin.label}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-secondary)]">
              MODIS:{' '}
              <strong className="text-[var(--modis)]">
                {activeBin.values.MODIS !== null
                  ? activeBin.values.MODIS.toLocaleString()
                  : 'No data'}
              </strong>
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-secondary)]">
              VIIRS:{' '}
              <strong className="text-[var(--viirs)]">
                {activeBin.values.VIIRS !== null
                  ? activeBin.values.VIIRS.toLocaleString()
                  : 'No data'}
              </strong>
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-secondary)]">
              Pooled (unweighted):{' '}
              <strong className="text-[var(--text-primary)]">
                {activeBin.pooled_observation_count !== null
                  ? activeBin.pooled_observation_count.toLocaleString()
                  : 'N/A'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            {(activeBin.coverage_state === 'PARTIAL_COVERAGE' ||
              activeBin.coverage_state === 'NO_SOURCE_DATA' ||
              activeBin.coverage_state === 'COVERAGE_UNKNOWN') && (
              <span className="inline-flex items-center gap-1 text-[var(--warning)] font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {activeBin.coverage_state === 'PARTIAL_COVERAGE'
                    ? 'Partial gap'
                    : 'No source data'}
                </span>
              </span>
            )}
            <InfoPopover
              title="Bin Coverage Status"
              triggerLabel="Coverage note"
              align="right"
            >
              <div className="space-y-1">
                <div className="font-mono text-[10px] text-[var(--text-muted)]">
                  State: {activeBin.coverage_state}
                </div>
                <p>{activeBin.quality.coverage_note}</p>
                {activeBin.quality.unavailable_platforms.length > 0 && (
                  <div className="font-mono text-[10px] text-[var(--warning)] pt-0.5">
                    Unavailable platforms: {activeBin.quality.unavailable_platforms.join(', ')}
                  </div>
                )}
              </div>
            </InfoPopover>
          </div>
        </div>
      )}
    </section>
  );
};
