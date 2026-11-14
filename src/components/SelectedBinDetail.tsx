import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FileCode2,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import {
  CalendarAnalyticsResponse,
  CalendarBinRecord,
  CanonicalObservation,
} from '../types/firescope';
import { InfoPopover } from './ProgressiveDisclosure';

interface SelectedBinDetailProps {
  analytics: CalendarAnalyticsResponse;
  selectedBin: CalendarBinRecord;
  binObservations: CanonicalObservation[];
  totalMatchingObservations?: number;
  isLoadingObservations?: boolean;
  selectedObservationId: string | null;
  onSelectObservation: (obs: CanonicalObservation) => void;
  onOpenMethodology: () => void;
  onOpenDataSources: () => void;
}

export const SelectedBinDetail: React.FC<SelectedBinDetailProps> = ({
  analytics,
  selectedBin,
  binObservations,
  totalMatchingObservations,
  isLoadingObservations = false,
  selectedObservationId,
  onSelectObservation,
  onOpenMethodology,
  onOpenDataSources,
}) => {
  const [page, setPage] = useState(0);
  const pageSize = 8;

  useEffect(() => {
    setPage(0);
  }, [selectedBin.bin_key]);

  const totalPages = Math.max(1, Math.ceil(binObservations.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = binObservations.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  const modisFrp = selectedBin.frp_summary.MODIS;
  const viirsFrp = selectedBin.frp_summary.VIIRS;

  return (
    <section
      aria-label="Selected Time-Bin Detail and Provenance"
      data-testid="selected-bin-detail"
      aria-busy={isLoadingObservations}
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md p-4 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center gap-2">
          <Flame className="w-4 h-4 text-[var(--ember)]" />
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
            Selected Time-Bin Detail · {selectedBin.label}
          </h2>
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            UTC: {selectedBin.time_bin_start_utc.slice(0, 16).replace('T', ' ')} →{' '}
            {selectedBin.time_bin_end_utc.slice(0, 16).replace('T', ' ')}
          </span>
          <InfoPopover title="About Time-Bin Detections" triggerLabel="What is a detection?">
            <div className="space-y-1">
              <p>
                AOI: <strong className="text-[var(--text-primary)]">{analytics.aoi.name}</strong>{' '}
                (local reference timezone: {analytics.aoi.timezone}).
              </p>
              <p>
                Active-fire detections represent thermal anomaly pixel records at satellite overpass
                time—not confirmed fire incidents, perimeters, or burned-area measurements.
              </p>
            </div>
          </InfoPopover>
        </div>

        <div className="flex items-center gap-2 text-[12px]">
          <button
            type="button"
            onClick={onOpenMethodology}
            className="px-2.5 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
          >
            <span>Methodology</span>
            <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
          </button>
          <button
            type="button"
            onClick={onOpenDataSources}
            className="px-2.5 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-[var(--viirs)]" />
            <span>Provenance &amp; Status</span>
          </button>
        </div>
      </div>

      {/* Flat 3-Column Field Atlas Specification Grid (1px Hairlines, No Nested Card-in-Card) */}
      <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)]/30 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
        {/* Column 1: Sensor & Platform Split + Native Confidence */}
        <div className="p-4 flex flex-col justify-between gap-3">
          <div className="space-y-3">
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">
              Sensor &amp; Platform Composition
            </div>

            {/* MODIS */}
            <div className="space-y-1 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                  <span className="w-2.5 h-2.5 bg-[var(--modis-fill)] inline-block rounded-[1px]" />
                  MODIS Detections (1 km C6.1)
                </span>
                <span className="font-mono font-semibold text-[var(--modis)] tabular-nums">
                  {selectedBin.values.MODIS !== null
                    ? selectedBin.values.MODIS.toLocaleString()
                    : 'No data'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
                <span>Terra: {selectedBin.platform_breakdown.TERRA.toLocaleString()}</span>
                <span>Aqua: {selectedBin.platform_breakdown.AQUA.toLocaleString()}</span>
              </div>
            </div>

            {/* VIIRS */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                  <span className="w-2.5 h-2.5 bg-[var(--viirs-fill)] inline-block rounded-full" />
                  VIIRS Detections (375 m C2)
                </span>
                <span className="font-mono font-semibold text-[var(--viirs)] tabular-nums">
                  {selectedBin.values.VIIRS !== null
                    ? selectedBin.values.VIIRS.toLocaleString()
                    : 'No data'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
                <span>S-NPP: {selectedBin.platform_breakdown.SNPP.toLocaleString()}</span>
                <span>NOAA-20: {selectedBin.platform_breakdown.NOAA20.toLocaleString()}</span>
                <span>NOAA-21: {selectedBin.platform_breakdown.NOAA21.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <InfoPopover
              title="Native Sensor Confidence Breakdown"
              triggerLabel="Confidence breakdown"
            >
              <div className="space-y-1.5">
                <p>
                  MODIS numeric confidence (0–100) and VIIRS Collection 2 categorical confidence
                  are preserved natively and are not equivalent across sensors.
                </p>
                <div className="font-mono text-[10px] text-[var(--text-primary)]">
                  <span className="text-[var(--modis)] font-semibold">MODIS (0–100):</span> Low
                  (0–29): {selectedBin.confidence_breakdown.MODIS_numeric_bins.low_0_29} · Nom
                  (30–79): {selectedBin.confidence_breakdown.MODIS_numeric_bins.nominal_30_79} ·
                  High (80–100): {selectedBin.confidence_breakdown.MODIS_numeric_bins.high_80_100}
                </div>
                <div className="font-mono text-[10px] text-[var(--text-primary)]">
                  <span className="text-[var(--viirs)] font-semibold">VIIRS C2 cat:</span> low:{' '}
                  {selectedBin.confidence_breakdown.VIIRS_categorical.low} · nominal:{' '}
                  {selectedBin.confidence_breakdown.VIIRS_categorical.nominal} · high:{' '}
                  {selectedBin.confidence_breakdown.VIIRS_categorical.high}
                </div>
              </div>
            </InfoPopover>
          </div>
        </div>

        {/* Column 2: Observed FRP Summary (MW) — Side-by-Side Hairline Ledger */}
        <div className="p-4 flex flex-col justify-between gap-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                Observed FRP Summary · MW
              </span>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                Pixel-integrated
              </span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)] text-[11px] font-mono tabular-nums">
              <div className="pr-3 space-y-1 text-[var(--text-secondary)]">
                <div className="text-[var(--modis)] font-semibold pb-0.5">MODIS FRP</div>
                <div>
                  Sum:{' '}
                  <strong className="text-[var(--text-primary)]">
                    {modisFrp.sum_mw !== null ? `${modisFrp.sum_mw} MW` : 'N/A'}
                  </strong>
                </div>
                <div>
                  Mean:{' '}
                  <strong className="text-[var(--text-primary)]">
                    {modisFrp.mean_mw !== null ? `${modisFrp.mean_mw} MW` : 'N/A'}
                  </strong>
                </div>
              </div>

              <div className="pl-3 space-y-1 text-[var(--text-secondary)]">
                <div className="text-[var(--viirs)] font-semibold pb-0.5">VIIRS FRP</div>
                <div>
                  Sum:{' '}
                  <strong className="text-[var(--text-primary)]">
                    {viirsFrp.sum_mw !== null ? `${viirsFrp.sum_mw} MW` : 'N/A'}
                  </strong>
                </div>
                <div>
                  Mean:{' '}
                  <strong className="text-[var(--text-primary)]">
                    {viirsFrp.mean_mw !== null ? `${viirsFrp.mean_mw} MW` : 'N/A'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <InfoPopover title="Detailed FRP Statistics (MW)" triggerLabel="More FRP stats">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 font-mono text-[10px] text-[var(--text-primary)]">
                  <div className="space-y-0.5">
                    <div className="text-[var(--modis)] font-semibold">MODIS</div>
                    <div>
                      Median:{' '}
                      {modisFrp.median_mw !== null
                        ? `${modisFrp.median_mw} MW`
                        : modisFrp.valid_count > 0
                        ? 'N/A (daily agg)'
                        : 'N/A'}
                    </div>
                    <div>
                      P90:{' '}
                      {modisFrp.p90_mw !== null
                        ? `${modisFrp.p90_mw} MW`
                        : modisFrp.valid_count > 0
                        ? 'N/A (daily agg)'
                        : 'N/A'}
                    </div>
                    {modisFrp.max_mw !== null && modisFrp.max_mw !== undefined && (
                      <div>Max: {modisFrp.max_mw} MW</div>
                    )}
                    <div className="text-[var(--text-muted)]">
                      Valid: {modisFrp.valid_count.toLocaleString()} · Null: {modisFrp.null_count}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[var(--viirs)] font-semibold">VIIRS</div>
                    <div>
                      Median:{' '}
                      {viirsFrp.median_mw !== null
                        ? `${viirsFrp.median_mw} MW`
                        : viirsFrp.valid_count > 0
                        ? 'N/A (daily agg)'
                        : 'N/A'}
                    </div>
                    <div>
                      P90:{' '}
                      {viirsFrp.p90_mw !== null
                        ? `${viirsFrp.p90_mw} MW`
                        : viirsFrp.valid_count > 0
                        ? 'N/A (daily agg)'
                        : 'N/A'}
                    </div>
                    {viirsFrp.max_mw !== null && viirsFrp.max_mw !== undefined && (
                      <div>Max: {viirsFrp.max_mw} MW</div>
                    )}
                    <div className="text-[var(--text-muted)]">
                      Valid: {viirsFrp.valid_count.toLocaleString()} · Null: {viirsFrp.null_count}
                    </div>
                  </div>
                </div>
                <p className="pt-1.5 border-t border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  FRP is instantaneous radiative power (MW) at satellite overpass—never burned area
                  or fire perimeter.
                </p>
              </div>
            </InfoPopover>
          </div>
        </div>

        {/* Column 3: Processing Lifecycle & Seasonal Baseline */}
        <div className="p-4 flex flex-col justify-between gap-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                Provenance &amp; Seasonal Baseline
              </span>
              <ShieldCheck className="w-4 h-4 text-[var(--success)]" />
            </div>

            <div className="text-[11px] font-mono text-[var(--text-secondary)] pb-3 border-b border-[var(--border-subtle)]">
              Processing: STANDARD ({selectedBin.processing_breakdown.STANDARD}) · NRT (
              {selectedBin.processing_breakdown.NRT})
            </div>

            {selectedBin.seasonal_baseline &&
              (() => {
                const modisYears = selectedBin.seasonal_baseline.MODIS.baseline_years;
                const viirsYears = selectedBin.seasonal_baseline.VIIRS.baseline_years;
                const allYears = Array.from(new Set([...modisYears, ...viirsYears]));
                const heading =
                  allYears.length > 0
                    ? `Seasonal Baseline (${Math.min(...allYears)}–${Math.max(...allYears)}, ${allYears.length} yr)`
                    : 'Seasonal Baseline';
                return (
                  <div className="space-y-1.5 text-[11px]">
                    <div className="font-medium text-[var(--text-primary)]">{heading}</div>
                    <div className="font-mono text-[var(--text-secondary)]">
                      MODIS: {selectedBin.seasonal_baseline.MODIS.status_label}
                    </div>
                    <div className="font-mono text-[var(--text-secondary)]">
                      VIIRS: {selectedBin.seasonal_baseline.VIIRS.status_label}
                    </div>
                  </div>
                );
              })()}
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-end">
            <InfoPopover
              title="Provenance & Baseline Formula"
              triggerLabel="Baseline & QA details"
              align="right"
            >
              <div className="space-y-1.5">
                <div className="font-mono text-[10px] space-y-1 text-[var(--text-primary)]">
                  <div>
                    QA Supersession: {selectedBin.quality.superseded_nrt_count} NRT record(s)
                    superseded by Standard science-quality records
                  </div>
                  <div>Retrieved at: {analytics.provenance.retrieved_at_utc}</div>
                </div>
                {selectedBin.seasonal_baseline &&
                  (() => {
                    const formatDetail = (
                      label: string,
                      stat: NonNullable<CalendarBinRecord['seasonal_baseline']>['MODIS']
                    ) => {
                      if (
                        stat.baseline_years.length === 0 ||
                        stat.status_label === 'Baseline unavailable (insufficient history)'
                      ) {
                        return `${label}: ${stat.status_label}`;
                      }
                      return `${label}: median ${stat.baseline_median}, MAD ${stat.baseline_mad}${
                        stat.robust_z !== null ? `, z*=${stat.robust_z}` : ', MAD=0 fallback'
                      }`;
                    };
                    const caveatText =
                      selectedBin.seasonal_baseline.VIIRS.caveat_note ||
                      selectedBin.seasonal_baseline.MODIS.caveat_note;
                    const formulaText =
                      selectedBin.seasonal_baseline.VIIRS.method_formula ||
                      selectedBin.seasonal_baseline.MODIS.method_formula;
                    return (
                      <div className="pt-1.5 border-t border-[var(--border-subtle)] space-y-1">
                        <div className="font-mono text-[10px] text-[var(--text-primary)]">
                          {formatDetail('MODIS', selectedBin.seasonal_baseline.MODIS)}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--text-primary)]">
                          {formatDetail('VIIRS', selectedBin.seasonal_baseline.VIIRS)}
                        </div>
                        {formulaText && (
                          <div className="font-mono text-[10px] text-[var(--text-muted)]">
                            {formulaText}
                          </div>
                        )}
                        {caveatText && (
                          <p className="text-[10px] text-[var(--text-secondary)] leading-snug">
                            {caveatText}
                          </p>
                        )}
                      </div>
                    );
                  })()}
              </div>
            </InfoPopover>
          </div>
        </div>
      </div>

      {/* Bounded Paginated Observation Records Table */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <FileCode2 className="w-4 h-4 text-[var(--viirs)]" />
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {totalMatchingObservations !== undefined &&
              totalMatchingObservations > binObservations.length
                ? `Observation Records in Selected Time Bin (${binObservations.length.toLocaleString()} of ${totalMatchingObservations.toLocaleString()})`
                : `Observation Records in Selected Time Bin (${binObservations.length.toLocaleString()})`}
            </h3>
          </div>

          {binObservations.length > pageSize && (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous observation page"
                className="px-2.5 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <span className="text-[var(--text-secondary)]">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                aria-label="Next observation page"
                className="px-2.5 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {isLoadingObservations ? (
          <div className="rounded border border-[var(--border-subtle)] p-3 space-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-7 w-full rounded atlas-skeleton" />
            ))}
          </div>
        ) : binObservations.length === 0 ? (
          <div className="p-6 rounded bg-[var(--surface-2)]/50 border border-[var(--border-subtle)] text-center space-y-1">
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              {selectedBin.coverage_state === 'NO_SOURCE_DATA'
                ? 'No source records available for this time period and platform filter'
                : 'No detections in available records for this time bin'}
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {selectedBin.quality.coverage_note}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-[var(--border-subtle)]">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-[var(--surface-2)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-medium">
                  <th className="py-2 px-3">Observation ID</th>
                  <th className="py-2 px-3">Sensor / Platform</th>
                  <th className="py-2 px-3">Acquisition (UTC)</th>
                  <th className="py-2 px-3 text-right">Pixel Center (WGS84)</th>
                  <th className="py-2 px-3 text-right">Native Confidence</th>
                  <th className="py-2 px-3 text-right">FRP (MW)</th>
                  <th className="py-2 px-3 text-right">Footprint (km)</th>
                  <th className="py-2 px-3">Processing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono tabular-nums">
                {pageItems.map((obs) => {
                  const isSelected = obs.observation_id === selectedObservationId;
                  return (
                    <tr
                      key={obs.observation_id}
                      onClick={() => onSelectObservation(obs)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                          : 'bg-[var(--surface-1)] hover:bg-[var(--surface-2)]/70 text-[var(--text-secondary)]'
                      }`}
                    >
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                        {obs.observation_id}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={
                            obs.sensor === 'MODIS'
                              ? 'text-[var(--modis)] font-semibold'
                              : 'text-[var(--viirs)] font-semibold'
                          }
                        >
                          {obs.sensor}
                        </span>{' '}
                        · {obs.platform}
                      </td>
                      <td className="py-2 px-3">{obs.acq_datetime_utc}</td>
                      <td className="py-2 px-3 text-right">
                        {obs.latitude.toFixed(4)}°, {obs.longitude.toFixed(4)}°
                      </td>
                      <td className="py-2 px-3 text-right">
                        {obs.sensor === 'MODIS'
                          ? `${obs.confidence_native} (0–100)`
                          : `${obs.confidence_native} (C2 cat)`}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-[var(--text-primary)]">
                        {obs.frp_mw !== null ? `${obs.frp_mw.toFixed(1)} MW` : 'Unavailable'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {obs.scan_native ?? '—'} × {obs.track_native ?? '—'}
                      </td>
                      <td className="py-2 px-3">
                        {obs.processing_status} ({obs.processing_version})
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
