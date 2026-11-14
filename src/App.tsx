import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  HelpCircle,
  Map as MapIcon,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { GlobalHeader } from './components/GlobalHeader';
import { PrimaryNavigationDrawer } from './components/PrimaryNavigationDrawer';
import { MapCanvas } from './components/MapCanvas';
import {
  AoiSearchPanel,
  LayerDrawer,
  MapToolDock,
  MeasurementPanel,
  TimelineTray,
} from './components/ToolPanels';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { SensorComparisonChart } from './components/SensorComparisonChart';
import { SelectedBinDetail } from './components/SelectedBinDetail';
import { ObservationInspector } from './components/ObservationInspector';
import {
  AoiComparisonPanel,
  PeriodComparisonPanel,
} from './components/ComparisonPanels';
import {
  AboutView,
  DataSourcesView,
  MethodologyView,
} from './components/ReferencePages';
import { InfoPopover } from './components/ProgressiveDisclosure';
import { useFireScopeWorkspace } from './hooks/useFireScopeWorkspace';

export default function App() {
  const {
    PRESET_AOIS,
    activeRoute,
    setActiveRoute,
    isDark,
    setIsDark,
    queryState,
    updateQueryState,
    activeAoi,
    dataStatus,
    mapObservations,
    hotspotsMeta,
    setMapViewport,
    mapDisplayMode,
    setMapDisplayMode,
    gridResolutionDeg,
    setGridResolutionDeg,
    gridData,
    savedAois,
    autoRefreshMs,
    setAutoRefreshMs,
    analysisSubTab,
    setAnalysisSubTab,
    isNavDrawerOpen,
    setIsNavDrawerOpen,
    activeDockTool,
    setActiveDockTool,
    isLayersOpen,
    setIsLayersOpen,
    isTimelineOpen,
    setIsTimelineOpen,
    isHelpModalOpen,
    setIsHelpModalOpen,
    isCaptureModalOpen,
    setIsCaptureModalOpen,
    isContextStripExpanded,
    setIsContextStripExpanded,
    toastMessage,
    basemap,
    setBasemap,
    overlays,
    setOverlays,
    interactionMode,
    setInteractionMode,
    measurePoints,
    setMeasurePoints,
    measureUnitSystem,
    setMeasureUnitSystem,
    liveMinDate,
    liveMaxDate,
    liveWindowMode,
    handleSelectLiveWindow,
    calendarAnalytics,
    isCalendarLoading,
    calendarError,
    retryCalendar,
    selectedBin,
    selectedBinObservations,
    selectedBinTotalMatching,
    isBinObservationsLoading,
    selectedObservation,
    showToast,
    handleSelectPresetAoi,
    handleSaveCurrentAoi,
    handleRenameSavedAoi,
    handleDeleteSavedAoi,
    handleApplyCustomAoi,
    handleFinishDrawBbox,
    handleFinishDrawPolygon,
    handleShareView,
    handleDownloadCsv,
    triggerManualRefresh,
  } = useFireScopeWorkspace();

  const hasSnppArchiveGap =
    queryState.platforms.includes('SNPP') && queryState.endDate > '2026-11-02';

  return (
    <div className="h-[100dvh] w-full max-w-full overflow-hidden flex flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      {/* 1. Global Application Command Bar */}
      <GlobalHeader
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        onOpenNavDrawer={() => setIsNavDrawerOpen(true)}
        queryState={queryState}
        activeAoi={activeAoi}
        dataStatus={dataStatus}
        onOpenAoiTool={() => {
          if (activeRoute !== 'map') {
            setActiveRoute('map');
          }
          setActiveDockTool('aoi');
        }}
        onOpenTimelineTool={() => {
          if (activeRoute === 'map') {
            setIsTimelineOpen(true);
          } else {
            setActiveRoute('analysis');
          }
        }}
        onOpenHelpModal={() => setIsHelpModalOpen(true)}
        onShareView={handleShareView}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
      />

      {/* 2. Mobile Compact Context Strip (Map Explorer < 768px only; desktop uses the Command Bar) */}
      {activeRoute === 'map' && (
        <div className="md:hidden bg-[var(--surface-2)] border-b border-[var(--border-subtle)] shrink-0 z-20 px-2.5 py-1 flex flex-col gap-1 text-[11px]">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 truncate text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)] truncate">
                {activeAoi.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[10px] shrink-0">
                {queryState.startDate} → {queryState.endDate}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsContextStripExpanded((prev) => !prev)}
              aria-expanded={isContextStripExpanded}
              aria-label="Toggle provenance and sensor details"
              className="px-2 py-0.5 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[10px] font-medium text-[var(--text-primary)] flex items-center gap-1 shrink-0"
            >
              <span>Provenance</span>
              {isContextStripExpanded ? (
                <ChevronUp className="w-3 h-3 text-[var(--text-secondary)]" />
              ) : (
                <ChevronDown className="w-3 h-3 text-[var(--text-secondary)]" />
              )}
            </button>
          </div>

          {isContextStripExpanded && (
            <div className="pt-1.5 pb-1 border-t border-[var(--border-subtle)] grid grid-cols-1 gap-1 text-[10px] text-[var(--text-secondary)] font-mono">
              <div>
                UTC Window:{' '}
                <strong className="text-[var(--text-primary)]">
                  {queryState.startDate} to {queryState.endDate} ({queryState.granularity})
                </strong>
              </div>
              <div>
                Sensors:{' '}
                <strong className="text-[var(--text-primary)]">
                  {queryState.sensor === 'ALL'
                    ? 'MODIS + VIIRS (Side-by-Side)'
                    : queryState.sensor}
                </strong>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Latest acq: {dataStatus.latest_acquisition_utc.slice(0, 16).replace('T', ' ')}Z
                </span>
                {hasSnppArchiveGap && (
                  <span className="text-[var(--warning)]">
                    VIIRS S-NPP archive ends 2026-11-02
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast Feedback Banner */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-20 right-4 z-50 bg-[var(--surface-1)] border border-[var(--border-strong)] text-[var(--text-primary)] px-3.5 py-2 rounded-md shadow-lg text-[12px] flex items-center gap-2 max-w-[calc(100vw-32px)]"
        >
          <Check className="w-4 h-4 text-[var(--success)] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Primary Left Navigation Drawer */}
      <PrimaryNavigationDrawer
        isOpen={isNavDrawerOpen}
        onClose={() => setIsNavDrawerOpen(false)}
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        activeAoi={activeAoi}
        onSelectPresetAoi={handleSelectPresetAoi}
        onOpenAoiTool={() => {
          if (activeRoute !== 'map') {
            setActiveRoute('map');
          }
          setActiveDockTool('aoi');
        }}
        onOpenTimelineTool={() => {
          if (activeRoute === 'map') {
            setIsTimelineOpen(true);
          } else {
            setActiveRoute('analysis');
          }
        }}
        onShareView={handleShareView}
        onOpenHelpModal={() => setIsHelpModalOpen(true)}
      />

      {/* 3. Main Workspace Content */}
      <main className="flex-1 relative overflow-hidden flex min-h-0">
        {/* WORKSPACE 1: MAP EXPLORER (/map) */}
        {activeRoute === 'map' && (
          <div className="relative flex-1 h-full flex overflow-hidden min-w-0">
            <div className="relative flex-1 h-full min-w-0">
              <MapCanvas
                activeAoi={activeAoi}
                observations={mapObservations}
                selectedObservationId={queryState.selectedObservationId}
                onSelectObservation={(obs) =>
                  updateQueryState({ selectedObservationId: obs.observation_id })
                }
                basemap={basemap}
                onChangeBasemap={setBasemap}
                overlays={overlays}
                interactionMode={interactionMode}
                onFinishDrawBbox={handleFinishDrawBbox}
                onFinishDrawPolygon={handleFinishDrawPolygon}
                measurePoints={measurePoints}
                onAddMeasurePoint={(pt) => setMeasurePoints((prev) => [...prev, pt])}
                measureUnitSystem={measureUnitSystem}
                visiblePlatforms={queryState.platforms}
                onViewportChange={setMapViewport}
                hotspotsMeta={hotspotsMeta}
                liveWindowMode={liveWindowMode}
                onSelectLiveWindow={handleSelectLiveWindow}
                mapDisplayMode={mapDisplayMode}
                onChangeMapDisplayMode={setMapDisplayMode}
                gridResolutionDeg={gridResolutionDeg}
                onChangeGridResolutionDeg={setGridResolutionDeg}
                gridData={gridData}
                excludeOffshore={queryState.excludeOffshore}
                onToggleExcludeOffshore={() =>
                  updateQueryState({ excludeOffshore: !queryState.excludeOffshore })
                }
              />

              {activeDockTool === 'aoi' && (
                <div className="absolute inset-x-2.5 bottom-[92px] sm:inset-x-auto sm:bottom-auto sm:top-3 sm:left-16 md:left-14 z-30">
                  <AoiSearchPanel
                    activeAoi={activeAoi}
                    savedAois={savedAois}
                    onSelectPresetAoi={handleSelectPresetAoi}
                    onSelectSavedAoi={(aoi) => {
                      updateQueryState({
                        aoiId: aoi.id,
                        customAoi: aoi,
                        selectedBinKey: null,
                        selectedObservationId: null,
                      });
                      showToast(`Loaded Saved AOI: ${aoi.name}`);
                    }}
                    onSaveCurrentAoi={handleSaveCurrentAoi}
                    onRenameSavedAoi={handleRenameSavedAoi}
                    onDeleteSavedAoi={handleDeleteSavedAoi}
                    onApplyCustomAoi={handleApplyCustomAoi}
                    interactionMode={interactionMode}
                    onSetInteractionMode={setInteractionMode}
                    onOpenAnalysis={() => {
                      setAnalysisSubTab('calendar');
                      setActiveRoute('analysis');
                    }}
                    onOpenPeriodCompare={() => {
                      setAnalysisSubTab('period-compare');
                      setActiveRoute('analysis');
                    }}
                    onClose={() => {
                      setActiveDockTool(null);
                      setInteractionMode('pan');
                    }}
                  />
                </div>
              )}

              {activeDockTool === 'measure' && (
                <div className="absolute inset-x-2.5 bottom-[92px] sm:inset-x-auto sm:bottom-auto sm:top-3 sm:left-16 md:left-14 z-30">
                  <MeasurementPanel
                    interactionMode={interactionMode}
                    onSetInteractionMode={setInteractionMode}
                    measurePoints={measurePoints}
                    onUndoPoint={() => setMeasurePoints((prev) => prev.slice(0, -1))}
                    onClearPoints={() => setMeasurePoints([])}
                    unitSystem={measureUnitSystem}
                    onChangeUnitSystem={setMeasureUnitSystem}
                    onClose={() => {
                      setActiveDockTool(null);
                      setInteractionMode('pan');
                    }}
                  />
                </div>
              )}

              {/* Bottom Timeline Tray + Persistent Tool Dock Stack */}
              <div className="absolute bottom-9 sm:bottom-11 left-1/2 -translate-x-1/2 z-20 w-full max-w-[1060px] px-2 sm:px-3 flex flex-col items-center gap-1.5 sm:gap-2 pointer-events-none pb-safe">
                {isTimelineOpen && (
                  <div className="w-full pointer-events-auto">
                    <TimelineTray
                      isOpen={isTimelineOpen}
                      onClose={() => setIsTimelineOpen(false)}
                      queryState={queryState}
                      onUpdateQueryState={updateQueryState}
                      series={calendarAnalytics.series}
                      onOpenCalendarAnalysis={() => setActiveRoute('analysis')}
                      liveMinDate={liveMinDate}
                      liveMaxDate={liveMaxDate}
                    />
                  </div>
                )}

                <div className="pointer-events-auto max-w-full">
                  <MapToolDock
                    activeTool={activeDockTool}
                    onSelectTool={(tool) => {
                      setActiveDockTool(tool);
                      if (tool === 'measure') {
                        setInteractionMode('measure-distance');
                      } else if (tool !== 'aoi') {
                        setInteractionMode('pan');
                      }
                    }}
                    isLayersOpen={isLayersOpen}
                    onToggleLayers={() => setIsLayersOpen((prev) => !prev)}
                    isTimelineOpen={isTimelineOpen}
                    onToggleTimeline={() => setIsTimelineOpen((prev) => !prev)}
                    onCaptureSnapshot={() => setIsCaptureModalOpen(true)}
                    onShareUrl={handleShareView}
                    onOpenHelp={() => setIsHelpModalOpen(true)}
                  />
                </div>
              </div>
            </div>

            <LayerDrawer
              isOpen={isLayersOpen}
              onClose={() => setIsLayersOpen(false)}
              platforms={dataStatus.platforms}
              queryState={queryState}
              onUpdateQueryState={updateQueryState}
              overlays={overlays}
              onUpdateOverlays={(patch) => setOverlays((prev) => ({ ...prev, ...patch }))}
              basemap={basemap}
              onChangeBasemap={setBasemap}
              mapDisplayMode={mapDisplayMode}
              onChangeMapDisplayMode={setMapDisplayMode}
              gridResolutionDeg={gridResolutionDeg}
              onChangeGridResolutionDeg={setGridResolutionDeg}
              autoRefreshMs={autoRefreshMs}
              onChangeAutoRefreshMs={setAutoRefreshMs}
              onManualRefresh={triggerManualRefresh}
            />

            <ObservationInspector
              observation={selectedObservation}
              onClose={() => updateQueryState({ selectedObservationId: null })}
            />
          </div>
        )}

        {/* WORKSPACE 2: AOI ANALYSIS — SCIENTIFIC FIELD ATLAS (/analysis) */}
        {activeRoute === 'analysis' && (
          <div className="flex-1 h-full flex overflow-hidden">
            <div className="flex-1 h-full overflow-y-auto p-4 md:p-6">
              <div className="max-w-[1600px] mx-auto space-y-5">
                {/* Consolidated Field Atlas Header Block */}
                <section
                  aria-label="AOI Analysis Header and Mode Navigation"
                  className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md"
                >
                  <div className="px-4 py-3.5 md:px-5 md:py-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <h1 className="text-[20px] md:text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
                        {activeAoi.name}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                        <span>
                          {activeAoi.regionLabel} · {activeAoi.areaSqKm.toLocaleString()} km²
                        </span>
                        <InfoPopover
                          title="Region & Sensor Coverage Details"
                          triggerLabel="Region details"
                        >
                          <div className="space-y-1.5">
                            <p>{activeAoi.description}</p>
                            <div className="pt-1.5 border-t border-[var(--border-subtle)] space-y-1 font-mono text-[10px]">
                              <div>
                                {activeAoi.geometryType} [{activeAoi.bbox.west.toFixed(2)}°,{' '}
                                {activeAoi.bbox.south.toFixed(2)}° to{' '}
                                {activeAoi.bbox.east.toFixed(2)}°,{' '}
                                {activeAoi.bbox.north.toFixed(2)}°]
                              </div>
                              <div>
                                Local timezone: {activeAoi.timezone} ({activeAoi.utcOffsetLabel})
                              </div>
                              <div>
                                Latest acq:{' '}
                                {dataStatus.latest_acquisition_utc.slice(0, 16).replace('T', ' ')}Z
                              </div>
                              {hasSnppArchiveGap && (
                                <div className="text-[var(--warning)] font-medium pt-0.5">
                                  Note: VIIRS S-NPP archive ends 2026-11-02
                                </div>
                              )}
                            </div>
                          </div>
                        </InfoPopover>
                      </div>
                    </div>

                    {/* Shared AOI Switcher, Export & Map Return Controls */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        aria-label="Select Area of Interest"
                        value={activeAoi.id}
                        onChange={(e) => handleSelectPresetAoi(e.target.value)}
                        className="h-8 px-2.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]"
                      >
                        <optgroup label="Reference Preset AOIs">
                          {PRESET_AOIS.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </optgroup>
                        {savedAois.length > 0 && (
                          <optgroup label="Saved Personal AOIs">
                            {savedAois.map((s) => (
                              <option key={s.aoi.id} value={s.aoi.id}>
                                {s.aoi.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {queryState.customAoi &&
                          !savedAois.some((s) => s.aoi.id === queryState.customAoi!.id) && (
                            <option value={queryState.customAoi.id}>
                              {queryState.customAoi.name}
                            </option>
                          )}
                      </select>

                      <button
                        type="button"
                        onClick={handleDownloadCsv}
                        className="h-8 px-3 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-[var(--ember)]" />
                        <span>Export CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveRoute('map')}
                        className="h-8 px-3 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
                      >
                        <MapIcon className="w-3.5 h-3.5 text-[var(--viirs)]" />
                        <span>Open in Map Explorer</span>
                      </button>
                    </div>
                  </div>

                  {/* Analytical Mode Hairline Tabs */}
                  <div
                    role="tablist"
                    aria-label="AOI Analytical Views"
                    className="px-4 md:px-5 border-t border-[var(--border-subtle)] bg-[var(--surface-2)]/50 rounded-b-md flex items-center gap-5 overflow-x-auto no-scrollbar"
                  >
                    {[
                      { id: 'calendar' as const, label: 'Activity Calendar' },
                      { id: 'period-compare' as const, label: 'Historical Comparison' },
                      { id: 'aoi-compare' as const, label: 'Regional Comparison' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={analysisSubTab === t.id}
                        onClick={() => setAnalysisSubTab(t.id)}
                        className={`py-2.5 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                          analysisSubTab === t.id
                            ? 'border-[var(--ember)] text-[var(--text-primary)] font-semibold'
                            : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </section>

                {analysisSubTab === 'period-compare' && (
                  <PeriodComparisonPanel
                    activeAoi={activeAoi}
                    queryState={queryState}
                    parquetAvailable={Boolean(dataStatus.parquet_archive?.available)}
                    liveMaxDate={liveMaxDate}
                    onSelectAoiId={handleSelectPresetAoi}
                    onNotify={showToast}
                  />
                )}

                {analysisSubTab === 'aoi-compare' && (
                  <AoiComparisonPanel
                    activeAoi={activeAoi}
                    savedAois={savedAois}
                    queryState={queryState}
                    onNotify={showToast}
                  />
                )}

                {analysisSubTab === 'calendar' && (
                  <>
                    {calendarError && (
                      <div
                        role="alert"
                        className="px-4 py-2.5 rounded-md bg-[var(--danger)]/10 border border-[var(--danger)]/40 text-[12px] text-[var(--danger)] flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>
                          Could not load the updated observation summary ({calendarError}). Showing
                          last available snapshot if present.
                        </span>
                        <button
                          type="button"
                          onClick={retryCalendar}
                          className="px-3 py-1 rounded bg-[var(--surface-1)] border border-[var(--danger)]/45 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                        >
                          Retry query
                        </button>
                      </div>
                    )}

                    {/* Atlas Ledger Summary Strip (Hairline-Separated, Non-Equated Sensors) */}
                    <section
                      aria-label="AOI Activity Summary Strip"
                      aria-busy={isCalendarLoading}
                      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      {/* Metric 1: MODIS Detections */}
                      <div className="p-3.5 md:px-4 md:py-3.5 border-b sm:border-r lg:border-b-0 border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="w-2.5 h-2.5 bg-[var(--modis-fill)] inline-block rounded-[1px]" />
                            <span>MODIS Observed Detections</span>
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isCalendarLoading && (
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                Querying…
                              </span>
                            )}
                            <InfoPopover title="MODIS Collection 6.1" align="right">
                              <div className="space-y-1">
                                <p>
                                  Nominal ~1 km thermal anomaly detections from Terra and Aqua
                                  (MODIS Collection 6.1).
                                </p>
                                <p>
                                  Hotspot detections are not automatically confirmed fire incidents,
                                  and native 0–100 confidence is not equivalent to VIIRS confidence.
                                </p>
                              </div>
                            </InfoPopover>
                          </div>
                        </div>
                        {isCalendarLoading ? (
                          <div className="h-8 w-28 rounded atlas-skeleton" />
                        ) : (
                          <div className="text-[26px] leading-tight font-mono font-semibold text-[var(--modis)] tabular-nums">
                            {calendarAnalytics.totals.MODIS_detections.toLocaleString()}
                          </div>
                        )}
                        <div className="text-[11px] font-mono text-[var(--text-muted)]">
                          Terra {calendarAnalytics.totals.platform_totals.TERRA.toLocaleString()} ·
                          Aqua {calendarAnalytics.totals.platform_totals.AQUA.toLocaleString()}
                        </div>
                      </div>

                      {/* Metric 2: VIIRS Detections */}
                      <div className="p-3.5 md:px-4 md:py-3.5 border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-[var(--viirs-fill)] inline-block rounded-full" />
                            <span>VIIRS Observed Detections</span>
                          </span>
                          <InfoPopover title="VIIRS Collection 2" align="right">
                            <div className="space-y-1">
                              <p>
                                Nominal ~375 m I-band thermal anomaly detections from Suomi-NPP,
                                NOAA-20, and NOAA-21 (VIIRS Collection 2).
                              </p>
                              <p>
                                Detects smaller and cooler fires than MODIS 1 km, so raw counts
                                cannot be pooled as sensor-normalized activity. S-NPP archive ends
                                2026-11-02.
                              </p>
                            </div>
                          </InfoPopover>
                        </div>
                        {isCalendarLoading ? (
                          <div className="h-8 w-28 rounded atlas-skeleton" />
                        ) : (
                          <div className="text-[26px] leading-tight font-mono font-semibold text-[var(--viirs)] tabular-nums">
                            {calendarAnalytics.totals.VIIRS_detections.toLocaleString()}
                          </div>
                        )}
                        <div className="text-[11px] font-mono text-[var(--text-muted)]">
                          S-NPP {calendarAnalytics.totals.platform_totals.SNPP.toLocaleString()} ·
                          N20 {calendarAnalytics.totals.platform_totals.NOAA20.toLocaleString()} ·
                          N21 {calendarAnalytics.totals.platform_totals.NOAA21.toLocaleString()}
                        </div>
                      </div>

                      {/* Metric 3: Observed FRP Summary (MW) */}
                      <div className="p-3.5 md:px-4 md:py-3.5 border-b sm:border-b-0 sm:border-r border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
                          <span>Observed FRP · MW (Mean)</span>
                          <InfoPopover
                            title="Fire Radiative Power (MW)"
                            align="right"
                          >
                            <div className="space-y-1">
                              <p>
                                Fire Radiative Power (MW) — instantaneous heat output at satellite
                                overpass, not burned area, fire perimeter, or total fire size.
                              </p>
                              <p>
                                Means are calculated separately per sensor across records with valid
                                finite FRP values.
                              </p>
                            </div>
                          </InfoPopover>
                        </div>
                        {isCalendarLoading ? (
                          <div className="h-8 w-40 rounded atlas-skeleton" />
                        ) : (
                          <div className="text-[20px] leading-tight py-0.5 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                            M: {calendarAnalytics.totals.MODIS_frp.mean_mw ?? '—'} MW · V:{' '}
                            {calendarAnalytics.totals.VIIRS_frp.mean_mw ?? '—'} MW
                          </div>
                        )}
                        <div className="text-[11px] font-mono text-[var(--text-muted)]">
                          Valid: M ({calendarAnalytics.totals.MODIS_frp.valid_count.toLocaleString()})
                          {' '}· V ({calendarAnalytics.totals.VIIRS_frp.valid_count.toLocaleString()})
                        </div>
                      </div>

                      {/* Metric 4: Pooled Records */}
                      <div className="p-3.5 md:px-4 md:py-3.5 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
                          <span>Pooled Observation Records</span>
                          <InfoPopover
                            title="Pooled Observation Records"
                            align="right"
                          >
                            <div className="space-y-1">
                              <p>
                                Unweighted sum across sensors (MODIS + VIIRS), not unique fire
                                incidents or normalized fire activity.
                              </p>
                              <p>
                                Because MODIS (1 km) and VIIRS (375 m) differ in pixel footprint and
                                overpass timing, one fire can produce multiple detections.
                              </p>
                            </div>
                          </InfoPopover>
                        </div>
                        {isCalendarLoading ? (
                          <div className="h-8 w-28 rounded atlas-skeleton" />
                        ) : (
                          <div className="text-[24px] leading-tight font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                            {calendarAnalytics.totals.pooled_observation_count.toLocaleString()}
                          </div>
                        )}
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Unweighted sensor sum
                        </div>
                      </div>
                    </section>

                    {/* Main Analysis Grid: Burning-Activity Calendar (8/12) + Geographic Context Map Preview (4/12) */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
                      <div className="xl:col-span-8">
                        <CalendarHeatmap
                          analytics={calendarAnalytics}
                          selectedBinKey={selectedBin?.bin_key ?? null}
                          onSelectBin={(binKey) => updateQueryState({ selectedBinKey: binKey })}
                          onChangeGranularity={(g) =>
                            updateQueryState({ granularity: g, selectedBinKey: null })
                          }
                          onChangeSensor={(s) => updateQueryState({ sensor: s })}
                          onChangeMetric={(m) => updateQueryState({ calendarMetric: m })}
                          onApplyDatePreset={(startDate, endDate, granularity) =>
                            updateQueryState({
                              startDate,
                              endDate,
                              granularity,
                              selectedBinKey: null,
                            })
                          }
                          isLoading={isCalendarLoading}
                          liveMinDate={liveMinDate}
                          liveMaxDate={liveMaxDate}
                        />
                      </div>

                      {/* Supporting Geographic Context Map Preview */}
                      <div className="xl:col-span-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md flex flex-col overflow-hidden min-h-[360px]">
                        <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
                          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
                            AOI Spatial Context
                          </h2>
                          <button
                            type="button"
                            onClick={() => setIsLayersOpen((prev) => !prev)}
                            className="px-2.5 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1 transition-colors"
                          >
                            <SlidersHorizontal className="w-3 h-3 text-[var(--ember)]" />
                            <span>Filters</span>
                          </button>
                        </div>
                        <div className="flex-1 relative min-h-[300px]">
                          <MapCanvas
                            activeAoi={activeAoi}
                            observations={mapObservations}
                            selectedObservationId={queryState.selectedObservationId}
                            onSelectObservation={(obs) =>
                              updateQueryState({ selectedObservationId: obs.observation_id })
                            }
                            basemap={basemap}
                            onChangeBasemap={setBasemap}
                            overlays={overlays}
                            interactionMode="pan"
                            measurePoints={[]}
                            onAddMeasurePoint={() => {}}
                            measureUnitSystem={measureUnitSystem}
                            compactPreview
                            onOpenFullMap={() => setActiveRoute('map')}
                            visiblePlatforms={queryState.platforms}
                            onViewportChange={setMapViewport}
                            hotspotsMeta={hotspotsMeta}
                            excludeOffshore={queryState.excludeOffshore}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sensor & Platform Time-Series Comparison Chart */}
                    <SensorComparisonChart
                      analytics={calendarAnalytics}
                      selectedBinKey={selectedBin?.bin_key ?? null}
                      onSelectBin={(binKey) => updateQueryState({ selectedBinKey: binKey })}
                      isLoading={isCalendarLoading}
                    />

                    {/* Selected Time-Bin Detail & Canonical Observation Records */}
                    {selectedBin && (
                      <SelectedBinDetail
                        analytics={calendarAnalytics}
                        selectedBin={selectedBin}
                        binObservations={selectedBinObservations}
                        totalMatchingObservations={selectedBinTotalMatching}
                        isLoadingObservations={isBinObservationsLoading}
                        selectedObservationId={queryState.selectedObservationId}
                        onSelectObservation={(obs) =>
                          updateQueryState({ selectedObservationId: obs.observation_id })
                        }
                        onOpenMethodology={() => setActiveRoute('methodology')}
                        onOpenDataSources={() => setActiveRoute('data-sources')}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            <LayerDrawer
              isOpen={isLayersOpen}
              onClose={() => setIsLayersOpen(false)}
              platforms={dataStatus.platforms}
              queryState={queryState}
              onUpdateQueryState={updateQueryState}
              overlays={overlays}
              onUpdateOverlays={(patch) => setOverlays((prev) => ({ ...prev, ...patch }))}
              basemap={basemap}
              onChangeBasemap={setBasemap}
              mapDisplayMode={mapDisplayMode}
              onChangeMapDisplayMode={setMapDisplayMode}
              gridResolutionDeg={gridResolutionDeg}
              onChangeGridResolutionDeg={setGridResolutionDeg}
              autoRefreshMs={autoRefreshMs}
              onChangeAutoRefreshMs={setAutoRefreshMs}
              onManualRefresh={triggerManualRefresh}
            />

            <ObservationInspector
              observation={selectedObservation}
              onClose={() => updateQueryState({ selectedObservationId: null })}
            />
          </div>
        )}

        {/* WORKSPACE 3: DATA SOURCES (/data-sources) */}
        {activeRoute === 'data-sources' && (
          <div className="flex-1 h-full overflow-y-auto">
            <DataSourcesView dataStatus={dataStatus} />
          </div>
        )}

        {/* WORKSPACE 4: METHODOLOGY (/methodology) */}
        {activeRoute === 'methodology' && (
          <div className="flex-1 h-full overflow-y-auto">
            <MethodologyView />
          </div>
        )}

        {/* WORKSPACE 5: ABOUT FIRESCOPE (/about) */}
        {activeRoute === 'about' && (
          <div className="flex-1 h-full overflow-y-auto">
            <AboutView dataStatus={dataStatus} />
          </div>
        )}
      </main>

      {/* Capture Snapshot Modal */}
      {isCaptureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-label="Export Map & Provenance Snapshot"
            className="w-full max-w-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
                Capture Reproducible Analytical Snapshot
              </h2>
              <button
                type="button"
                onClick={() => setIsCaptureModalOpen(false)}
                aria-label="Close capture dialog"
                className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded bg-[var(--surface-2)] border border-[var(--border-subtle)] font-mono text-[11px] space-y-1.5">
              <div>
                <strong>AOI:</strong> {activeAoi.name} ([{activeAoi.bbox.west},{' '}
                {activeAoi.bbox.south}, {activeAoi.bbox.east}, {activeAoi.bbox.north}])
              </div>
              <div>
                <strong>Date Window (UTC):</strong> {queryState.startDate} → {queryState.endDate} (
                {queryState.granularity})
              </div>
              <div>
                <strong>Active Layers:</strong> {queryState.platforms.join(', ')}
              </div>
              <div>
                <strong>Observations in Window:</strong> MODIS (
                {calendarAnalytics.totals.MODIS_detections}) · VIIRS (
                {calendarAnalytics.totals.VIIRS_detections})
              </div>
              <div>
                <strong>Attribution:</strong> NASA FIRMS · ESDIS / LANCE ({calendarAnalytics.method.id})
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCaptureModalOpen(false)}
                className="h-8 px-3 rounded bg-[var(--surface-2)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDownloadCsv();
                  setIsCaptureModalOpen(false);
                }}
                className="h-8 px-3 rounded bg-[var(--ember)] hover:bg-[var(--ember-hover)] text-white text-[12px] font-medium"
              >
                Download Provenance CSV Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help & Keyboard Shortcuts Dialog */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-label="Help, Scientific Guide and Keyboard Shortcuts"
            className="w-full max-w-xl bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md shadow-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[var(--ember)]" />
                <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
                  FireScope Operational Guide &amp; Keyboard Shortcuts
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                aria-label="Close help dialog"
                className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-[12px] text-[var(--text-secondary)] leading-relaxed">
              <div className="p-3 rounded bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-1">
                <div className="font-semibold text-[var(--text-primary)]">
                  What does an active-fire detection represent?
                </div>
                <p>
                  A record represents a satellite-detected thermal anomaly within a pixel footprint
                  (nominally ~1 km for MODIS C6.1 and ~375 m for VIIRS C2) at the UTC overpass
                  time. It is not a confirmed fire incident, perimeter, or burned-area measurement.
                </p>
              </div>

              <div>
                <div className="font-semibold text-[var(--text-primary)] mb-1.5">
                  Keyboard Navigation
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] flex justify-between">
                    <span>Tab / Shift+Tab</span>
                    <span className="text-[var(--text-primary)]">Move focus</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] flex justify-between">
                    <span>Enter / Space</span>
                    <span className="text-[var(--text-primary)]">Select cell / toggle</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] flex justify-between">
                    <span>Escape</span>
                    <span className="text-[var(--text-primary)]">Close top drawer/tool</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] flex justify-between">
                    <span>Click + Drag</span>
                    <span className="text-[var(--text-primary)]">Pan map / Draw AOI</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] text-[12px]">
              <button
                type="button"
                onClick={() => {
                  setIsHelpModalOpen(false);
                  setActiveRoute('methodology');
                }}
                className="text-[var(--viirs)] hover:underline"
              >
                Read full M0/M1/M2 Methodology →
              </button>
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="h-8 px-4 rounded bg-[var(--ember)] hover:bg-[var(--ember-hover)] text-white font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
