import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  CalendarAnalyticsResponse,
  PlatformId,
} from '../types/firescope';
import { InfoPopover } from './ProgressiveDisclosure';

interface SensorComparisonChartProps {
  analytics: CalendarAnalyticsResponse;
  selectedBinKey: string | null;
  onSelectBin: (binKey: string) => void;
  isLoading?: boolean;
}

function formatAxisTick(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

export const SensorComparisonChart: React.FC<SensorComparisonChartProps> = ({
  analytics,
  selectedBinKey,
  onSelectBin,
  isLoading = false,
}) => {
  const [breakdownMode, setBreakdownMode] = useState<'sensor' | 'platform'>('sensor');
  const { series, query } = analytics;

  const maxSensorVal = Math.max(
    10,
    ...series.map((b) => {
      if (query.metric === 'frp_mw') {
        return Math.max(
          b.frp_summary.MODIS.sum_mw ?? 0,
          b.frp_summary.VIIRS.sum_mw ?? 0
        );
      }
      return Math.max(b.values.MODIS ?? 0, b.values.VIIRS ?? 0);
    })
  );

  const maxPlatformCount = Math.max(
    10,
    ...series.flatMap((b) => [
      b.platform_breakdown.TERRA ?? 0,
      b.platform_breakdown.AQUA ?? 0,
      b.platform_breakdown.SNPP ?? 0,
      b.platform_breakdown.NOAA20 ?? 0,
      b.platform_breakdown.NOAA21 ?? 0,
    ])
  );

  const effectiveMax = breakdownMode === 'platform' ? maxPlatformCount : maxSensorVal;
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(effectiveMax * ratio));

  const platformColors: Record<PlatformId, string> = {
    TERRA: '#EA8C24',
    AQUA: '#B45309',
    SNPP: '#38BDF8',
    NOAA20: '#0284C7',
    NOAA21: '#1D4ED8',
  };

  const isSparseWindow = series.length > 0 && series.length <= 4;

  return (
    <section
      aria-label="Sensor and Platform Time-Series Comparison"
      aria-busy={isLoading}
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[var(--ember)]" />
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
            Sensor &amp; Platform Time-Series Comparison
          </h2>
          <span className="px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)]">
            {breakdownMode === 'platform'
              ? 'Unit: Records / Platform'
              : query.metric === 'frp_mw'
              ? 'Unit: Observed FRP (MW)'
              : 'Unit: Observation Records'}
          </span>
          <InfoPopover
            title="Why MODIS & VIIRS Counts Differ"
            triggerLabel="Why counts differ?"
          >
            <div className="space-y-1.5">
              <p>
                Aligned time series keep MODIS (1 km) and VIIRS (375 m) separate—never sum FRP
                across sensors or treat raw counts as equivalent fire incidents.
              </p>
              <p>
                VIIRS 375 m detects smaller and cooler thermal anomalies than MODIS 1 km and varies
                less across the scan swath (Li et al., 2018; Fu et al., 2020). Apparent differences
                reflect sensor footprint, overpass timing, and platform availability (VIIRS S-NPP
                archive ends 2026-11-02) rather than calibrated burned-area changes.
              </p>
            </div>
          </InfoPopover>
        </div>

        {/* Sensor vs Platform Breakdown Toggle */}
        <div className="flex items-center bg-[var(--surface-2)] p-0.5 rounded-md border border-[var(--border-subtle)] text-[11px]">
          <button
            type="button"
            onClick={() => setBreakdownMode('sensor')}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              breakdownMode === 'sensor'
                ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sensor Series (MODIS vs VIIRS)
          </button>
          <button
            type="button"
            onClick={() => setBreakdownMode('platform')}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              breakdownMode === 'platform'
                ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            5-Platform Split
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        {breakdownMode === 'sensor' ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[var(--modis-fill)] inline-block rounded-[1px]" />
              <span className="text-[var(--text-primary)] font-medium">
                MODIS (Terra + Aqua · 1 km C6.1)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[var(--viirs-fill)] inline-block rounded-full" />
              <span className="text-[var(--text-primary)] font-medium">
                VIIRS (S-NPP + NOAA-20 + NOAA-21 · 375 m C2)
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {(['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'] as PlatformId[]).map((pid) => (
              <div key={pid} className="flex items-center gap-1.5">
                <span
                  style={{ backgroundColor: platformColors[pid] }}
                  className="w-2.5 h-2.5 inline-block rounded-xs"
                />
                <span className="font-mono text-[var(--text-primary)]">{pid}</span>
                {pid === 'SNPP' && (
                  <span className="text-[10px] text-[var(--warning)]">
                    (ends 2026-11-02)
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Calibrated Chart Canvas with Y-Axis Scale & Reference Gridlines */}
      {isLoading ? (
        <div className="h-56 w-full rounded bg-[var(--surface-2)]/50 border border-[var(--border-subtle)] p-4 flex items-end gap-3">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div
              key={idx}
              style={{ height: `${30 + ((idx * 17) % 60)}%` }}
              className="flex-1 rounded-t atlas-skeleton"
            />
          ))}
        </div>
      ) : (
        <div className="h-60 w-full bg-[var(--app-bg)]/55 border border-[var(--border-subtle)] rounded p-3 flex gap-2.5">
          {/* Y-Axis Scale Column */}
          <div
            aria-hidden="true"
            className="w-11 shrink-0 pb-6 flex flex-col justify-between items-end text-[10px] font-mono text-[var(--text-muted)] tabular-nums select-none"
          >
            {yTicks.map((tick, idx) => (
              <span key={idx} className="leading-none">
                {formatAxisTick(tick)}
              </span>
            ))}
          </div>

          {/* Plot Area with Reference Lines */}
          <div className="flex-1 relative min-w-0 flex flex-col">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 bottom-6 pointer-events-none flex flex-col justify-between"
            >
              {yTicks.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-full border-t ${
                    idx === yTicks.length - 1
                      ? 'border-[var(--border-strong)]'
                      : 'border-dashed border-[var(--border-subtle)]'
                  }`}
                />
              ))}
            </div>

            <div
              className={`relative z-10 flex-1 flex items-end ${
                isSparseWindow ? 'justify-start gap-4 px-2' : 'gap-1.5'
              } overflow-x-auto pb-0.5`}
            >
              {series.map((bin) => {
                const isSelected = bin.bin_key === selectedBinKey;
                const isMissing = bin.coverage_state === 'NO_SOURCE_DATA';

                const modisVal =
                  query.metric === 'frp_mw'
                    ? bin.frp_summary.MODIS.sum_mw ?? 0
                    : bin.values.MODIS ?? 0;
                const viirsVal =
                  query.metric === 'frp_mw'
                    ? bin.frp_summary.VIIRS.sum_mw ?? 0
                    : bin.values.VIIRS ?? 0;

                const modisH = Math.min(100, Math.round((modisVal / effectiveMax) * 100));
                const viirsH = Math.min(100, Math.round((viirsVal / effectiveMax) * 100));

                return (
                  <button
                    key={bin.bin_key}
                    type="button"
                    onClick={() => onSelectBin(bin.bin_key)}
                    title={`${bin.label}: MODIS ${modisVal.toLocaleString()}, VIIRS ${viirsVal.toLocaleString()}`}
                    className={`${
                      isSparseWindow ? 'flex-1 max-w-[160px] min-w-[96px]' : 'flex-1 min-w-[28px]'
                    } h-full flex flex-col justify-end items-center rounded-xs px-1 pt-2 transition-colors ${
                      isSelected
                        ? 'bg-[var(--surface-3)]/85 ring-1 ring-[var(--selected)]'
                        : isMissing
                        ? 'pattern-missing-coverage'
                        : 'hover:bg-[var(--surface-2)]/75'
                    }`}
                  >
                    <div className="w-full flex-1 flex items-end justify-center pb-0.5 min-h-0">
                      {!isMissing && breakdownMode === 'sensor' && (
                        <div className="w-full h-full flex items-end justify-center gap-1">
                          {(query.sensor === 'ALL' || query.sensor === 'MODIS') && (
                            <div className="h-full flex flex-col justify-end items-center gap-1">
                              {isSparseWindow && (
                                <span className="text-[10px] font-mono font-semibold text-[var(--modis)] tabular-nums">
                                  {modisVal.toLocaleString()}
                                </span>
                              )}
                              <div
                                style={{ height: `${Math.max(modisVal > 0 ? 4 : 0, modisH)}%` }}
                                className={`${
                                  isSparseWindow ? 'w-7' : 'w-2.5'
                                } bg-[var(--modis-fill)] rounded-t-[1px] transition-all`}
                              />
                            </div>
                          )}
                          {(query.sensor === 'ALL' || query.sensor === 'VIIRS') && (
                            <div className="h-full flex flex-col justify-end items-center gap-1">
                              {isSparseWindow && (
                                <span className="text-[10px] font-mono font-semibold text-[var(--viirs)] tabular-nums">
                                  {viirsVal.toLocaleString()}
                                </span>
                              )}
                              <div
                                style={{ height: `${Math.max(viirsVal > 0 ? 4 : 0, viirsH)}%` }}
                                className={`${
                                  isSparseWindow ? 'w-7' : 'w-2.5'
                                } bg-[var(--viirs-fill)] rounded-t-[1px] transition-all`}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {!isMissing && breakdownMode === 'platform' && (
                        <div className="w-full h-full flex items-end justify-center gap-[2px]">
                          {(['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'] as PlatformId[]).map(
                            (pid) => {
                              const pCount = bin.platform_breakdown[pid] ?? 0;
                              const pH = Math.min(100, Math.round((pCount / effectiveMax) * 100));
                              return (
                                <div
                                  key={pid}
                                  title={`${pid}: ${pCount.toLocaleString()}`}
                                  style={{
                                    height: `${Math.max(pCount > 0 ? 4 : 0, pH)}%`,
                                    backgroundColor: platformColors[pid],
                                  }}
                                  className={`${
                                    isSparseWindow ? 'w-3.5' : 'w-1.5'
                                  } rounded-t-[1px] transition-all`}
                                />
                              );
                            }
                          )}
                        </div>
                      )}

                      {isMissing && isSparseWindow && (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] self-center">
                          No data
                        </span>
                      )}
                    </div>

                    <span className="h-5 flex items-center text-[10px] font-mono text-[var(--text-muted)] mt-1 truncate max-w-full">
                      {isSparseWindow ? bin.label : bin.bin_key.slice(-5)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
