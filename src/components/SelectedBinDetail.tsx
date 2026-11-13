import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FileCode2,
  Flame,
  Info,
  ShieldCheck,
} from 'lucide-react';
import {
  CalendarAnalyticsResponse,
  CalendarBinRecord,
  CanonicalObservation,
} from '../types/firescope';

interface SelectedBinDetailProps {
  analytics: CalendarAnalyticsResponse;
  selectedBin: CalendarBinRecord;
  binObservations: CanonicalObservation[];
  selectedObservationId: string | null;
  onSelectObservation: (obs: CanonicalObservation) => void;
  onOpenMethodology: () => void;
  onOpenDataSources: () => void;
}

export const SelectedBinDetail: React.FC<SelectedBinDetailProps> = ({
  analytics,
  selectedBin,
  binObservations,
  selectedObservationId,
  onSelectObservation,
  onOpenMethodology,
  onOpenDataSources,
}) => {
  const [page, setPage] = useState(0);
  const pageSize = 8;

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
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] p-4 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[var(--ember)]" />
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
              Selected Time-Bin Detail · {selectedBin.label}
            </h2>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              UTC: {selectedBin.time_bin_start_utc.slice(0, 16).replace('T', ' ')} →{' '}
              {selectedBin.time_bin_end_utc.slice(0, 16).replace('T', ' ')}
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
            AOI: <strong className="text-[var(--text-primary)]">{analytics.aoi.name}</strong> (Local
            reference timezone: {analytics.aoi.timezone}). Active-fire detections represent thermal
            anomaly pixel records, not confirmed fire incidents.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[12px]">
          <button
            type="button"
            onClick={onOpenMethodology}
            className="px-2.5 py-1 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center gap-1.5"
          >
            <span>Method {analytics.method.id}</span>
            <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
          </button>
          <button
            type="button"
            onClick={onOpenDataSources}
            className="px-2.5 py-1 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center gap-1.5"
          >
            <Database className="w-3.5 h-3.5 text-[var(--viirs)]" />
            <span>Provenance &amp; Status</span>
          </button>
        </div>
      </div>

      {/* 3-Column Sensor, FRP, Confidence & Seasonal Baseline Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1: Sensor & Platform Split + Native Confidence */}
        <div className="p-3.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-3">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">
            Sensor &amp; Platform Composition
          </div>

          {/* MODIS */}
          <div className="space-y-1 pb-2.5 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                <span className="w-2.5 h-2.5 bg-[#FFB454] inline-block rounded-[1px]" />
                MODIS Detections (1 km C6.1)
              </span>
              <span className="font-mono font-semibold text-[#FFB454] tabular-nums">
                {selectedBin.values.MODIS !== null
                  ? selectedBin.values.MODIS.toLocaleString()
                  : 'No data'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
              <span>Terra: {selectedBin.platform_breakdown.TERRA}</span>
              <span>Aqua: {selectedBin.platform_breakdown.AQUA}</span>
            </div>
            <div className="text-[11px] font-mono text-[var(--text-muted)]">
              Native confidence (0–100): Low (0–29):{' '}
              {selectedBin.confidence_breakdown.MODIS_numeric_bins.low_0_29} · Nom (30–79):{' '}
              {selectedBin.confidence_breakdown.MODIS_numeric_bins.nominal_30_79} · High (80–100):{' '}
              {selectedBin.confidence_breakdown.MODIS_numeric_bins.high_80_100}
            </div>
          </div>

          {/* VIIRS */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                <span className="w-2.5 h-2.5 bg-[#61BDE0] inline-block rounded-full" />
                VIIRS Detections (375 m C2)
              </span>
              <span className="font-mono font-semibold text-[#61BDE0] tabular-nums">
                {selectedBin.values.VIIRS !== null
                  ? selectedBin.values.VIIRS.toLocaleString()
                  : 'No data'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
              <span>S-NPP: {selectedBin.platform_breakdown.SNPP}</span>
              <span>NOAA-20: {selectedBin.platform_breakdown.NOAA20}</span>
              <span>NOAA-21: {selectedBin.platform_breakdown.NOAA21}</span>
            </div>
            <div className="text-[11px] font-mono text-[var(--text-muted)]">
              Native C2 categorical: low: {selectedBin.confidence_breakdown.VIIRS_categorical.low} ·
              nominal: {selectedBin.confidence_breakdown.VIIRS_categorical.nominal} · high:{' '}
              {selectedBin.confidence_breakdown.VIIRS_categorical.high}
            </div>
          </div>
        </div>

        {/* Column 2: Observed FRP Summary (MW) — Separate per Sensor */}
        <div className="p-3.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              Observed FRP Summary · MW
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              Pixel-integrated power
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono tabular-nums">
            <div className="p-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] space-y-1">
              <div className="text-[#FFB454] font-semibold">MODIS FRP (MW)</div>
              <div>Sum: {modisFrp.sum_mw !== null ? `${modisFrp.sum_mw} MW` : 'N/A'}</div>
              <div>Mean: {modisFrp.mean_mw !== null ? `${modisFrp.mean_mw} MW` : 'N/A'}</div>
              <div>Median: {modisFrp.median_mw !== null ? `${modisFrp.median_mw} MW` : 'N/A'}</div>
              <div>P90: {modisFrp.p90_mw !== null ? `${modisFrp.p90_mw} MW` : 'N/A'}</div>
              <div className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                Valid: {modisFrp.valid_count} · Null: {modisFrp.null_count}
              </div>
            </div>

            <div className="p-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] space-y-1">
              <div className="text-[#61BDE0] font-semibold">VIIRS FRP (MW)</div>
              <div>Sum: {viirsFrp.sum_mw !== null ? `${viirsFrp.sum_mw} MW` : 'N/A'}</div>
              <div>Mean: {viirsFrp.mean_mw !== null ? `${viirsFrp.mean_mw} MW` : 'N/A'}</div>
              <div>Median: {viirsFrp.median_mw !== null ? `${viirsFrp.median_mw} MW` : 'N/A'}</div>
              <div>P90: {viirsFrp.p90_mw !== null ? `${viirsFrp.p90_mw} MW` : 'N/A'}</div>
              <div className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                Valid: {viirsFrp.valid_count} · Null: {viirsFrp.null_count}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-[var(--text-muted)] leading-snug">
            FRP is instantaneous radiative power in Megawatts (MW) at satellite overpass—never
            burned area or total fire perimeter.
          </div>
        </div>

        {/* Column 3: Processing Lifecycle & P1 Seasonal Baseline Comparison */}
        <div className="p-3.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              Provenance &amp; Seasonal Baseline
            </span>
            <ShieldCheck className="w-4 h-4 text-[var(--success)]" />
          </div>

          <div className="space-y-1 text-[11px] font-mono text-[var(--text-secondary)] pb-2.5 border-b border-[var(--border-subtle)]">
            <div>
              Processing State: STANDARD ({selectedBin.processing_breakdown.STANDARD}) · NRT (
              {selectedBin.processing_breakdown.NRT})
            </div>
            <div>
              QA Supersession: {selectedBin.quality.superseded_nrt_count} NRT record(s) superseded
              by Standard science-quality records
            </div>
            <div>
              Retrieved at: {analytics.provenance.retrieved_at_utc}
            </div>
          </div>

          {selectedBin.seasonal_baseline && (
            <div className="space-y-1.5 text-[11px]">
              <div className="font-medium text-[var(--text-primary)]">
                Historical Baseline Comparison (2024–2026)
              </div>
              <div className="font-mono text-[var(--text-secondary)]">
                MODIS: {selectedBin.seasonal_baseline.MODIS.status_label} (median{' '}
                {selectedBin.seasonal_baseline.MODIS.baseline_median}, MAD{' '}
                {selectedBin.seasonal_baseline.MODIS.baseline_mad}
                {selectedBin.seasonal_baseline.MODIS.robust_z !== null
                  ? `, z*=${selectedBin.seasonal_baseline.MODIS.robust_z}`
                  : ', MAD=0 fallback'}
                )
              </div>
              <div className="font-mono text-[var(--text-secondary)]">
                VIIRS: {selectedBin.seasonal_baseline.VIIRS.status_label} (median{' '}
                {selectedBin.seasonal_baseline.VIIRS.baseline_median}, MAD{' '}
                {selectedBin.seasonal_baseline.VIIRS.baseline_mad}
                {selectedBin.seasonal_baseline.VIIRS.robust_z !== null
                  ? `, z*=${selectedBin.seasonal_baseline.VIIRS.robust_z}`
                  : ', MAD=0 fallback'}
                )
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bounded Paginated Canonical Observations Table (M0_RAW) */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-[var(--viirs)]" />
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
              Canonical Hotspot Observation Records in Bin ({binObservations.length})
            </h3>
            <span className="text-[11px] text-[var(--text-muted)]">
              Click any row to open full M0_RAW Observation Inspector
            </span>
          </div>

          {binObservations.length > pageSize && (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous observation page"
                className="px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 text-[var(--text-primary)] flex items-center gap-1"
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
                className="px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 text-[var(--text-primary)] flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {binObservations.length === 0 ? (
          <div className="p-6 rounded-[6px] bg-[var(--app-bg)] border border-[var(--border-subtle)] text-center space-y-1">
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              {selectedBin.coverage_state === 'NO_SOURCE_DATA'
                ? 'No source data available for this period/platform selection'
                : 'No detections in available records for this time bin'}
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {selectedBin.quality.coverage_note}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[6px] border border-[var(--border-subtle)]">
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
                          : 'bg-[var(--app-bg)]/60 hover:bg-[var(--surface-2)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                        {obs.observation_id}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={
                            obs.sensor === 'MODIS'
                              ? 'text-[#FFB454] font-semibold'
                              : 'text-[#61BDE0] font-semibold'
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
