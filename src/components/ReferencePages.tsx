import React from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  FileCheck2,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { DataStatusResponse } from '../types/firescope';

export const DataSourcesView: React.FC<{ dataStatus: DataStatusResponse }> = ({
  dataStatus,
}) => {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Page Title */}
      <div className="pb-4 border-b border-[var(--border-subtle)] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--text-primary)]">
            Data Sources, Platform Continuity &amp; Raw Archive Provenance
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1 max-w-3xl">
            Dynamic status of active-fire satellite products, processing lifecycles, and
            checksum-verified archive snapshots powering FireScope.
          </p>
        </div>

        <div className="p-3 rounded-[6px] bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-[11px] space-y-1">
          <div className="flex justify-between gap-6">
            <span className="text-[var(--text-secondary)]">Latest Acquisition (UTC):</span>
            <span className="text-[var(--text-primary)] font-semibold">
              {dataStatus.latest_acquisition_utc}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-[var(--text-secondary)]">Last Retrieved At (UTC):</span>
            <span className="text-[var(--text-primary)] font-semibold">
              {dataStatus.retrieved_at_utc}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-[var(--text-secondary)]">Data Mode:</span>
            <span className="text-[var(--warning)] font-semibold">
              {dataStatus.data_mode}
            </span>
          </div>
        </div>
      </div>

      {/* 4-Concept Source Status Distinction Strip (Section 9.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            01. Latest Acquisition
          </div>
          <div className="text-[14px] font-mono font-semibold text-[var(--text-primary)]">
            {dataStatus.latest_acquisition_utc}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Newest satellite overpass timestamp represented in the loaded observation records.
          </p>
        </div>

        <div className="p-3.5 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            02. Retrieved At
          </div>
          <div className="text-[14px] font-mono font-semibold text-[var(--text-primary)]">
            {dataStatus.retrieved_at_utc}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            When FireScope last fetched and verified the NASA FIRMS source snapshot.
          </p>
        </div>

        <div className="p-3.5 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            03. Processing Lifecycle
          </div>
          <div className="text-[14px] font-mono font-semibold text-[var(--text-primary)]">
            STANDARD + NRT (~{dataStatus.firms_area_api_constraints.nrt_to_standard_lag_months}mo lag)
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Standard science-quality records supersede NRT records without double counting.
          </p>
        </div>

        <div className="p-3.5 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            04. Platform Continuity
          </div>
          <div className="text-[14px] font-mono font-semibold text-[var(--warning)]">
            4 Active · 1 Historical Gap
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            VIIRS S-NPP archive listed through 2026-11-02; Terra, Aqua, NOAA-20 &amp; NOAA-21 active.
          </p>
        </div>
      </div>

      {/* Platform Continuity Registry Table */}
      <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Satellite Platform Continuity Registry
            </h2>
            <p className="text-[12px] text-[var(--text-secondary)]">
              Checked against NASA FIRMS Archive coverage (2026-11-13). Never interpret a platform
              archive gap as a decline in physical fire activity.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[6px] border border-[var(--border-subtle)]">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="bg-[var(--surface-2)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
                <th className="py-2.5 px-3">Platform</th>
                <th className="py-2.5 px-3">Sensor / Collection</th>
                <th className="py-2.5 px-3">Product Code</th>
                <th className="py-2.5 px-3">Nominal Resolution</th>
                <th className="py-2.5 px-3">Archive Coverage Window</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Operational Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {dataStatus.platforms.map((p) => (
                <tr key={p.platform_id} className="hover:bg-[var(--surface-2)]/60">
                  <td className="py-2.5 px-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 inline-block ${
                          p.sensor === 'MODIS'
                            ? 'bg-[#FFB454] rounded-[1px]'
                            : 'bg-[#61BDE0] rounded-full'
                        }`}
                      />
                      {p.display_name}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                    {p.sensor} · {p.collection}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                    {p.product_code}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text-primary)] whitespace-nowrap">
                    {p.nominal_resolution}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text-primary)] whitespace-nowrap">
                    {p.first_observation_date} → {p.last_observation_date}
                  </td>
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                    {p.status === 'ACTIVE' ? (
                      <span className="text-[var(--success)] font-semibold">● ACTIVE</span>
                    ) : (
                      <span className="text-[var(--warning)] font-semibold">
                        ▲ NO_RECENT_DATA
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[var(--text-secondary)]">
                    {p.status_note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Immutable Raw Archive Manifest (SHA-256) */}
      <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-[var(--success)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Immutable Raw Archive Manifest &amp; SHA-256 Checksums
          </h2>
        </div>
        <p className="text-[12px] text-[var(--text-secondary)]">
          Raw source files are never mutated. Canonical records preserve original CSV row numbers
          and SHA-256 digests for full audit traceability.
        </p>

        <div className="overflow-x-auto rounded-[6px] border border-[var(--border-subtle)]">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="bg-[var(--surface-2)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
                <th className="py-2 px-3">Filename</th>
                <th className="py-2 px-3">Product / Collection</th>
                <th className="py-2 px-3">Platform</th>
                <th className="py-2 px-3">Processing</th>
                <th className="py-2 px-3 text-right">Records</th>
                <th className="py-2 px-3">SHA-256 Checksum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
              {dataStatus.raw_archive_manifest.map((m) => (
                <tr key={m.file_id} className="hover:bg-[var(--surface-2)]/60">
                  <td className="py-2 px-3 text-[var(--text-primary)]">{m.filename}</td>
                  <td className="py-2 px-3 text-[var(--text-secondary)]">
                    {m.source_product} ({m.collection})
                  </td>
                  <td className="py-2 px-3 text-[var(--text-primary)]">{m.platform}</td>
                  <td className="py-2 px-3 text-[var(--text-secondary)]">
                    {m.processing_status}
                  </td>
                  <td className="py-2 px-3 text-right text-[var(--text-primary)] tabular-nums">
                    {m.row_count}
                  </td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">
                    {m.sha256_checksum.slice(0, 24)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export const MethodologyView: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <h1 className="text-[20px] font-semibold text-[var(--text-primary)]">
          Harmonization Methodology, Method Levels &amp; Scientific Limitations
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1 max-w-3xl">
          How FireScope aligns MODIS Collection 6.1 and VIIRS Collection 2 active-fire observations
          into common spatial and temporal bins without erasing sensor differences or inventing
          unvalidated conversions.
        </p>
      </div>

      {/* Method Levels M0 - M3 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            id: 'M0_RAW',
            status: 'Implemented (Inspector & Records)',
            title: 'Source Observations',
            desc: 'Exact NASA FIRMS records preserving native coordinates, UTC HHMM time, scan/track footprint, native confidence scheme, and SHA-256 file provenance.',
          },
          {
            id: 'M1_AGGREGATED',
            status: 'Implemented (MVP Baseline)',
            title: 'Common AOI & Time Bins',
            desc: 'Identical WGS84 AOI boundary and UTC time-bin aggregation (Day/Week/Month) computed separately per sensor and platform.',
          },
          {
            id: 'M2_COMPARATIVE',
            status: 'Implemented (Default Compare View)',
            title: 'Side-by-Side Comparison',
            desc: 'Synchronized multi-sensor display with independent scales, platform breakdowns, and explicit data-availability states without uncalibrated scaling.',
          },
          {
            id: 'M3_HARMONIZED',
            status: 'Gated Research Extension',
            title: 'Validated Cross-Sensor Operator',
            desc: 'Physical FRP observation operator (Sofiev & Kouznetsov, 2026) requiring view-zenith, pixel-area, and cloud-mask inputs not fully present in point CSVs.',
          },
        ].map((m) => (
          <div
            key={m.id}
            className="p-4 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] font-semibold text-[var(--ember)]">
                {m.id}
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">{m.status}</span>
            </div>
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{m.title}</h2>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{m.desc}</p>
          </div>
        ))}
      </section>

      {/* Sensor Comparison Table */}
      <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] p-4 space-y-3">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Why Direct Pooling Is Unsafe: MODIS C6.1 vs. VIIRS 375 m C2
        </h2>
        <div className="overflow-x-auto rounded-[6px] border border-[var(--border-subtle)]">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="bg-[var(--surface-2)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
                <th className="py-2 px-3">Characteristic</th>
                <th className="py-2 px-3 text-[#FFB454]">MODIS Collection 6.1</th>
                <th className="py-2 px-3 text-[#61BDE0]">VIIRS 375 m Collection 2</th>
                <th className="py-2 px-3">FireScope Harmonization Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <tr>
                <td className="py-2 px-3 font-medium text-[var(--text-primary)]">Platforms</td>
                <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                  Terra (2000–present), Aqua (2002–present)
                </td>
                <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                  Suomi-NPP (2012–2026-11-02), NOAA-20 (2018–), NOAA-21 (2023–)
                </td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">
                  Retain platform identity; annotate S-NPP archive end date (2026-11-02).
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                  Nominal Nadir Sampling &amp; Swath Growth
                </td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">
                  ~1 km at nadir; pixel area grows substantially at high view zenith angle (Li et
                  al., 2018).
                </td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">
                  ~375 m (I-bands) with sub-pixel M13 FRP retrieval; more consistent across swath.
                </td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">
                  Preserve native `scan` and `track` dimensions; never equate raw detection counts.
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                  Native Confidence Semantics
                </td>
                <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                  Numeric 0–100 (`MODIS_NUMERIC_0_100`)
                </td>
                <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                  Categorical `low`, `nominal`, `high` (`VIIRS_C2_CATEGORICAL`)
                </td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">
                  Never map MODIS numeric values to VIIRS categories or synthetic probabilities.
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                  Minimum Clear-Sky FRP Detection Limit
                </td>
                <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                  ~5.7 MW day / ~3.7 MW night (nadir clear-sky)
                </td>
                <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                  ~3.7 MW day / ~0.7 MW night (nadir clear-sky)
                </td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">
                  Report FRP statistics in MW separately per sensor with valid-record counts.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Core Equations & Guardrails */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            M1/M2 Bin Aggregation &amp; Lifecycle Supersession
          </h3>
          <div className="p-2.5 rounded bg-[var(--app-bg)] font-mono text-[12px] text-[var(--text-primary)]">
            N_&#123;s,p&#125;(A, t) = Σ_i 1(x_i ∈ A, τ_i ∈ t, s_i = s, p_i = p)
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
            Observations are filtered in WGS84 and binned in UTC. Exact ingestion duplicates are
            removed, and when both NRT and Standard science-quality records exist for the same
            observation identity, Standard supersedes NRT to prevent double counting.
          </p>
        </div>

        <div className="p-4 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Historical Seasonal Baseline (P1 Robust Anomaly)
          </h3>
          <div className="p-2.5 rounded bg-[var(--app-bg)] font-mono text-[12px] text-[var(--text-primary)]">
            robust_z = (x - median_baseline) / (1.4826 × MAD_baseline)
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
            Compares like-for-like seasonal windows per sensor. When `MAD_baseline = 0`, FireScope
            uses a non-parametric percentile and delta fallback rather than dividing by zero.
            Findings are labeled strictly as <em>“Unusual relative to this baseline”</em>, never as
            fire predictions.
          </p>
        </div>
      </div>
    </div>
  );
};

export const AboutView: React.FC<{ dataStatus?: DataStatusResponse }> = ({
  dataStatus,
}) => {
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <h1 className="text-[20px] font-semibold text-[var(--text-primary)]">
          About FireScope &amp; NASA Data Attribution
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          Built for the NASA Space Apps Challenge — Harmonization of MODIS and VIIRS Hot Spots.
        </p>
      </div>

      {/* Live NASA FIRMS + Archive Baseline Notice */}
      <div className="p-4 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-3 text-[13px] text-[var(--text-secondary)] leading-relaxed">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Database className="w-4 h-4 text-[var(--ember)]" />
            <span>Data Architecture: Live NASA FIRMS Active-Fire Streams &amp; Archive Baseline</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--success)]/45 font-mono text-[11px] font-semibold text-[var(--success)]">
              ● LIVE NASA FIRMS ({dataStatus?.live_firms_count ? `${dataStatus.live_firms_count.toLocaleString()} detections / 24h` : 'Active'})
            </span>
            <span className="px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--warning)]/45 font-mono text-[11px] font-semibold text-[var(--warning)]">
              ARCHIVE BASELINE (2024–2026-11-11)
            </span>
          </div>
        </div>

        <p>
          <strong className="text-[var(--text-primary)]">
            1. Live Official NASA FIRMS Global Active-Fire Data (Tanpa Selisih Titik Api):
          </strong>{' '}
          Peta utama FireScope mengambil deteksi titik api satelit langsung dari feed resmi{' '}
          <strong className="text-[var(--text-primary)]">NASA FIRMS EOSDIS Active Fire</strong>{' '}
          (<em>MODIS C6.1 Terra/Aqua 1 km</em>, <em>VIIRS NOAA-20 C2 375 m</em>, dan{' '}
          <em>VIIRS NOAA-21 C2 375 m</em> Global 24h CSV + verifikasi SHA-256) dengan koordinat
          WGS84 EPSG:4326 yang identik dengan NASA FIRMS Global Fire Map (mode{' '}
          <code className="font-mono text-[11px] text-[var(--text-primary)]">TODAY UTC</code> dan{' '}
          <code className="font-mono text-[11px] text-[var(--text-primary)]">24HRS LIVE</code>).
          Sesuai status resmi NASA FIRMS, sensor <strong>VIIRS S-NPP</strong> saat ini berstatus{' '}
          <code className="font-mono text-[11px] text-[var(--warning)]">
            NO_RECENT_DATA (hingga 2026-11-02)
          </code>
          .
        </p>

        {dataStatus?.live_firms_feeds && dataStatus.live_firms_feeds.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
            {dataStatus.live_firms_feeds.map((feed) => (
              <div
                key={feed.id}
                className="p-2.5 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] flex items-center justify-between gap-2"
              >
                <span className="text-[var(--text-primary)]">
                  {feed.product} ({feed.platform})
                </span>
                <span className="text-[var(--success)] font-semibold">
                  {feed.row_count.toLocaleString()} rows
                </span>
              </div>
            ))}
          </div>
        )}

        <p>
          <strong className="text-[var(--text-primary)]">
            2. Dukungan Opsional FIRMS MAP_KEY &amp; Archive Historical Baseline:
          </strong>{' '}
          Server FireScope juga mendukung environment variable{' '}
          <code className="font-mono text-[11px] text-[var(--text-primary)]">FIRMS_MAP_KEY</code>{' '}
          (status saat ini:{' '}
          <strong className="font-mono text-[var(--text-primary)]">
            {dataStatus?.firms_map_key_configured ? 'Configured' : 'Open Data CSV Mode (No Key Required)'}
          </strong>
          ) untuk kueri Area API historis 1–5 hari. Untuk rentang analisis multi-tahun (2024–2026-11-11),
          FireScope menggunakan snapshot arsip historis terpisah (sebelumnya berlabel{' '}
          <code className="font-mono text-[11px] text-[var(--warning)]">DEMO DATA</code>) dan
          tidak mencampurkannya ke peta deteksi NASA FIRMS real-time.
        </p>
      </div>

      <div className="p-4 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-3 text-[13px] text-[var(--text-secondary)] leading-relaxed">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Product Purpose &amp; Non-Claims
        </h2>
        <p>
          FireScope is an analytical workspace for exploring recent and historical MODIS and VIIRS
          active-fire satellite observations inside a chosen Area of Interest (AOI). It combines a
          spatial map workspace with a calendar-first temporal analysis surface, preserving native
          sensor resolution, platform continuity, confidence semantics, and processing provenance.
        </p>
        <p>
          <strong className="text-[var(--text-primary)]">Operational Disclaimer:</strong> FireScope
          is an analytical aid, not an emergency dispatch console, fire-spread predictor,
          burned-area estimator, or confirmed incident registry. A satellite hotspot represents a
          thermal anomaly detected within a pixel footprint at satellite overpass time; zero
          detections do not prove absence of fire.
        </p>
      </div>

      <div className="p-4 rounded-[8px] bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-3 text-[12px] text-[var(--text-secondary)] leading-relaxed">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          NASA FIRMS / LANCE / ESDIS &amp; EONET Data Acknowledgment
        </h2>
        <blockquote className="p-3 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-primary)]">
          We acknowledge the use of data and/or imagery from NASA&apos;s Fire Information for
          Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of
          NASA&apos;s Earth Science Data and Information System (ESDIS) and Land, Atmosphere Near
          real-time Capability for Earth observations (LANCE) (https://earthdata.nasa.gov/lance), as
          well as NASA&apos;s Earth Observatory Natural Event Tracker (EONET v3).
        </blockquote>
      </div>
    </div>
  );
};
