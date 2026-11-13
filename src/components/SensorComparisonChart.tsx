import React, { useState } from 'react';
import { BarChart3, Info } from 'lucide-react';
import {
  CalendarAnalyticsResponse,
  PlatformId,
} from '../types/firescope';

interface SensorComparisonChartProps {
  analytics: CalendarAnalyticsResponse;
  selectedBinKey: string | null;
  onSelectBin: (binKey: string) => void;
}

export const SensorComparisonChart: React.FC<SensorComparisonChartProps> = ({
  analytics,
  selectedBinKey,
  onSelectBin,
}) => {
  const [breakdownMode, setBreakdownMode] = useState<'sensor' | 'platform'>('sensor');
  const { series, query } = analytics;

  const maxVal = Math.max(
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

  const platformColors: Record<PlatformId, string> = {
    TERRA: '#FFB454',
    AQUA: '#D97706',
    SNPP: '#A5F3FC',
    NOAA20: '#61BDE0',
    NOAA21: '#0284C7',
  };

  return (
    <section
      aria-label="Sensor and Platform Time-Series Comparison"
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--ember)]" />
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
              Sensor &amp; Platform Time-Series Comparison
            </h2>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {query.metric === 'frp_mw' ? 'Unit: Observed FRP (MW)' : 'Unit: Observation Records'}
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
            Aligned time axis preserving separate MODIS (1 km) and VIIRS (375 m) series. Never
            sums FRP across sensors or treats raw counts as equivalent fire incidents.
          </p>
        </div>

        {/* Sensor vs Platform Breakdown Toggle */}
        <div className="flex items-center bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[11px]">
          <button
            type="button"
            onClick={() => setBreakdownMode('sensor')}
            className={`px-2.5 py-1 rounded font-medium ${
              breakdownMode === 'sensor'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sensor Series (MODIS vs VIIRS)
          </button>
          <button
            type="button"
            onClick={() => setBreakdownMode('platform')}
            className={`px-2.5 py-1 rounded font-medium ${
              breakdownMode === 'platform'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            5-Platform Split (Terra/Aqua/SNPP/N20/N21)
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        {breakdownMode === 'sensor' ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[#FFB454] inline-block rounded-[1px]" />
              <span className="text-[var(--text-primary)] font-medium">
                MODIS (Terra + Aqua · 1 km C6.1)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[#61BDE0] inline-block rounded-full" />
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

        <div className="font-mono text-[var(--text-muted)]">
          Window: {query.start_date} → {query.end_date} ({query.granularity})
        </div>
      </div>

      {/* Interactive Paired Bar / Series Chart */}
      <div className="h-52 w-full bg-[var(--app-bg)] border border-[var(--border-subtle)] rounded-[6px] p-3 flex flex-col justify-between">
        <div className="flex-1 flex items-end gap-1.5 overflow-x-auto pb-1">
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

            const modisH = Math.min(100, Math.round((modisVal / maxVal) * 100));
            const viirsH = Math.min(100, Math.round((viirsVal / maxVal) * 100));

            return (
              <button
                key={bin.bin_key}
                type="button"
                onClick={() => onSelectBin(bin.bin_key)}
                title={`${bin.label}: MODIS ${modisVal}, VIIRS ${viirsVal}`}
                className={`flex-1 min-w-[26px] h-full flex flex-col justify-end items-center rounded-xs px-0.5 pt-2 transition-colors ${
                  isSelected
                    ? 'bg-[var(--surface-3)] ring-1 ring-[var(--selected)]'
                    : isMissing
                    ? 'pattern-missing-coverage'
                    : 'hover:bg-[var(--surface-2)]'
                }`}
              >
                {!isMissing && breakdownMode === 'sensor' && (
                  <div className="w-full h-full flex items-end justify-center gap-0.5">
                    {(query.sensor === 'ALL' || query.sensor === 'MODIS') && (
                      <div
                        style={{ height: `${Math.max(modisVal > 0 ? 6 : 0, modisH)}%` }}
                        className="w-2.5 bg-[#FFB454] rounded-t-[1px] transition-all"
                      />
                    )}
                    {(query.sensor === 'ALL' || query.sensor === 'VIIRS') && (
                      <div
                        style={{ height: `${Math.max(viirsVal > 0 ? 6 : 0, viirsH)}%` }}
                        className="w-2.5 bg-[#61BDE0] rounded-t-[1px] transition-all"
                      />
                    )}
                  </div>
                )}

                {!isMissing && breakdownMode === 'platform' && (
                  <div className="w-full h-full flex items-end justify-center gap-[1px]">
                    {(['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'] as PlatformId[]).map(
                      (pid) => {
                        const pCount = bin.platform_breakdown[pid] ?? 0;
                        const pH = Math.min(100, Math.round((pCount / maxVal) * 100));
                        return (
                          <div
                            key={pid}
                            style={{
                              height: `${Math.max(pCount > 0 ? 6 : 0, pH)}%`,
                              backgroundColor: platformColors[pid],
                            }}
                            className="w-1.5 rounded-t-[1px]"
                          />
                        );
                      }
                    )}
                  </div>
                )}

                <span className="text-[9px] font-mono text-[var(--text-muted)] mt-1 truncate max-w-full">
                  {bin.bin_key.slice(-5)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scientific Caveat Footer (Section 7.5) */}
      <div className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
        <Info className="w-3.5 h-3.5 text-[var(--modis)] shrink-0 mt-0.5" />
        <span>
          <strong>Methodological note:</strong> VIIRS 375 m detects smaller and cooler thermal
          anomalies than MODIS 1 km and varies less across the scan swath (Li et al., 2018;
          Fu et al., 2020). Apparent series differences reflect sensor footprint, overpass timing,
          and platform availability (VIIRS S-NPP archive ends 2026-11-02) rather than calibrated
          changes in burned area.
        </span>
      </div>
    </section>
  );
};
