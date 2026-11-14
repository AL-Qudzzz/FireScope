import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  ExternalLink,
  HelpCircle,
  Info,
  Layers,
  Map as MapIcon,
  Share2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { AppRoute, GlobalHeader } from './components/GlobalHeader';
import { PrimaryNavigationDrawer } from './components/PrimaryNavigationDrawer';
import {
  ActiveMapInteractionMode,
  BasemapStyle,
  MapCanvas,
  MapOverlaySettings,
} from './components/MapCanvas';
import {
  AoiSearchPanel,
  DockToolId,
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
import {
  computeCalendarFromState,
  fetchBoundedObservationsFromApi,
  fetchCalendarAnalyticsFromApi,
  fetchDataStatusFromApi,
  fetchLiveEonetForClient,
  fetchMapGridFromApi,
  fetchMapHotspotsFromApi,
  generateProvenanceCsv,
  getActiveAoi,
  getLocalDataStatus,
  queryBoundedObservations,
} from './services/firescopeApi';
import { PRESET_AOIS } from './data/firmsArchiveData';
import {
  AoiDefinition,
  AutoRefreshIntervalMs,
  BoundingBox,
  CalendarAnalyticsResponse,
  CanonicalObservation,
  DataStatusResponse,
  GeoPoint,
  Granularity,
  MapDisplayMode,
  MapGridResponse,
  PlatformId,
  SavedAoiRecord,
  SensorFilter,
  SharedQueryState,
} from './types/firescope';
import { calculateGeometryMeasurement } from './science/fireScience';
import {
  deleteSavedAoi,
  loadSavedAois,
  renameSavedAoi,
  saveAoiRecord,
} from './utils/savedAois';

export default function App() {
  // Parse initial URL search params if provided for reproducible shared links
  const initialUrlParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const [activeRoute, setActiveRoute] = useState<AppRoute>(() => {
    const viewParam = initialUrlParams.get('view');
    if (
      viewParam === 'analysis' ||
      viewParam === 'data-sources' ||
      viewParam === 'methodology' ||
      viewParam === 'about'
    ) {
      return viewParam;
    }
    return 'map';
  });

  const [isDark, setIsDark] = useState<boolean>(true);
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  const [queryState, setQueryState] = useState<SharedQueryState>(() => ({
    aoiId: initialUrlParams.get('aoi') || 'global-world',
    customAoi: null,
    startDate: initialUrlParams.get('start') || '2026-11-12',
    endDate: initialUrlParams.get('end') || '2026-11-13',
    granularity: (initialUrlParams.get('granularity') as Granularity) || 'day',
    sensor: (initialUrlParams.get('sensor') as SensorFilter) || 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
    excludeOffshore: true,
    calendarMetric: 'detection_count',
    controlDensity: 'overview',
    selectedBinKey: null,
    selectedObservationId: null,
  }));

  const updateQueryState = (patch: Partial<SharedQueryState>) => {
    setQueryState((prev) => ({ ...prev, ...patch }));
  };

  const activeAoi = useMemo(() => getActiveAoi(queryState), [queryState]);

  const [dataStatus, setDataStatus] = useState<DataStatusResponse>(() =>
    getLocalDataStatus()
  );
  const [liveEonetRecords, setLiveEonetRecords] = useState<CanonicalObservation[]>([]);

  const [mapViewport, setMapViewport] = useState<{
    west: number;
    south: number;
    east: number;
    north: number;
    zoom: number;
  }>({
    west: -180,
    south: -85,
    east: 180,
    north: 85,
    zoom: 2,
  });

  // Sync mapViewport immediately whenever activeAoi changes (critical when switching AOI in AOI Analysis)
  const activeAoiViewportKey = `${activeAoi.id}:${activeAoi.bbox.west},${activeAoi.bbox.south},${activeAoi.bbox.east},${activeAoi.bbox.north}`;
  useEffect(() => {
    if (activeAoi.id === 'global-world') {
      setMapViewport({
        west: -180,
        south: -85,
        east: 180,
        north: 85,
        zoom: 2,
      });
    } else {
      setMapViewport({
        west: activeAoi.bbox.west,
        south: activeAoi.bbox.south,
        east: activeAoi.bbox.east,
        north: activeAoi.bbox.north,
        zoom: 6,
      });
    }
  }, [activeAoi.id, activeAoiViewportKey]);

  const [mapObservations, setMapObservations] = useState<CanonicalObservation[]>([]);
  const [hotspotsMeta, setHotspotsMeta] = useState<{
    totalInViewport: number;
    totalGlobal: number;
    excludedOffshoreCount: number;
    sampled: boolean;
    isLoading: boolean;
  }>({
    totalInViewport: 0,
    totalGlobal: 0,
    excludedOffshoreCount: 0,
    sampled: false,
    isLoading: true,
  });

  // P1 Map Spatial Display Mode & P2 Auto-Refresh / Saved AOIs
  const [mapDisplayMode, setMapDisplayMode] = useState<MapDisplayMode>('points');
  const [gridResolutionDeg, setGridResolutionDeg] = useState<0.25 | 0.5 | 1.0 | 2.0>(0.5);
  const [gridData, setGridData] = useState<MapGridResponse | null>(null);
  const [savedAois, setSavedAois] = useState<SavedAoiRecord[]>(() => loadSavedAois());
  const [autoRefreshMs, setAutoRefreshMs] = useState<AutoRefreshIntervalMs>(600000);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);
  const [analysisSubTab, setAnalysisSubTab] = useState<'calendar' | 'period-compare' | 'aoi-compare'>('calendar');

  useEffect(() => {
    let isCancelled = false;

    fetchDataStatusFromApi()
      .then((status) => {
        if (isCancelled) return;
        setDataStatus(status);
        if (
          refreshNonce === 0 &&
          status.live_firms_connected &&
          status.live_firms_min_date &&
          status.live_firms_max_date &&
          !initialUrlParams.get('start') &&
          !initialUrlParams.get('end')
        ) {
          setQueryState((prev) => ({
            ...prev,
            startDate: status.live_firms_min_date!,
            endDate: status.live_firms_max_date!,
          }));
        }
      })
      .catch(() => {});

    fetchLiveEonetForClient()
      .then((res) => {
        if (isCancelled) return;
        if (res.connected && res.items.length > 0) {
          setLiveEonetRecords(res.items);
          setDataStatus((prev) => ({
            ...prev,
            live_eonet_connected: true,
            live_eonet_event_count: res.items.length,
            live_eonet_synced_at_utc: res.syncedAtUtc,
          }));
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [initialUrlParams, refreshNonce]);

  // P2 Periodic Frontend Auto-Refresh Timer (respects user-selected Off / 5m / 10m interval)
  useEffect(() => {
    if (autoRefreshMs === 0) return;
    const id = setInterval(() => {
      setRefreshNonce((n) => n + 1);
    }, autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs]);

  // Fetch viewport-bounded NASA FIRMS points (or P1 spatial grid/cluster aggregation) on pan/zoom/filter/refresh
  useEffect(() => {
    const controller = new AbortController();
    setHotspotsMeta((prev) => ({ ...prev, isLoading: true }));

    const timer = setTimeout(() => {
      if (mapDisplayMode === 'grid' || mapDisplayMode === 'cluster') {
        fetchMapGridFromApi({
          state: queryState,
          bounds: mapViewport,
          mode: mapDisplayMode,
          resolutionDeg: gridResolutionDeg,
          signal: controller.signal,
        })
          .then((res) => {
            if (!res) {
              setHotspotsMeta((prev) => ({ ...prev, isLoading: false }));
              return;
            }
            setGridData(res);
            setHotspotsMeta((prev) => ({ ...prev, isLoading: false }));
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setHotspotsMeta((prev) => ({ ...prev, isLoading: false }));
            }
          });
        return;
      }

      fetchMapHotspotsFromApi({
        state: queryState,
        bounds: mapViewport,
        zoom: mapViewport.zoom,
        signal: controller.signal,
      })
        .then((res) => {
          if (!res) {
            setHotspotsMeta((prev) => ({ ...prev, isLoading: false }));
            return;
          }
          setMapObservations(res.items);
          setHotspotsMeta({
            totalInViewport: res.total_in_viewport,
            totalGlobal: res.total_global_24h,
            excludedOffshoreCount: res.excluded_offshore_count ?? 0,
            sampled: res.sampled,
            isLoading: false,
          });
          if (res.total_global_24h > 0) {
            setDataStatus((prev) => ({
              ...prev,
              data_mode: res.data_mode,
              live_firms_connected: true,
              live_firms_count: res.total_global_24h,
              live_firms_synced_at_utc: res.synced_at_utc,
              live_firms_min_date: res.min_date,
              live_firms_max_date: res.max_date,
              latest_acquisition_utc: res.latest_acquisition_utc,
              retrieved_at_utc: res.synced_at_utc,
            }));
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setHotspotsMeta((prev) => ({ ...prev, isLoading: false }));
          }
        });
    }, 100);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    mapViewport,
    mapDisplayMode,
    gridResolutionDeg,
    refreshNonce,
    queryState.aoiId,
    queryState.customAoi,
    queryState.startDate,
    queryState.endDate,
    queryState.sensor,
    queryState.platforms,
    queryState.processingStatus,
    queryState.dayNight,
    queryState.modisMinConfidence,
    queryState.viirsCategories,
    queryState.excludeOffshore,
  ]);

  // Navigation & Tool Drawer states
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [activeDockTool, setActiveDockTool] = useState<DockToolId>(null);
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isContextStripExpanded, setIsContextStripExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Map appearance & interaction states
  const [basemap, setBasemap] = useState<BasemapStyle>('satellite');
  const [overlays, setOverlays] = useState<MapOverlaySettings>({
    adminBoundaries: true,
    graticuleGrid: true,
    coastlines: true,
    pixelFootprints: false,
    terrainHillshade: false,
    solarTerminator: false,
  });
  const [interactionMode, setInteractionMode] =
    useState<ActiveMapInteractionMode>('pan');
  const [measurePoints, setMeasurePoints] = useState<GeoPoint[]>([]);
  const [measureUnitSystem, setMeasureUnitSystem] = useState<'metric' | 'imperial'>(
    'metric'
  );

  // Escape key handler to close topmost drawer/modal or cancel drawing (Section 5.6 & 11.3)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isHelpModalOpen) {
          setIsHelpModalOpen(false);
        } else if (isCaptureModalOpen) {
          setIsCaptureModalOpen(false);
        } else if (queryState.selectedObservationId) {
          updateQueryState({ selectedObservationId: null });
        } else if (interactionMode !== 'pan') {
          setInteractionMode('pan');
        } else if (activeDockTool) {
          setActiveDockTool(null);
        } else if (isTimelineOpen) {
          setIsTimelineOpen(false);
        } else if (isLayersOpen) {
          setIsLayersOpen(false);
        } else if (isNavDrawerOpen) {
          setIsNavDrawerOpen(false);
        } else if (isContextStripExpanded) {
          setIsContextStripExpanded(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isHelpModalOpen,
    isCaptureModalOpen,
    queryState.selectedObservationId,
    interactionMode,
    activeDockTool,
    isTimelineOpen,
    isLayersOpen,
    isNavDrawerOpen,
    isContextStripExpanded,
  ]);

  // Active AOI is derived near queryState above so viewport sync stays consistent.

  const liveMinDate = dataStatus.live_firms_min_date ?? '2026-11-12';
  const liveMaxDate = dataStatus.live_firms_max_date ?? '2026-11-13';
  const liveWindowMode: 'today' | '24h' | 'archive' =
    queryState.startDate === liveMaxDate && queryState.endDate === liveMaxDate
      ? 'today'
      : queryState.startDate === liveMinDate && queryState.endDate === liveMaxDate
      ? '24h'
      : 'archive';

  const handleSelectLiveWindow = (mode: 'today' | '24h') => {
    updateQueryState({
      startDate: mode === 'today' ? liveMaxDate : liveMinDate,
      endDate: liveMaxDate,
      granularity: 'day',
      selectedBinKey: null,
    });
  };

  const localCalendarAnalytics = useMemo(
    () => computeCalendarFromState(queryState, liveEonetRecords),
    [queryState, liveEonetRecords]
  );
  const [serverCalendarAnalytics, setServerCalendarAnalytics] =
    useState<CalendarAnalyticsResponse | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarRetryNonce, setCalendarRetryNonce] = useState<number>(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchCalendarAnalyticsFromApi(queryState, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted && res) {
          setServerCalendarAnalytics(res);
          setCalendarError(null);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setServerCalendarAnalytics(null);
          setCalendarError(
            err instanceof Error
              ? err.message
              : 'Failed to load calendar analytics from server.'
          );
        }
      });
    return () => controller.abort();
  }, [
    queryState.aoiId,
    queryState.customAoi,
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
    refreshNonce,
    calendarRetryNonce,
  ]);

  const calendarAnalytics = serverCalendarAnalytics ?? localCalendarAnalytics;

  const selectedBin = useMemo(() => {
    if (calendarAnalytics.series.length === 0) return null;
    if (queryState.selectedBinKey) {
      const found = calendarAnalytics.series.find(
        (b) => b.bin_key === queryState.selectedBinKey
      );
      if (found) return found;
    }
    // Default to latest active bin with records or last bin
    const withRecords = [...calendarAnalytics.series]
      .reverse()
      .find((b) => (b.pooled_observation_count ?? 0) > 0);
    return (
      withRecords ?? calendarAnalytics.series[calendarAnalytics.series.length - 1]
    );
  }, [calendarAnalytics.series, queryState.selectedBinKey]);

  const localSelectedBinResult = useMemo(() => {
    if (!selectedBin) return { items: [] as CanonicalObservation[], total: 0 };
    const res = queryBoundedObservations({
      state: queryState,
      liveEonetRecords,
      startUtc: selectedBin.time_bin_start_utc,
      endUtc: selectedBin.time_bin_end_utc,
      limit: 150,
    });
    return { items: res.items, total: res.total_matching };
  }, [queryState, liveEonetRecords, selectedBin]);

  const [serverSelectedBinObservations, setServerSelectedBinObservations] =
    useState<CanonicalObservation[] | null>(null);
  const [serverSelectedBinTotal, setServerSelectedBinTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedBin) return;
    const controller = new AbortController();
    fetchBoundedObservationsFromApi({
      state: queryState,
      startUtc: selectedBin.time_bin_start_utc,
      endUtc: selectedBin.time_bin_end_utc,
      limit: 150,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted && res) {
          setServerSelectedBinObservations(res.items);
          setServerSelectedBinTotal(res.total_matching);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setServerSelectedBinObservations(null);
          setServerSelectedBinTotal(null);
        }
      });
    return () => controller.abort();
  }, [
    queryState.aoiId,
    queryState.customAoi,
    queryState.sensor,
    queryState.platforms,
    queryState.processingStatus,
    queryState.dayNight,
    queryState.modisMinConfidence,
    queryState.viirsCategories,
    selectedBin?.bin_key,
    refreshNonce,
  ]);

  const selectedBinObservations =
    serverSelectedBinObservations ?? localSelectedBinResult.items;
  const selectedBinTotalMatching =
    serverSelectedBinTotal ?? localSelectedBinResult.total;

  const selectedObservation = useMemo<CanonicalObservation | null>(() => {
    if (!queryState.selectedObservationId) return null;
    return (
      mapObservations.find(
        (o) => o.observation_id === queryState.selectedObservationId
      ) ??
      selectedBinObservations.find(
        (o) => o.observation_id === queryState.selectedObservationId
      ) ??
      null
    );
  }, [queryState.selectedObservationId, mapObservations, selectedBinObservations]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleSelectPresetAoi = (aoiId: string) => {
    const savedMatch = savedAois.find((s) => s.aoi.id === aoiId);
    if (savedMatch) {
      updateQueryState({
        aoiId: savedMatch.aoi.id,
        customAoi: savedMatch.aoi,
        selectedBinKey: null,
        selectedObservationId: null,
      });
      return;
    }
    updateQueryState({
      aoiId,
      customAoi: null,
      selectedBinKey: null,
      selectedObservationId: null,
    });
  };

  const handleSaveCurrentAoi = (customLabel?: string) => {
    const next = saveAoiRecord(activeAoi, customLabel);
    setSavedAois(next);
    const savedItem = next[0]?.aoi;
    if (savedItem) {
      updateQueryState({
        aoiId: savedItem.id,
        customAoi: savedItem,
      });
      showToast(`Saved AOI: ${savedItem.name}`);
    }
  };

  const handleRenameSavedAoi = (aoiId: string, newName: string) => {
    const next = renameSavedAoi(aoiId, newName);
    setSavedAois(next);
    const updated = next.find((s) => s.aoi.id === aoiId)?.aoi;
    if (updated && queryState.aoiId === aoiId) {
      updateQueryState({ customAoi: updated });
    }
    showToast('Renamed saved AOI.');
  };

  const handleDeleteSavedAoi = (aoiId: string) => {
    const next = deleteSavedAoi(aoiId);
    setSavedAois(next);
    if (queryState.aoiId === aoiId) {
      handleSelectPresetAoi('global-world');
    }
    showToast('Removed saved AOI.');
  };

  const handleApplyCustomAoi = (customAoi: AoiDefinition) => {
    updateQueryState({
      aoiId: customAoi.id,
      customAoi,
      selectedBinKey: null,
      selectedObservationId: null,
    });
    setInteractionMode('pan');
    showToast(`Applied Area of Interest: ${customAoi.name}`);
  };

  const handleFinishDrawBbox = (bbox: BoundingBox) => {
    const geom = calculateGeometryMeasurement([
      { lat: bbox.south, lng: bbox.west },
      { lat: bbox.south, lng: bbox.east },
      { lat: bbox.north, lng: bbox.east },
      { lat: bbox.north, lng: bbox.west },
    ]);
    handleApplyCustomAoi({
      id: 'custom-drawn-bbox',
      name: `Drawn Bounding Box (${bbox.west.toFixed(2)}°, ${bbox.south.toFixed(2)}° to ${bbox.east.toFixed(2)}°, ${bbox.north.toFixed(2)}°)`,
      regionLabel: 'User-Drawn Extent',
      description: 'Interactive bounding box drawn on map canvas.',
      geometryType: 'BBOX',
      bbox,
      timezone: 'UTC',
      utcOffsetLabel: 'UTC+00:00',
      areaSqKm: Math.max(10, Math.round(geom.areaSqKm)),
      biome: 'Custom Drawn Sector',
    });
  };

  const handleFinishDrawPolygon = (points: GeoPoint[], bbox: BoundingBox) => {
    const geom = calculateGeometryMeasurement(points);
    handleApplyCustomAoi({
      id: 'custom-drawn-polygon',
      name: `Drawn Polygon (${points.length} vertices, ~${Math.round(geom.areaSqKm).toLocaleString()} km²)`,
      regionLabel: 'User-Drawn Polygon',
      description: 'Interactive polygon geometry drawn on map canvas.',
      geometryType: 'POLYGON',
      bbox,
      polygon: points,
      timezone: 'UTC',
      utcOffsetLabel: 'UTC+00:00',
      areaSqKm: Math.max(10, Math.round(geom.areaSqKm)),
      biome: 'Custom Polygon Sector',
    });
  };

  const handleShareView = () => {
    const params = new URLSearchParams();
    params.set('view', activeRoute);
    params.set('aoi', queryState.aoiId);
    params.set('start', queryState.startDate);
    params.set('end', queryState.endDate);
    params.set('granularity', queryState.granularity);
    params.set('sensor', queryState.sensor);
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', shareUrl);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
    showToast(
      queryState.customAoi
        ? 'Updated URL parameters (Note: custom drawn vertices stay in current session).'
        : 'Copied reproducible view link (AOI, date window, granularity & sensor preserved).'
    );
  };

  const handleDownloadCsv = () => {
    const csvContent = generateProvenanceCsv(calendarAnalytics);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `firescope-${activeAoi.id}-${queryState.startDate}-to-${queryState.endDate}-${queryState.granularity}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported CSV with metric definitions, units (MW), and SHA-256 provenance.');
  };

  return (
    <div className="h-[100dvh] w-full max-w-full overflow-hidden flex flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      {/* 1. Global Application Header (Section 5.2) */}
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

      {/* 2. Slim Context & Provenance Strip (Section 5.3) */}
      <div className="bg-[var(--surface-2)] border-b border-[var(--border-subtle)] shrink-0 z-20">
        {/* Desktop & Tablet strip (>= 768px) */}
        <div className="hidden md:flex h-8 px-3 md:px-4 items-center justify-between gap-3 text-[11px] overflow-x-auto no-scrollbar whitespace-nowrap">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">
              AOI: {activeAoi.name}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              UTC Window: {queryState.startDate} to {queryState.endDate} ({queryState.granularity})
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Sensors:{' '}
              <strong className="font-mono text-[var(--text-primary)]">
                {queryState.sensor === 'ALL' ? 'MODIS + VIIRS (Separate M2)' : queryState.sensor}
              </strong>
            </span>
            {queryState.platforms.includes('SNPP') && queryState.endDate > '2026-11-02' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--warning)] font-medium">
                  Note: VIIRS S-NPP archive ends 2026-11-02
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono text-[var(--text-muted)] shrink-0">
            <span>Latest acq: {dataStatus.latest_acquisition_utc.slice(0, 16).replace('T', ' ')}Z</span>
            <span aria-hidden="true">·</span>
            <span>Method: {calendarAnalytics.method.id}</span>
          </div>
        </div>

        {/* Mobile compact bar + collapsible provenance details (< 768px) */}
        <div className="md:hidden px-2.5 py-1 flex flex-col gap-1 text-[11px]">
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
                UTC Window: <strong className="text-[var(--text-primary)]">{queryState.startDate} to {queryState.endDate} ({queryState.granularity})</strong>
              </div>
              <div>
                Sensors: <strong className="text-[var(--text-primary)]">{queryState.sensor === 'ALL' ? 'MODIS + VIIRS (Separate M2)' : queryState.sensor}</strong> · Method: <strong className="text-[var(--text-primary)]">{calendarAnalytics.method.id}</strong>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Latest acq: {dataStatus.latest_acquisition_utc.slice(0, 16).replace('T', ' ')}Z</span>
                {queryState.platforms.includes('SNPP') && queryState.endDate > '2026-11-02' && (
                  <span className="text-[var(--warning)]">VIIRS S-NPP archive ends 2026-11-02</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast Feedback Banner */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-24 right-4 z-50 bg-[var(--surface-1)] border border-[var(--ember)] text-[var(--text-primary)] px-3.5 py-2 rounded-[6px] shadow-xl text-[12px] flex items-center gap-2 max-w-[calc(100vw-32px)]"
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
            {/* Dominant Map Canvas */}
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

              {/* Floating Left Task Panel (AOI Search/Coordinates/Draw or Measure) — Section 5.1 */}
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
                    onUndoPoint={() =>
                      setMeasurePoints((prev) => prev.slice(0, -1))
                    }
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

            {/* Right-Side Layer Drawer (Section 6.3) */}
            <LayerDrawer
              isOpen={isLayersOpen}
              onClose={() => setIsLayersOpen(false)}
              platforms={dataStatus.platforms}
              queryState={queryState}
              onUpdateQueryState={updateQueryState}
              overlays={overlays}
              onUpdateOverlays={(patch) =>
                setOverlays((prev) => ({ ...prev, ...patch }))
              }
              basemap={basemap}
              onChangeBasemap={setBasemap}
              mapDisplayMode={mapDisplayMode}
              onChangeMapDisplayMode={setMapDisplayMode}
              gridResolutionDeg={gridResolutionDeg}
              onChangeGridResolutionDeg={setGridResolutionDeg}
              autoRefreshMs={autoRefreshMs}
              onChangeAutoRefreshMs={setAutoRefreshMs}
              onManualRefresh={() => {
                setRefreshNonce((n) => n + 1);
                showToast('Refreshing live NASA FIRMS streams...');
              }}
            />

            {/* Right-Side Observation Inspector Drawer (Section 8) */}
            <ObservationInspector
              observation={selectedObservation}
              onClose={() => updateQueryState({ selectedObservationId: null })}
            />
          </div>
        )}

        {/* WORKSPACE 2: AOI ANALYSIS — CALENDAR-FIRST (/analysis/:aoiId) (Section 7) */}
        {activeRoute === 'analysis' && (
          <div className="flex-1 h-full flex overflow-hidden">
            <div className="flex-1 h-full overflow-y-auto p-4 md:p-6 space-y-5">
              {/* 7.1 Page Hierarchy Row 1: AOI Title, Geometry Context & Shared Filter Toolbar */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-[18px] md:text-[20px] font-semibold text-[var(--text-primary)]">
                      {activeAoi.name}
                    </h1>
                    <span className="text-[12px] font-mono text-[var(--text-muted)]">
                      · {activeAoi.geometryType} [{activeAoi.bbox.west.toFixed(2)}°,{' '}
                      {activeAoi.bbox.south.toFixed(2)}° to {activeAoi.bbox.east.toFixed(2)}°,{' '}
                      {activeAoi.bbox.north.toFixed(2)}°]
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] max-w-3xl">
                    {activeAoi.description}
                  </p>
                </div>

                {/* Shared AOI Switcher, CSV Export & Map Return Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Select Area of Interest"
                    value={activeAoi.id}
                    onChange={(e) => handleSelectPresetAoi(e.target.value)}
                    className="h-8 px-2.5 rounded-[6px] bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]"
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
                            ★ {s.aoi.name}
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
                    className="h-8 px-3 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-primary)] flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--ember)]" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveRoute('map')}
                    className="h-8 px-3 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-primary)] flex items-center gap-1.5"
                  >
                    <MapIcon className="w-3.5 h-3.5 text-[var(--viirs)]" />
                    <span>Open in Map Explorer</span>
                  </button>
                </div>
              </div>

              {/* Analytical Mode Tabs */}
              <div
                role="tablist"
                aria-label="AOI Analytical Views"
                className="flex flex-wrap items-center gap-1 bg-[var(--surface-1)] p-1 rounded-[8px] border border-[var(--border-subtle)] w-fit"
              >
                {[
                  { id: 'calendar' as const, label: 'Activity Calendar' },
                  { id: 'period-compare' as const, label: 'Compare History' },
                  { id: 'aoi-compare' as const, label: 'Compare Regions' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={analysisSubTab === t.id}
                    onClick={() => setAnalysisSubTab(t.id)}
                    className={`px-3.5 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors whitespace-nowrap ${
                      analysisSubTab === t.id
                        ? 'bg-[var(--ember)] text-white shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

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
                      className="px-4 py-2.5 rounded-[8px] bg-[var(--danger)]/10 border border-[var(--danger)]/35 text-[12px] text-[var(--danger)] flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>Server calendar query error: {calendarError}</span>
                      <button
                        type="button"
                        onClick={() => setCalendarRetryNonce((n) => n + 1)}
                        className="px-2.5 py-1 rounded bg-[var(--surface-1)] border border-[var(--danger)]/40 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {/* 7.2 Inline Activity Summary Strip (Vertical Dividers, No Generic KPI Cards!) */}
                  <section
                    aria-label="AOI Activity Summary Strip"
                    className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 flex flex-wrap items-center justify-between gap-y-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)]"
                  >
                    {/* Metric 1: MODIS Detections */}
                    <div className="w-full sm:w-auto sm:pr-5 space-y-0.5">
                      <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                        <span className="w-2.5 h-2.5 bg-[#FFB454] inline-block rounded-[1px]" />
                        <span>MODIS Observed Detections</span>
                      </div>
                      <div className="text-[22px] font-mono font-semibold text-[#FFB454] tabular-nums">
                        {calendarAnalytics.totals.MODIS_detections.toLocaleString()}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        Terra: {calendarAnalytics.totals.platform_totals.TERRA.toLocaleString()} · Aqua:{' '}
                        {calendarAnalytics.totals.platform_totals.AQUA.toLocaleString()} · 1 km C6.1
                      </div>
                    </div>

                    {/* Metric 2: VIIRS Detections */}
                    <div className="w-full sm:w-auto pt-2 sm:pt-0 sm:px-5 space-y-0.5">
                      <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                        <span className="w-2.5 h-2.5 bg-[#61BDE0] inline-block rounded-full" />
                        <span>VIIRS Observed Detections</span>
                      </div>
                      <div className="text-[22px] font-mono font-semibold text-[#61BDE0] tabular-nums">
                        {calendarAnalytics.totals.VIIRS_detections.toLocaleString()}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        S-NPP: {calendarAnalytics.totals.platform_totals.SNPP.toLocaleString()} · N20:{' '}
                        {calendarAnalytics.totals.platform_totals.NOAA20.toLocaleString()} · N21:{' '}
                        {calendarAnalytics.totals.platform_totals.NOAA21.toLocaleString()}
                      </div>
                    </div>

                    {/* Metric 3: Observed FRP Summary (MW) */}
                    <div className="w-full sm:w-auto pt-2 sm:pt-0 sm:px-5 space-y-0.5">
                      <div className="text-[12px] text-[var(--text-secondary)]">
                        Observed FRP · MW (Mean / Valid Records)
                      </div>
                      <div className="text-[18px] font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                        M: {calendarAnalytics.totals.MODIS_frp.mean_mw ?? '—'} MW · V:{' '}
                        {calendarAnalytics.totals.VIIRS_frp.mean_mw ?? '—'} MW
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        Valid FRP records: MODIS ({calendarAnalytics.totals.MODIS_frp.valid_count.toLocaleString()}) ·
                        VIIRS ({calendarAnalytics.totals.VIIRS_frp.valid_count.toLocaleString()})
                      </div>
                    </div>

                    {/* Metric 4: Pooled Records (Explicitly Labeled as Non-Normalized!) */}
                    <div className="w-full sm:w-auto pt-2 sm:pt-0 sm:pl-5 space-y-0.5">
                      <div className="text-[12px] text-[var(--text-secondary)]">
                        Pooled Observations (Unweighted Sum)
                      </div>
                      <div className="text-[20px] font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                        {calendarAnalytics.totals.pooled_observation_count.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Not a harmonized cross-sensor or unique fire count
                      </div>
                    </div>
                  </section>

                  {/* 7.3 Main Analysis Grid: Burning-Activity Calendar (8/12) + Geographic Context Map Preview (4/12) */}
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
                        onOpenCompareHistory={() => setAnalysisSubTab('period-compare')}
                        liveMinDate={liveMinDate}
                        liveMaxDate={liveMaxDate}
                      />
                    </div>

                    {/* Supporting Geographic Context Map Preview */}
                    <div className="xl:col-span-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] flex flex-col overflow-hidden min-h-[360px]">
                      <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                        <div>
                          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
                            AOI Spatial Context
                          </h2>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            Synchronized with selected date &amp; sensor filters
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsLayersOpen((prev) => !prev)}
                          className="px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] flex items-center gap-1"
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

                  {/* 7.5 Sensor & Platform Time-Series Comparison Chart */}
                  <SensorComparisonChart
                    analytics={calendarAnalytics}
                    selectedBinKey={selectedBin?.bin_key ?? null}
                    onSelectBin={(binKey) => updateQueryState({ selectedBinKey: binKey })}
                  />

                  {/* 7.6 Selected Time-Bin Detail & Canonical Observation Records */}
                  {selectedBin && (
                    <SelectedBinDetail
                      analytics={calendarAnalytics}
                      selectedBin={selectedBin}
                      binObservations={selectedBinObservations}
                      totalMatchingObservations={selectedBinTotalMatching}
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

            {/* Optional Filter / Layer Drawer & Observation Inspector in Analysis Workspace */}
            <LayerDrawer
              isOpen={isLayersOpen}
              onClose={() => setIsLayersOpen(false)}
              platforms={dataStatus.platforms}
              queryState={queryState}
              onUpdateQueryState={updateQueryState}
              overlays={overlays}
              onUpdateOverlays={(patch) =>
                setOverlays((prev) => ({ ...prev, ...patch }))
              }
              basemap={basemap}
              onChangeBasemap={setBasemap}
              mapDisplayMode={mapDisplayMode}
              onChangeMapDisplayMode={setMapDisplayMode}
              gridResolutionDeg={gridResolutionDeg}
              onChangeGridResolutionDeg={setGridResolutionDeg}
              autoRefreshMs={autoRefreshMs}
              onChangeAutoRefreshMs={setAutoRefreshMs}
              onManualRefresh={() => {
                setRefreshNonce((n) => n + 1);
                showToast('Refreshing live NASA FIRMS streams...');
              }}
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

      {/* Capture Snapshot Modal (Section 6.6) */}
      {isCaptureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-label="Export Map & Provenance Snapshot"
            className="w-full max-w-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] shadow-2xl p-5 space-y-4"
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

            <div className="p-3.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] font-mono text-[11px] space-y-1.5">
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
                className="h-8 px-3 rounded-[6px] bg-[var(--surface-2)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDownloadCsv();
                  setIsCaptureModalOpen(false);
                }}
                className="h-8 px-3 rounded-[6px] bg-[var(--ember)] hover:bg-[var(--ember-hover)] text-white text-[12px] font-medium"
              >
                Download Provenance CSV Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help & Keyboard Shortcuts Dialog (Section 6.6 & 11.3) */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-label="Help, Scientific Guide and Keyboard Shortcuts"
            className="w-full max-w-xl bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] shadow-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto"
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
              <div className="p-3 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-1">
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
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
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
                className="h-8 px-4 rounded-[6px] bg-[var(--ember)] text-white font-medium"
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
