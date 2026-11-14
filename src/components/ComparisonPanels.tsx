import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  Download,
  GitCompare,
  History,
  Info,
  Minus,
} from 'lucide-react';
import {
  AoiComparisonResponse,
  AoiDefinition,
  DataSourceBacking,
  Granularity,
  PeriodComparisonResponse,
  SavedAoiRecord,
  SharedQueryState,
} from '../types/firescope';
import { PRESET_AOIS } from '../data/firmsArchiveData';
import {
  fetchAoiComparisonFromApi,
  fetchPeriodComparisonFromApi,
  generateAoiComparisonCsv,
  generatePeriodComparisonCsv,
} from '../services/firescopeApi';
import { DisclosureAccordion, InfoPopover } from './ProgressiveDisclosure';

type SeasonWindowPreset = 'dry-jul-nov' | 'full-year' | 'recent-30d' | 'custom';

function backingProse(backing: DataSourceBacking): string {
  switch (backing) {
    case 'REAL_NASA_ARCHIVE_PARQUET':
      return 'NASA FIRMS Historical Archive (2001–2026)';
    case 'HYBRID_PARQUET_AND_LIVE':
      return 'NASA FIRMS Archive + Live 24h Stream';
    case 'LIVE_NASA_FIRMS':
      return 'Live NASA FIRMS 24h Stream';
    default:
      return 'Reference Baseline (Outside Indonesia Archive)';
  }
}

function triggerCsvDownload(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatYearRange(
  year: number,
  season: Exclude<SeasonWindowPreset, 'custom'>,
  liveMaxDate = '2026-11-13'
): { start: string; end: string; label: string; granularity: Granularity } {
  const clampEnd = (iso: string) => (iso > liveMaxDate ? liveMaxDate : iso);
  const maxYear = Number(liveMaxDate.slice(0, 4));
  const maxMmDdLabel = liveMaxDate.slice(5);

  if (season === 'full-year') {
    const end = clampEnd(`${year}-12-31`);
    return {
      start: `${year}-01-01`,
      end,
      label: year === maxYear && end === liveMaxDate ? `${year} (Jan 1–${maxMmDdLabel})` : `${year} (Full Year)`,
      granularity: 'month',
    };
  }
  if (season === 'recent-30d') {
    return {
      start: `${year}-10-15`,
      end: clampEnd(`${year}-${maxMmDdLabel}`),
      label: `Oct 15–${maxMmDdLabel}, ${year}`,
      granularity: 'week',
    };
  }
  // dry-jul-nov (peak tropical fire season across Indonesia & Amazon/California)
  const end = clampEnd(`${year}-11-30`);
  return {
    start: `${year}-07-01`,
    end,
    label: year === maxYear && end === liveMaxDate ? `Jul–${maxMmDdLabel}, ${year}` : `Jul–Nov ${year}`,
    granularity: 'month',
  };
}

interface ChangeReadoutProps {
  delta: number;
  pct: number | null;
}

const ChangeReadout: React.FC<ChangeReadoutProps> = ({ delta, pct }) => {
  const isUp = delta > 0;
  const isDown = delta < 0;
  const tone = isUp
    ? 'text-[var(--warning)]'
    : isDown
    ? 'text-[var(--success)]'
    : 'text-[var(--text-muted)]';

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[12px] tabular-nums ${tone}`}>
      {isUp ? (
        <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
      ) : isDown ? (
        <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      <span>
        {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
        {pct !== null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}
      </span>
    </span>
  );
};

interface PeriodComparisonPanelProps {
  activeAoi: AoiDefinition;
  queryState: SharedQueryState;
  parquetAvailable: boolean;
  liveMaxDate?: string;
  onSelectAoiId?: (aoiId: string) => void;
  onNotify?: (msg: string) => void;
}

export const PeriodComparisonPanel: React.FC<PeriodComparisonPanelProps> = ({
  activeAoi,
  queryState,
  parquetAvailable,
  liveMaxDate = '2026-11-13',
  onSelectAoiId,
  onNotify,
}) => {
  const b = activeAoi.bbox;
  const overlapsIndonesia =
    b.east >= 94.5 && b.west <= 141.8 && b.north >= -11.5 && b.south <= 6.5;
  const spansOutsideSeAsia =
    b.east - b.west > 60 || b.west < 85 || b.east > 150 || b.south < -16 || b.north > 12;
  const inIndonesiaBounds =
    parquetAvailable && activeAoi.id !== 'global-world' && overlapsIndonesia && !spansOutsideSeAsia;

  const yearOptions = inIndonesiaBounds
    ? Array.from({ length: 26 }, (_, i) => 2026 - i) // 2026..2001
    : [2026, 2025, 2024];

  const [seasonMode, setSeasonMode] = useState<SeasonWindowPreset>('dry-jul-nov');
  const [yearA, setYearA] = useState<number>(2025);
  const [yearB, setYearB] = useState<number>(2026);

  const initialB = formatYearRange(2026, 'dry-jul-nov', liveMaxDate);
  const [periodAStart, setPeriodAStart] = useState<string>('2025-07-01');
  const [periodAEnd, setPeriodAEnd] = useState<string>('2025-11-30');
  const [periodBStart, setPeriodBStart] = useState<string>(initialB.start);
  const [periodBEnd, setPeriodBEnd] = useState<string>(initialB.end);
  const [periodALabel, setPeriodALabel] = useState<string>('Jul–Nov 2025');
  const [periodBLabel, setPeriodBLabel] = useState<string>(initialB.label);
  const [granularity, setGranularity] = useState<Granularity>('month');

  const [data, setData] = useState<PeriodComparisonResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  const applySimpleYearSelection = useCallback(
    (
      nextYearA: number,
      nextYearB: number,
      nextSeason: Exclude<SeasonWindowPreset, 'custom'>
    ) => {
      const rA = formatYearRange(nextYearA, nextSeason, liveMaxDate);
      const rB = formatYearRange(nextYearB, nextSeason, liveMaxDate);
      setYearA(nextYearA);
      setYearB(nextYearB);
      setSeasonMode(nextSeason);
      setPeriodAStart(rA.start);
      setPeriodAEnd(rA.end);
      setPeriodALabel(rA.label);
      setPeriodBStart(rB.start);
      setPeriodBEnd(rB.end);
      setPeriodBLabel(rB.label);
      setGranularity(rA.granularity);
    },
    [liveMaxDate]
  );

  useEffect(() => {
    if (
      !inIndonesiaBounds &&
      (yearA < 2024 ||
        yearB < 2024 ||
        periodAStart < '2024-01-01' ||
        periodBStart < '2024-01-01')
    ) {
      applySimpleYearSelection(
        2025,
        2026,
        seasonMode === 'custom' ? 'dry-jul-nov' : seasonMode
      );
    }
  }, [
    inIndonesiaBounds,
    yearA,
    yearB,
    periodAStart,
    periodBStart,
    seasonMode,
    applySimpleYearSelection,
  ]);

  useEffect(() => {
    if (
      !inIndonesiaBounds &&
      (yearA < 2024 ||
        yearB < 2024 ||
        periodAStart < '2024-01-01' ||
        periodBStart < '2024-01-01')
    ) {
      return;
    }
    if (Date.parse(`${periodAStart}T00:00:00Z`) > Date.parse(`${periodAEnd}T23:59:59Z`)) {
      setErrorMsg('Period A end date must be on or after Period A start date.');
      setLoading(false);
      return;
    }
    if (Date.parse(`${periodBStart}T00:00:00Z`) > Date.parse(`${periodBEnd}T23:59:59Z`)) {
      setErrorMsg('Period B end date must be on or after Period B start date.');
      setLoading(false);
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    const controller = new AbortController();

    fetchPeriodComparisonFromApi({
      state: queryState,
      activeAoi,
      periodAStart,
      periodAEnd,
      periodBStart,
      periodBEnd,
      periodALabel,
      periodBLabel,
      granularity,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setData(res);
          setErrorMsg(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Failed to load historical period comparison.'
          );
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    activeAoi,
    queryState.sensor,
    queryState.platforms,
    queryState.processingStatus,
    queryState.dayNight,
    queryState.modisMinConfidence,
    queryState.viirsCategories,
    queryState.calendarMetric,
    periodAStart,
    periodAEnd,
    periodBStart,
    periodBEnd,
    periodALabel,
    periodBLabel,
    granularity,
    retryNonce,
  ]);

  const maxModisBar = Math.max(
    1,
    ...(data?.aligned_series.flatMap((r) => [
      r.period_a?.modis_detections ?? 0,
      r.period_b?.modis_detections ?? 0,
    ]) ?? [1])
  );
  const maxViirsBar = Math.max(
    1,
    ...(data?.aligned_series.flatMap((r) => [
      r.period_a?.viirs_detections ?? 0,
      r.period_b?.viirs_detections ?? 0,
    ]) ?? [1])
  );

  const maxYoyModis = Math.max(
    1,
    ...(data?.yoy_summary.map((y) => y.modis_detections) ?? [1])
  );
  const maxYoyViirs = Math.max(
    1,
    ...(data?.yoy_summary.map((y) => y.viirs_detections) ?? [1])
  );

  return (
    <section
      aria-label="Compare Historical Periods"
      data-testid="fr08-period-comparison"
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] divide-y divide-[var(--border-subtle)]"
    >
      {/* 1. Clean Editorial Header (Zero code prefixes or pill sandwiches) */}
      <div className="p-4 md:p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--ember)] shrink-0" />
            <h2 className="text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
              Compare Historical Periods
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{activeAoi.name}</span>
            <span aria-hidden="true">·</span>
            <span>{backingProse(data?.data_backing ?? 'DEMO_FIXTURE_BASELINE')}</span>
            <span aria-hidden="true">·</span>
            <span>MODIS (1 km) &amp; VIIRS (375 m) reported separately</span>
          </div>
        </div>

        <button
          type="button"
          disabled={!data}
          onClick={() => {
            if (!data) return;
            triggerCsvDownload(
              `firescope-history-${activeAoi.id}-${periodAStart}-vs-${periodBStart}.csv`,
              generatePeriodComparisonCsv(data)
            );
            onNotify?.('Exported historical comparison CSV with provenance.');
          }}
          className="h-9 px-4 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-primary)] inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[var(--ember)]" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Optional Region Scope Hint when user lands on Global World View */}
      {activeAoi.id === 'global-world' && onSelectAoiId && parquetAvailable && (
        <div className="px-4 md:px-5 py-3 bg-[var(--surface-2)]/50 flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Info className="w-4 h-4 text-[var(--viirs)] shrink-0" />
            <span>
              You are viewing Global scope (baseline snapshot). Switch to an Indonesia archive region
              to explore 2001–2026 NASA FIRMS historical records:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelectAoiId('kalimantan-peat')}
              className="h-7 px-3 rounded-[6px] bg-[var(--ember)] hover:bg-[var(--ember-hover)] text-white text-[12px] font-medium whitespace-nowrap"
            >
              Central Kalimantan Peatlands
            </button>
            <button
              type="button"
              onClick={() => onSelectAoiId('indonesia-archipelago')}
              className="h-7 px-3 rounded-[6px] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[12px] font-medium whitespace-nowrap"
            >
              Indonesia Archipelago
            </button>
          </div>
        </div>
      )}

      {/* 2. Simple Two-Step Year & Season Picker */}
      <div className="p-4 md:px-5 space-y-3 bg-[var(--app-bg)]/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Primary Year-vs-Year Pickers */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="text-[12px] font-medium text-[var(--text-secondary)]">
              Baseline Year
              <select
                aria-label="Baseline Year (Period A)"
                value={yearA}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  const activeSeason = seasonMode === 'custom' ? 'dry-jul-nov' : seasonMode;
                  applySimpleYearSelection(y, yearB, activeSeason);
                }}
                className="ml-2 h-9 px-2.5 rounded-[6px] bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-[13px] font-medium text-[var(--text-primary)] tabular-nums"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <span className="text-[12px] text-[var(--text-muted)] font-medium">vs</span>

            <label className="text-[12px] font-medium text-[var(--text-secondary)]">
              Target Year
              <select
                aria-label="Target Year (Period B)"
                value={yearB}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  const activeSeason = seasonMode === 'custom' ? 'dry-jul-nov' : seasonMode;
                  applySimpleYearSelection(yearA, y, activeSeason);
                }}
                className="ml-2 h-9 px-2.5 rounded-[6px] bg-[var(--surface-1)] border border-[var(--ember)]/60 font-mono text-[13px] font-medium text-[var(--text-primary)] tabular-nums"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            {/* Season Window Segmented Bar */}
            <div
              role="group"
              aria-label="Season window"
              className="flex flex-wrap items-center bg-[var(--surface-1)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[12px]"
            >
              {(
                [
                  { id: 'dry-jul-nov', label: 'Dry Season (Jul–Nov)' },
                  { id: 'full-year', label: 'Full Year' },
                  { id: 'recent-30d', label: 'Oct 15–Nov 13' },
                  { id: 'custom', label: 'Custom Dates' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (opt.id === 'custom') {
                      setSeasonMode('custom');
                    } else {
                      applySimpleYearSelection(yearA, yearB, opt.id);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-[5px] font-medium transition-colors whitespace-nowrap ${
                    seasonMode === opt.id
                      ? 'bg-[var(--ember)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 1-Click Benchmark Shortcuts */}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-[var(--text-muted)] mr-1">Benchmarks:</span>
            {inIndonesiaBounds && (
              <>
                <button
                  type="button"
                  onClick={() => applySimpleYearSelection(2015, 2023, 'dry-jul-nov')}
                  className={`px-2.5 py-1 rounded-[6px] border transition-colors whitespace-nowrap ${
                    yearA === 2015 && yearB === 2023 && seasonMode === 'dry-jul-nov'
                      ? 'bg-[var(--surface-2)] border-[var(--ember)] text-[var(--text-primary)] font-medium'
                      : 'bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  2015 El Niño vs 2023
                </button>
                <button
                  type="button"
                  onClick={() => applySimpleYearSelection(2019, 2026, 'dry-jul-nov')}
                  className={`px-2.5 py-1 rounded-[6px] border transition-colors whitespace-nowrap ${
                    yearA === 2019 && yearB === 2026 && seasonMode === 'dry-jul-nov'
                      ? 'bg-[var(--surface-2)] border-[var(--ember)] text-[var(--text-primary)] font-medium'
                      : 'bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  2019 vs 2026
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => applySimpleYearSelection(2025, 2026, 'dry-jul-nov')}
              className={`px-2.5 py-1 rounded-[6px] border transition-colors whitespace-nowrap ${
                yearA === 2025 && yearB === 2026 && seasonMode === 'dry-jul-nov'
                  ? 'bg-[var(--surface-2)] border-[var(--ember)] text-[var(--text-primary)] font-medium'
                  : 'bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              2025 vs 2026
            </button>
          </div>
        </div>

        {/* Collapsible Custom Date Range Controls (revealed cleanly when Custom Dates is selected) */}
        {seasonMode === 'custom' && (
          <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CalendarRange className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="font-medium text-[var(--text-secondary)]">Period A:</span>
                <input
                  type="date"
                  aria-label="Period A start date"
                  min={inIndonesiaBounds ? '2001-01-01' : '2024-01-01'}
                  max={liveMaxDate}
                  value={periodAStart}
                  onChange={(e) => {
                    if (e.target.value) {
                      setPeriodAStart(e.target.value);
                      setPeriodALabel(`${e.target.value} → ${periodAEnd}`);
                    }
                  }}
                  className="h-8 px-2 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-[12px] text-[var(--text-primary)]"
                />
                <span className="text-[var(--text-muted)]">→</span>
                <input
                  type="date"
                  aria-label="Period A end date"
                  min={inIndonesiaBounds ? '2001-01-01' : '2024-01-01'}
                  max={liveMaxDate}
                  value={periodAEnd}
                  onChange={(e) => {
                    if (e.target.value) {
                      setPeriodAEnd(e.target.value);
                      setPeriodALabel(`${periodAStart} → ${e.target.value}`);
                    }
                  }}
                  className="h-8 px-2 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-[12px] text-[var(--text-primary)]"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-medium text-[var(--ember)]">Period B:</span>
                <input
                  type="date"
                  aria-label="Period B start date"
                  min={inIndonesiaBounds ? '2001-01-01' : '2024-01-01'}
                  max={liveMaxDate}
                  value={periodBStart}
                  onChange={(e) => {
                    if (e.target.value) {
                      setPeriodBStart(e.target.value);
                      setPeriodBLabel(`${e.target.value} → ${periodBEnd}`);
                    }
                  }}
                  className="h-8 px-2 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-[12px] text-[var(--text-primary)]"
                />
                <span className="text-[var(--text-muted)]">→</span>
                <input
                  type="date"
                  aria-label="Period B end date"
                  min={inIndonesiaBounds ? '2001-01-01' : '2024-01-01'}
                  max={liveMaxDate}
                  value={periodBEnd}
                  onChange={(e) => {
                    if (e.target.value) {
                      setPeriodBEnd(e.target.value);
                      setPeriodBLabel(`${periodBStart} → ${e.target.value}`);
                    }
                  }}
                  className="h-8 px-2 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-[12px] text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="flex items-center gap-1 bg-[var(--surface-1)] p-0.5 rounded-[6px] border border-[var(--border-subtle)]">
              {(['month', 'week', 'day'] as Granularity[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  className={`px-2.5 py-1 rounded capitalize font-medium ${
                    granularity === g
                      ? 'bg-[var(--ember)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="px-4 py-3 bg-[var(--danger)]/10 text-[12px] text-[var(--danger)] flex flex-wrap items-center justify-between gap-2"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="px-2.5 py-1 rounded bg-[var(--surface-1)] border border-[var(--danger)]/40 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="p-8 text-center font-mono text-[12px] text-[var(--text-muted)]">
          Loading historical NASA FIRMS observations...
        </div>
      ) : (
        data && (
          <>
            {/* 3. Flat Side-by-Side Sensor Summary (Single Elevation, No Cards-Within-Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
              {/* MODIS C6.1 Column */}
              <div className="p-4 md:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[var(--modis)] rounded-[1px] shrink-0" />
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                      MODIS C6.1 (1 km)
                    </span>
                  </div>
                  <ChangeReadout
                    delta={data.totals.modis_delta}
                    pct={data.totals.modis_pct_change}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 items-end">
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)]">{data.period_a.label}</div>
                    <div className="text-[24px] font-mono font-semibold text-[var(--text-primary)] tabular-nums leading-tight">
                      {data.totals.period_a_modis.toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums">
                      Mean FRP: {data.totals.period_a_modis_frp_mean_mw ?? '—'} MW
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--modis)] font-medium">{data.period_b.label}</div>
                    <div className="text-[24px] font-mono font-semibold text-[var(--modis)] tabular-nums leading-tight">
                      {data.totals.period_b_modis.toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums">
                      Mean FRP: {data.totals.period_b_modis_frp_mean_mw ?? '—'} MW
                    </div>
                  </div>
                </div>
              </div>

              {/* VIIRS C2 Column */}
              <div className="p-4 md:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[var(--viirs)] rounded-full shrink-0" />
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                      VIIRS C2 (375 m)
                    </span>
                  </div>
                  <ChangeReadout
                    delta={data.totals.viirs_delta}
                    pct={data.totals.viirs_pct_change}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 items-end">
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)]">{data.period_a.label}</div>
                    <div className="text-[24px] font-mono font-semibold text-[var(--text-primary)] tabular-nums leading-tight">
                      {data.totals.period_a_viirs.toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums">
                      Mean FRP: {data.totals.period_a_viirs_frp_mean_mw ?? '—'} MW
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--viirs)] font-medium">{data.period_b.label}</div>
                    <div className="text-[24px] font-mono font-semibold text-[var(--viirs)] tabular-nums leading-tight">
                      {data.totals.period_b_viirs.toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums">
                      Mean FRP: {data.totals.period_b_viirs_frp_mean_mw ?? '—'} MW
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Concise Continuity & Data Quality Context Note */}
            {data.availability_warnings.length > 0 && (
              <div className="px-4 md:px-5 py-3">
                <DisclosureAccordion
                  title="Sensor Continuity & Comparability Notes"
                  summaryBadge={`${data.availability_warnings.length} note(s)`}
                  defaultOpen={false}
                >
                  <div className="px-3 py-2.5 rounded-[6px] bg-[var(--warning)]/6 border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] space-y-1.5">
                    {data.availability_warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </DisclosureAccordion>
              </div>
            )}

            {/* 5. Unified Side-by-Side Time-Bin Matrix (Both Sensors Readable Together) */}
            {data.aligned_series.length > 0 && (
              <div className="p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                    Bin-by-Bin Breakdown
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
                    <span>Faded bar = {data.period_a.label}</span>
                    <span aria-hidden="true">·</span>
                    <span>Solid bar = {data.period_b.label}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-medium">
                        <th className="py-2 pr-4">Period Bin</th>
                        <th className="py-2 px-3 min-w-[210px]">MODIS (1 km) · A vs B</th>
                        <th className="py-2 px-3 min-w-[210px]">VIIRS (375 m) · A vs B</th>
                        <th className="py-2 pl-3 text-right">Satellites</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-mono tabular-nums">
                      {data.aligned_series.slice(0, 31).map((row) => {
                        const aM = row.period_a?.modis_detections ?? 0;
                        const bM = row.period_b?.modis_detections ?? 0;
                        const aV = row.period_a?.viirs_detections ?? 0;
                        const bV = row.period_b?.viirs_detections ?? 0;
                        const plats = Array.from(
                          new Set([
                            ...(row.period_a?.active_platforms ?? []),
                            ...(row.period_b?.active_platforms ?? []),
                          ])
                        );
                        return (
                          <tr key={row.aligned_index} className="hover:bg-[var(--surface-2)]/45">
                            <td className="py-2.5 pr-4 font-sans font-medium text-[var(--text-primary)] whitespace-nowrap">
                              {row.aligned_label}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-[var(--text-secondary)]">
                                  {aM.toLocaleString()} →{' '}
                                  <strong className="text-[var(--modis)]">{bM.toLocaleString()}</strong>
                                </span>
                                {row.modis_delta !== null && (
                                  <span className="text-[10px] text-[var(--text-muted)]">
                                    {row.modis_delta > 0 ? `+${row.modis_delta.toLocaleString()}` : row.modis_delta.toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1">
                                <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                                  <div
                                    style={{ width: `${Math.round((aM / maxModisBar) * 100)}%` }}
                                    className="h-full bg-[var(--modis)]/45"
                                  />
                                </div>
                                <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                                  <div
                                    style={{ width: `${Math.round((bM / maxModisBar) * 100)}%` }}
                                    className="h-full bg-[var(--modis)]"
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-[var(--text-secondary)]">
                                  {aV.toLocaleString()} →{' '}
                                  <strong className="text-[var(--viirs)]">{bV.toLocaleString()}</strong>
                                </span>
                                {row.viirs_delta !== null && (
                                  <span className="text-[10px] text-[var(--text-muted)]">
                                    {row.viirs_delta > 0 ? `+${row.viirs_delta.toLocaleString()}` : row.viirs_delta.toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1">
                                <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                                  <div
                                    style={{ width: `${Math.round((aV / maxViirsBar) * 100)}%` }}
                                    className="h-full bg-[var(--viirs)]/45"
                                  />
                                </div>
                                <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                                  <div
                                    style={{ width: `${Math.round((bV / maxViirsBar) * 100)}%` }}
                                    className="h-full bg-[var(--viirs)]"
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 pl-3 text-right text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                              {plats.join(', ') || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. Interactive Multi-Year Historical Overview (Click any year to set as Baseline Year A) */}
            {data.yoy_summary.length > 0 && (
              <div className="p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                      Same-Window History Across Available Years ({periodBStart.slice(5)} → {periodBEnd.slice(5)})
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Click any year below to set it as your Baseline Year (Period A) for instant comparison.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-medium">
                        <th className="py-2 pr-3">Year</th>
                        <th className="py-2 px-3 min-w-[160px] text-[var(--modis)]">MODIS (1 km)</th>
                        <th className="py-2 px-3 text-right">MODIS FRP</th>
                        <th className="py-2 px-3 min-w-[160px] text-[var(--viirs)]">VIIRS (375 m)</th>
                        <th className="py-2 px-3 text-right">VIIRS FRP</th>
                        <th className="py-2 px-3">Platforms &amp; Processing</th>
                        <th className="py-2 pl-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-mono tabular-nums">
                      {data.yoy_summary.map((yr) => {
                        const isBaseline = yr.year === yearA;
                        const isTarget = yr.year === yearB;
                        return (
                          <tr
                            key={yr.year}
                            className={`transition-colors ${
                              isBaseline || isTarget
                                ? 'bg-[var(--surface-2)]/70'
                                : 'hover:bg-[var(--surface-2)]/40'
                            }`}
                          >
                            <td className="py-2 pr-3 font-semibold text-[var(--text-primary)] whitespace-nowrap">
                              {yr.year}
                              {isBaseline && (
                                <span className="ml-2 font-sans text-[11px] font-normal text-[var(--text-secondary)]">
                                  (Year A)
                                </span>
                              )}
                              {isTarget && (
                                <span className="ml-2 font-sans text-[11px] font-normal text-[var(--ember)]">
                                  (Year B)
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span className="w-16 text-right text-[var(--modis)] font-semibold">
                                  {yr.modis_detections.toLocaleString()}
                                </span>
                                <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                                  <div
                                    style={{
                                      width: `${Math.round((yr.modis_detections / maxYoyModis) * 100)}%`,
                                    }}
                                    className="h-full bg-[var(--modis)]"
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right text-[var(--text-secondary)]">
                              {yr.modis_frp_mean_mw !== null ? `${yr.modis_frp_mean_mw} MW` : '—'}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span className="w-16 text-right text-[var(--viirs)] font-semibold">
                                  {yr.viirs_detections.toLocaleString()}
                                </span>
                                <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                                  <div
                                    style={{
                                      width: `${Math.round((yr.viirs_detections / maxYoyViirs) * 100)}%`,
                                    }}
                                    className="h-full bg-[var(--viirs)]"
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right text-[var(--text-secondary)]">
                              {yr.viirs_frp_mean_mw !== null ? `${yr.viirs_frp_mean_mw} MW` : '—'}
                            </td>
                            <td className="py-2 px-3 font-sans text-[11px] text-[var(--text-muted)]">
                              {yr.active_platforms.join(', ') || '—'} ·{' '}
                              {yr.processing_statuses.join('/') || 'NONE'}
                            </td>
                            <td className="py-2 pl-3 text-right font-sans">
                              <button
                                type="button"
                                disabled={yr.year === yearA}
                                onClick={() => {
                                  const activeSeason =
                                    seasonMode === 'custom' ? 'dry-jul-nov' : seasonMode;
                                  applySimpleYearSelection(yr.year, yearB, activeSeason);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-3)] disabled:opacity-40 whitespace-nowrap"
                              >
                                {yr.year === yearA ? 'Selected A' : 'Use as Year A'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
};

interface AoiComparisonPanelProps {
  activeAoi: AoiDefinition;
  savedAois: SavedAoiRecord[];
  queryState: SharedQueryState;
  onNotify?: (msg: string) => void;
}

export const AoiComparisonPanel: React.FC<AoiComparisonPanelProps> = ({
  activeAoi,
  savedAois,
  queryState,
  onNotify,
}) => {
  const candidateAois: AoiDefinition[] = [
    ...PRESET_AOIS.filter((a) => a.id !== 'global-world'),
    ...savedAois.map((s) => s.aoi),
  ].filter((a, idx, arr) => arr.findIndex((x) => x.id === a.id) === idx);

  const defaultSecondaryId =
    candidateAois.find((a) => a.id !== activeAoi.id && a.id === 'indonesia-archipelago')?.id ??
    candidateAois.find((a) => a.id !== activeAoi.id)?.id ??
    'indonesia-archipelago';

  const [secondaryAoiId, setSecondaryAoiId] = useState<string>(defaultSecondaryId);
  const secondaryAoi =
    candidateAois.find((a) => a.id === secondaryAoiId) ??
    PRESET_AOIS.find((a) => a.id === 'indonesia-archipelago') ??
    PRESET_AOIS[1];

  const [data, setData] = useState<AoiComparisonResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  useEffect(() => {
    if (secondaryAoiId === activeAoi.id) {
      const alt = candidateAois.find((a) => a.id !== activeAoi.id);
      if (alt) setSecondaryAoiId(alt.id);
    }
  }, [activeAoi.id]);

  useEffect(() => {
    setErrorMsg(null);
    setLoading(true);
    const controller = new AbortController();
    fetchAoiComparisonFromApi({
      state: queryState,
      aoiA: activeAoi,
      aoiB: secondaryAoi,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setData(res);
          setErrorMsg(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Failed to load side-by-side regional comparison.'
          );
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    activeAoi,
    secondaryAoi,
    queryState.startDate,
    queryState.endDate,
    queryState.granularity,
    queryState.sensor,
    queryState.platforms,
    queryState.processingStatus,
    queryState.dayNight,
    queryState.modisMinConfidence,
    queryState.viirsCategories,
    queryState.calendarMetric,
    retryNonce,
  ]);

  const maxModisBinVal = Math.max(
    1,
    ...(data?.aligned_series.flatMap((r) => [r.aoi_a_modis ?? 0, r.aoi_b_modis ?? 0]) ?? [1])
  );
  const maxViirsBinVal = Math.max(
    1,
    ...(data?.aligned_series.flatMap((r) => [r.aoi_a_viirs ?? 0, r.aoi_b_viirs ?? 0]) ?? [1])
  );

  return (
    <section
      aria-label="Compare Two Regions Side by Side"
      data-testid="multi-aoi-comparison"
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] divide-y divide-[var(--border-subtle)]"
    >
      {/* Header */}
      <div className="p-4 md:p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-[var(--viirs)] shrink-0" />
            <h2 className="text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
              Compare Two Regions Side by Side
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--text-secondary)]">
            <span>
              {queryState.startDate} → {queryState.endDate} (UTC {queryState.granularity})
            </span>
            <span aria-hidden="true">·</span>
            <InfoPopover title="Regional Comparison Method" triggerLabel="Comparison rules">
              {data?.method.caveat ?? 'Compares regions per sensor and per 1,000 km² without pooling sensors.'}
            </InfoPopover>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="secondary-aoi-select"
            className="text-[12px] font-medium text-[var(--text-secondary)]"
          >
            Compare with
          </label>
          <select
            id="secondary-aoi-select"
            aria-label="Select secondary Area of Interest for side-by-side comparison"
            value={secondaryAoi.id}
            onChange={(e) => setSecondaryAoiId(e.target.value)}
            className="h-9 px-3 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]"
          >
            {candidateAois.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.areaSqKm.toLocaleString()} km²)
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={!data}
            onClick={() => {
              if (!data) return;
              triggerCsvDownload(
                `firescope-compare-regions-${activeAoi.id}-vs-${secondaryAoi.id}.csv`,
                generateAoiComparisonCsv(data)
              );
              onNotify?.('Exported region comparison CSV.');
            }}
            className="h-9 px-4 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-primary)] inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[var(--viirs)]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="px-4 py-3 bg-[var(--danger)]/10 text-[12px] text-[var(--danger)] flex flex-wrap items-center justify-between gap-2"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="px-2.5 py-1 rounded bg-[var(--surface-1)] border border-[var(--danger)]/40 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="p-8 text-center font-mono text-[12px] text-[var(--text-muted)]">
          Loading side-by-side regional comparison...
        </div>
      ) : (
        data && (
          <>
            {data.comparability_warnings.length > 0 && (
              <div className="px-4 md:px-5 py-3">
                <DisclosureAccordion
                  title="Sensor Continuity & Comparability Notes"
                  summaryBadge={`${data.comparability_warnings.length} note(s)`}
                  defaultOpen={false}
                >
                  <div className="px-3 py-2.5 rounded-[6px] bg-[var(--warning)]/6 border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] space-y-1.5">
                    {data.comparability_warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </DisclosureAccordion>
              </div>
            )}

            {/* Single-Elevation Two-Region Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
              {[
                { label: 'Primary Region', sum: data.aoi_a },
                { label: 'Comparison Region', sum: data.aoi_b },
              ].map((side) => (
                <div key={side.label} className="p-4 md:p-5 space-y-4">
                  <div>
                    <div className="text-[12px] text-[var(--text-muted)]">
                      {side.label} · {side.sum.aoi.biome} · {side.sum.aoi.area_sq_km.toLocaleString()} km²
                    </div>
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mt-0.5">
                      {side.sum.aoi.name}
                    </h3>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {backingProse(side.sum.data_backing)} · Peak: {side.sum.peak_bin_label ?? '—'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--border-subtle)] font-mono tabular-nums">
                    <div className="space-y-0.5">
                      <div className="font-sans text-[12px] font-medium text-[var(--modis)]">
                        MODIS (1 km)
                      </div>
                      <div className="text-[22px] font-semibold text-[var(--text-primary)] leading-tight">
                        {side.sum.modis_detections.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {side.sum.modis_per_1000_sq_km} / 1,000 km²
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Mean FRP: {side.sum.modis_frp.mean_mw ?? '—'} MW
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <div className="font-sans text-[12px] font-medium text-[var(--viirs)]">
                        VIIRS (375 m)
                      </div>
                      <div className="text-[22px] font-semibold text-[var(--text-primary)] leading-tight">
                        {side.sum.viirs_detections.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {side.sum.viirs_per_1000_sq_km} / 1,000 km²
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Mean FRP: {side.sum.viirs_frp.mean_mw ?? '—'} MW
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Unified Side-by-Side Trace Table */}
            <div className="p-4 md:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Synchronized Time-Bin Trace
                </h3>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Upper bar: {data.aoi_a.aoi.name} · Lower bar: {data.aoi_b.aoi.name}
                </span>
              </div>

              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {data.aligned_series.slice(0, 24).map((row) => (
                  <div key={row.bin_key} className="space-y-1.5 text-[11px] font-mono tabular-nums">
                    <div className="flex flex-wrap justify-between text-[var(--text-secondary)]">
                      <span className="font-sans font-medium text-[var(--text-primary)]">{row.label}</span>
                      <span>
                        A (M:{(row.aoi_a_modis ?? 0).toLocaleString()} · V:
                        {(row.aoi_a_viirs ?? 0).toLocaleString()}) vs B (M:
                        {(row.aoi_b_modis ?? 0).toLocaleString()} · V:
                        {(row.aoi_b_viirs ?? 0).toLocaleString()})
                      </span>
                    </div>
                    {(queryState.sensor === 'ALL' || queryState.sensor === 'MODIS') && (
                      <div className="grid grid-cols-2 gap-3" aria-label={`MODIS trace for ${row.label}`}>
                        <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                          <div
                            style={{
                              width: `${Math.round(((row.aoi_a_modis ?? 0) / maxModisBinVal) * 100)}%`,
                            }}
                            className="h-full bg-[var(--modis)]"
                          />
                        </div>
                        <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                          <div
                            style={{
                              width: `${Math.round(((row.aoi_b_modis ?? 0) / maxModisBinVal) * 100)}%`,
                            }}
                            className="h-full bg-[var(--modis)]/55"
                          />
                        </div>
                      </div>
                    )}
                    {(queryState.sensor === 'ALL' || queryState.sensor === 'VIIRS') && (
                      <div className="grid grid-cols-2 gap-3" aria-label={`VIIRS trace for ${row.label}`}>
                        <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                          <div
                            style={{
                              width: `${Math.round(((row.aoi_a_viirs ?? 0) / maxViirsBinVal) * 100)}%`,
                            }}
                            className="h-full bg-[var(--viirs)]"
                          />
                        </div>
                        <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-xs overflow-hidden">
                          <div
                            style={{
                              width: `${Math.round(((row.aoi_b_viirs ?? 0) / maxViirsBinVal) * 100)}%`,
                            }}
                            className="h-full bg-[var(--viirs)]/55"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )
      )}
    </section>
  );
};
