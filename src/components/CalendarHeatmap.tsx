import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  History,
  Info,
} from 'lucide-react';
import {
  CalendarAnalyticsResponse,
  CalendarBinRecord,
  Granularity,
  SensorFilter,
} from '../types/firescope';

interface CalendarHeatmapProps {
  analytics: CalendarAnalyticsResponse;
  selectedBinKey: string | null;
  onSelectBin: (binKey: string) => void;
  onChangeGranularity: (g: Granularity) => void;
  onChangeSensor: (s: SensorFilter) => void;
  onChangeMetric: (m: 'detection_count' | 'frp_mw') => void;
  onApplyDatePreset: (startDate: string, endDate: string, granularity: Granularity) => void;
  onOpenCompareHistory?: () => void;
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
  onOpenCompareHistory,
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

  // Helper to compute cell intensity class for single-sensor view
  const getSingleSensorBgStyle = (
    val: number | null,
    sensor: 'MODIS' | 'VIIRS',
    coverageState: CalendarBinRecord['coverage_state']
  ): React.CSSProperties => {
    if (coverageState === 'NO_SOURCE_DATA' || coverageState === 'COVERAGE_UNKNOWN' || val === null) {
      return {};
    }
    if (val === 0) {
      return { backgroundColor: 'var(--surface-2)' };
    }
    const [t1, t2, t3] = thresholds[sensor];
    const baseRgb = sensor === 'MODIS' ? '255, 180, 84' : '97, 189, 224';
    const alpha = val <= t1 ? 0.22 : val <= t2 ? 0.42 : val <= t3 ? 0.65 : 0.88;
    return {
      backgroundColor: `rgba(${baseRgb}, ${alpha})`,
    };
  };

  return (
    <section
      aria-label="AOI Burning-Activity Calendar"
      data-testid="burning-activity-calendar"
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] p-4 space-y-4"
    >
      {/* Section Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-[var(--ember)]" />
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
              Burning-Activity Calendar
            </h2>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {analytics.method.id} v{analytics.method.version}
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
            Each cell represents UTC time-bin satellite observations inside{' '}
            <strong className="font-medium text-[var(--text-primary)]">
              {analytics.aoi.name}
            </strong>{' '}
            (AOI local reference: {analytics.aoi.timezone}). Click any bin to inspect sensor
            provenance and records.
          </p>
        </div>

        {/* Granularity, Sensor Mode & Metric Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Window Presets */}
          <div className="flex flex-wrap items-center bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[11px]">
            <button
              type="button"
              onClick={() => onApplyDatePreset(liveMinDate, liveMaxDate, 'day')}
              className={`px-2 py-1 rounded font-medium transition-colors ${
                query.granularity === 'day' &&
                query.start_date === liveMinDate &&
                query.end_date === liveMaxDate
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              24h Live FIRMS
            </button>
            <button
              type="button"
              onClick={() => onApplyDatePreset('2026-10-15', liveMaxDate, 'day')}
              className={`px-2 py-1 rounded font-medium transition-colors ${
                query.granularity === 'day' &&
                query.start_date === '2026-10-15' &&
                query.end_date === liveMaxDate
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Oct–Nov 2026 Daily
            </button>
            <button
              type="button"
              onClick={() => onApplyDatePreset('2024-01-01', liveMaxDate, 'month')}
              className={`px-2 py-1 rounded font-medium transition-colors ${
                query.granularity === 'month' &&
                query.start_date === '2024-01-01' &&
                query.end_date === liveMaxDate
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              2024–2026 Monthly
            </button>
            {analytics.aoi.bbox.east >= 95 &&
              analytics.aoi.bbox.west <= 141 &&
              analytics.aoi.bbox.north >= -11.1 &&
              analytics.aoi.bbox.south <= 6.0 && (
                <>
                  <button
                    type="button"
                    onClick={() => onApplyDatePreset('2023-01-01', '2023-12-31', 'month')}
                    className={`px-2 py-1 rounded font-medium transition-colors ${
                      query.granularity === 'month' && query.start_date === '2023-01-01'
                        ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    2023 El Niño
                  </button>
                  <button
                    type="button"
                    onClick={() => onApplyDatePreset('2015-01-01', '2015-12-31', 'month')}
                    className={`px-2 py-1 rounded font-medium transition-colors ${
                      query.granularity === 'month' && query.start_date === '2015-01-01'
                        ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    2015 El Niño
                  </button>
                </>
              )}
          </div>

          {onOpenCompareHistory && (
            <button
              type="button"
              onClick={onOpenCompareHistory}
              className="h-7 px-2.5 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <History className="w-3.5 h-3.5 text-[var(--ember)]" />
              <span>Compare History</span>
            </button>
          )}

          {/* Granularity Selector */}
          <div
            role="group"
            aria-label="Calendar time granularity"
            className="flex items-center bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[11px]"
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

          {/* Sensor Mode Selector */}
          <div
            role="group"
            aria-label="Calendar sensor series mode"
            className="flex items-center bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[11px]"
          >
            {[
              { id: 'ALL' as SensorFilter, label: 'Compare (M2)' },
              { id: 'MODIS' as SensorFilter, label: 'MODIS Only' },
              { id: 'VIIRS' as SensorFilter, label: 'VIIRS Only' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeSensor(item.id)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  query.sensor === item.id
                    ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Metric Selector */}
          <div
            role="group"
            aria-label="Calendar analytical metric"
            className="flex items-center bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[11px]"
          >
            <button
              type="button"
              onClick={() => onChangeMetric('detection_count')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                query.metric === 'detection_count'
                  ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
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
                  ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Observed FRP · MW
            </button>
          </div>
        </div>
      </div>

      {/* Data-Driven Numeric Thresholds & Coverage State Legend (Section 7.3 & 7.4) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-[6px] bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[11px]">
        <div className="flex flex-wrap items-center gap-4">
          {(query.sensor === 'ALL' || query.sensor === 'MODIS') && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#FFB454] inline-block rounded-[1px]" />
              <span className="font-medium text-[var(--text-primary)]">MODIS C6.1:</span>
              <span className="font-mono text-[var(--text-secondary)]">
                ≤{thresholds.MODIS[0]} · ≤{thresholds.MODIS[1]} · ≤{thresholds.MODIS[2]} · max{' '}
                {thresholds.MODIS[3]} {query.metric === 'frp_mw' ? 'MW' : 'rec'}
              </span>
            </div>
          )}

          {(query.sensor === 'ALL' || query.sensor === 'VIIRS') && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#61BDE0] inline-block rounded-full" />
              <span className="font-medium text-[var(--text-primary)]">VIIRS C2:</span>
              <span className="font-mono text-[var(--text-secondary)]">
                ≤{thresholds.VIIRS[0]} · ≤{thresholds.VIIRS[1]} · ≤{thresholds.VIIRS[2]} · max{' '}
                {thresholds.VIIRS[3]} {query.metric === 'frp_mw' ? 'MW' : 'rec'}
              </span>
            </div>
          )}
        </div>

        {/* Explicit Zero vs Missing Coverage Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-xs bg-[var(--surface-2)] border border-[var(--border-subtle)] inline-flex items-center justify-center font-mono text-[9px] text-[var(--text-muted)]">
              0
            </span>
            <span>0 detections in available records</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-xs border border-[var(--warning)]/60 bg-[var(--surface-2)] inline-block" />
            <span>Partial platform gap (e.g. S-NPP &gt; Nov 2)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-xs pattern-missing-coverage border border-dashed border-[var(--unknown)] inline-block" />
            <span>No data available / Unknown</span>
          </div>
        </div>
      </div>

      {/* Calendar Matrix Grid */}
      <div
        role="grid"
        aria-label={`Burning activity ${query.granularity} calendar bins`}
        className={`grid gap-2.5 ${
          query.granularity === 'month'
            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
            : query.granularity === 'week'
            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
            : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7'
        }`}
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
              ? Math.min(100, Math.max(12, Math.round((modisVal / thresholds.MODIS[3]) * 100)))
              : 0;
          const viirsBarPct =
            viirsVal && thresholds.VIIRS[3] > 0
              ? Math.min(100, Math.max(12, Math.round((viirsVal / thresholds.VIIRS[3]) * 100)))
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
              className={`group relative text-left p-2.5 rounded-[6px] border transition-all focus-visible:outline-2 focus-visible:outline-[var(--ember)] ${
                isMissing
                  ? 'pattern-missing-coverage border-dashed border-[var(--unknown)]'
                  : isSelected
                  ? 'bg-[var(--surface-2)] border-[var(--selected)] ring-1 ring-[var(--selected)] shadow-sm'
                  : isPartial
                  ? 'bg-[var(--surface-2)]/90 border-[var(--warning)]/65 hover:border-[var(--selected)]'
                  : 'bg-[var(--surface-2)]/70 border-[var(--border-subtle)] hover:bg-[var(--surface-2)] hover:border-[var(--text-secondary)]'
              }`}
            >
              {/* Top Row: Bin Date Label + Unusual or Partial Indicator */}
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[11px] font-mono font-semibold text-[var(--text-primary)] truncate">
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
                    className="text-[10px] font-mono text-[var(--warning)] shrink-0"
                  >
                    Gap
                  </span>
                )}
              </div>

              {/* Body: Missing vs Zero vs Compare / Single Sensor */}
              {isMissing ? (
                <div className="py-1.5 text-[11px] font-mono text-[var(--text-muted)]">
                  No data available
                </div>
              ) : isZero ? (
                <div className="py-1 space-y-0.5">
                  <div className="text-[12px] font-mono text-[var(--text-secondary)] tabular-nums">
                    0 detections
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">
                    Records available
                  </div>
                </div>
              ) : query.sensor === 'ALL' ? (
                <div className="space-y-1.5">
                  {/* MODIS independent bar & count */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-[var(--text-secondary)]">M</span>
                      <span className="text-[#FFB454] font-semibold">
                        {modisVal !== null ? modisVal.toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--app-bg)] rounded-xs overflow-hidden">
                      <div
                        style={{ width: `${modisBarPct}%` }}
                        className="h-full bg-[#FFB454]"
                      />
                    </div>
                  </div>

                  {/* VIIRS independent bar & count */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-[var(--text-secondary)]">V</span>
                      <span className="text-[#61BDE0] font-semibold">
                        {viirsVal !== null ? viirsVal.toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--app-bg)] rounded-xs overflow-hidden">
                      <div
                        style={{ width: `${viirsBarPct}%` }}
                        className="h-full bg-[#61BDE0]"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-1 space-y-0.5">
                  <div className="text-[15px] font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {query.sensor === 'MODIS'
                      ? modisVal !== null
                        ? modisVal.toLocaleString()
                        : 'N/A'
                      : viirsVal !== null
                      ? viirsVal.toLocaleString()
                      : 'N/A'}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                    {query.metric === 'frp_mw' ? 'MW sum' : `${query.sensor} rec`}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Live Hover / Focus Inspector Bar */}
      {activeBin && (
        <div className="p-3 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              Bin: {activeBin.label}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-secondary)]">
              MODIS detections:{' '}
              <strong className="text-[#FFB454]">
                {activeBin.values.MODIS !== null
                  ? activeBin.values.MODIS.toLocaleString()
                  : 'No data'}
              </strong>
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-secondary)]">
              VIIRS detections:{' '}
              <strong className="text-[#61BDE0]">
                {activeBin.values.VIIRS !== null
                  ? activeBin.values.VIIRS.toLocaleString()
                  : 'No data'}
              </strong>
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-secondary)]">
              Pooled records (unweighted):{' '}
              <strong className="text-[var(--text-primary)]">
                {activeBin.pooled_observation_count !== null
                  ? activeBin.pooled_observation_count.toLocaleString()
                  : 'N/A'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            {activeBin.coverage_state === 'PARTIAL_COVERAGE' ||
            activeBin.coverage_state === 'NO_SOURCE_DATA' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
            ) : (
              <Info className="w-3.5 h-3.5 text-[var(--viirs)] shrink-0" />
            )}
            <span>{activeBin.quality.coverage_note}</span>
          </div>
        </div>
      )}
    </section>
  );
};
