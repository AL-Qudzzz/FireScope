import React from 'react';
import {
  CheckCircle2,
  Crosshair,
  Database,
  Flame,
  ShieldAlert,
  X,
} from 'lucide-react';
import { CanonicalObservation } from '../types/firescope';

interface ObservationInspectorProps {
  observation: CanonicalObservation | null;
  onClose: () => void;
}

export const ObservationInspector: React.FC<ObservationInspectorProps> = ({
  observation,
  onClose,
}) => {
  if (!observation) return null;

  const isModis = observation.sensor === 'MODIS';

  return (
    <aside
      aria-label="Hotspot Observation Inspector"
      data-testid="observation-inspector"
      className="w-[380px] max-w-[94vw] bg-[var(--surface-1)] border-l border-[var(--border-subtle)] h-full flex flex-col justify-between z-30 shadow-2xl overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 inline-block ${
                  isModis ? 'bg-[#FFB454] rounded-[1px]' : 'bg-[#61BDE0] rounded-full'
                }`}
              />
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Hotspot Observation Inspector
              </h2>
            </div>
            <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5 break-all">
              {observation.observation_id}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Observation Inspector"
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scientific Non-Claim Banner (Section 8) */}
        <div className="p-2.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
          <ShieldAlert className="w-4 h-4 text-[var(--modis)] shrink-0 mt-0.5" />
          <div>
            <strong className="text-[var(--text-primary)]">Active-fire detection record:</strong>{' '}
            Coordinates represent the associated satellite pixel center ({observation.scan_native ?? '—'}{' '}
            km × {observation.track_native ?? '—'} km footprint), not an exact flame ignition point
            or confirmed incident perimeter.
          </div>
        </div>

        {/* Live NASA EONET v3 Event Card (if observation originates from NASA EONET Live API) */}
        {observation.source_product === 'NASA_EONET_V3_LIVE' && (
          <div className="p-3 rounded-[6px] bg-[var(--surface-2)] border border-[var(--success)]/50 space-y-1.5 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold text-[var(--success)] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--success)] inline-block" />
                <span>LIVE NASA EONET v3 WILDFIRE</span>
              </span>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                {String(observation.raw_attributes.eonet_event_id ?? '')}
              </span>
            </div>
            <div className="font-semibold text-[var(--text-primary)]">
              {String(observation.raw_attributes.eonet_title ?? 'Active Wildfire Event')}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono text-[var(--text-secondary)]">
              <div>
                Agency: <strong className="text-[var(--text-primary)]">{String(observation.raw_attributes.eonet_source_id ?? 'NASA')}</strong>
              </div>
              <div>
                Reported Size: <strong className="text-[var(--text-primary)]">{String(observation.raw_attributes.eonet_magnitude ?? 'N/A')}</strong>
              </div>
            </div>
            {observation.raw_attributes.eonet_source_url && (
              <div className="pt-1">
                <a
                  href={String(observation.raw_attributes.eonet_source_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[var(--viirs)] hover:underline font-mono break-all"
                >
                  Source Event Link →
                </a>
              </div>
            )}
          </div>
        )}

        {/* Core Canonical Attributes */}
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">
            Canonical Observation Fields (M0_RAW)
          </h3>
          <div className="rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-[12px]">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Sensor / Instrument</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {observation.sensor} ({observation.instrument})
              </span>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Platform</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {observation.platform}
              </span>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Pixel Center (WGS84)</span>
              <span className="font-mono text-[var(--text-primary)] tabular-nums">
                {observation.latitude.toFixed(4)}°, {observation.longitude.toFixed(4)}°
              </span>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Acquisition Time (UTC)</span>
              <span className="font-mono text-[var(--text-primary)] tabular-nums">
                {observation.acq_datetime_utc}
              </span>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Native Date / HHMM</span>
              <span className="font-mono text-[var(--text-secondary)] tabular-nums">
                {observation.acq_date} · {observation.acq_time_native}
              </span>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Native Confidence</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {String(observation.confidence_native)} ({observation.confidence_scheme})
              </span>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Observed FRP</span>
              <span className="font-mono font-semibold text-[var(--ember)] tabular-nums">
                {observation.frp_mw !== null
                  ? `${observation.frp_mw.toFixed(2)} MW`
                  : 'Unavailable (null)'}
              </span>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Scan × Track Footprint</span>
              <span className="font-mono text-[var(--text-primary)] tabular-nums">
                {observation.scan_native !== null ? `${observation.scan_native} km` : '—'} ×{' '}
                {observation.track_native !== null ? `${observation.track_native} km` : '—'}
              </span>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Day / Night Flag</span>
              <span className="font-mono text-[var(--text-primary)]">
                {observation.daynight_native === 'D'
                  ? 'D (Daytime Overpass)'
                  : observation.daynight_native === 'N'
                  ? 'N (Nighttime Overpass)'
                  : 'Unavailable'}
              </span>
            </div>
          </div>
        </div>

        {/* Sensor-Specific Native Brightness Temperatures */}
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">
            Native Thermal Channel Attributes
          </h3>
          <div className="rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-[12px]">
            {isModis ? (
              <>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">
                    MODIS Brightness (Ch 21/22)
                  </span>
                  <span className="font-mono text-[var(--text-primary)] tabular-nums">
                    {observation.brightness_native !== null
                      ? `${observation.brightness_native} K`
                      : 'Unavailable'}
                  </span>
                </div>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">MODIS Band 31 (bright_t31)</span>
                  <span className="font-mono text-[var(--text-primary)] tabular-nums">
                    {observation.bright_t31_native !== null
                      ? `${observation.bright_t31_native} K`
                      : 'Unavailable'}
                  </span>
                </div>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Inferred Type (MCD14ML)</span>
                  <span className="font-mono text-[var(--text-primary)]">
                    {observation.type_native === 0
                      ? '0 (Presumed vegetation fire)'
                      : observation.type_native !== null
                      ? String(observation.type_native)
                      : 'Unavailable in NRT'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">
                    VIIRS I-Band 4 (bright_ti4)
                  </span>
                  <span className="font-mono text-[var(--text-primary)] tabular-nums">
                    {observation.bright_ti4_native !== null
                      ? `${observation.bright_ti4_native} K`
                      : 'Unavailable'}
                  </span>
                </div>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">
                    VIIRS I-Band 5 (bright_ti5)
                  </span>
                  <span className="font-mono text-[var(--text-primary)] tabular-nums">
                    {observation.bright_ti5_native !== null
                      ? `${observation.bright_ti5_native} K`
                      : 'Unavailable'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Product, Processing & Checksum Provenance */}
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">
            Source &amp; Processing Provenance
          </h3>
          <div className="rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] p-3 space-y-1.5 text-[11px] font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Source Product:</span>
              <span className="text-[var(--text-primary)]">{observation.source_product}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Collection:</span>
              <span className="text-[var(--text-primary)]">{observation.collection}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Processing Status:</span>
              <span className="text-[var(--text-primary)]">
                {observation.processing_status} (version {observation.processing_version})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Retrieved At (UTC):</span>
              <span className="text-[var(--text-primary)]">
                {observation.source_retrieved_at_utc}
              </span>
            </div>
            <div className="pt-1.5 border-t border-[var(--border-subtle)]">
              <div className="text-[var(--text-secondary)]">Immutable File SHA-256 Checksum:</div>
              <div className="text-[10px] text-[var(--text-muted)] break-all mt-0.5">
                {observation.source_file_checksum}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-2)]/40 text-[11px] text-[var(--text-muted)] flex items-center justify-between">
        <span>Source Row #{observation.source_row_number ?? '—'}</span>
        <span>WGS84 / UTC Canonical Schema</span>
      </div>
    </aside>
  );
};
