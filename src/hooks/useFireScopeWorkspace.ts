import { useEffect, useMemo, useState } from 'react';
import { AppRoute } from '../components/GlobalHeader';
import {
  ActiveMapInteractionMode,
  BasemapStyle,
  MapOverlaySettings,
} from '../components/MapCanvas';
import { DockToolId } from '../components/ToolPanels';
import { PRESET_AOIS } from '../data/firmsArchiveData';
import { calculateGeometryMeasurement } from '../science/fireScience';
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
} from '../services/firescopeApi';
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
  SavedAoiRecord,
  SensorFilter,
  SharedQueryState,
} from '../types/firescope';
import {
  deleteSavedAoi,
  loadSavedAois,
  renameSavedAoi,
  saveAoiRecord,
} from '../utils/savedAois';

const THEME_STORAGE_KEY = 'firescope_theme';

function isAoiInIndonesiaArchive(aoi: AoiDefinition): boolean {
  const b = aoi.bbox;
  return (
    aoi.id !== 'global-world' &&
    b.east >= 94.5 &&
    b.west <= 141.8 &&
    b.north >= -11.5 &&
    b.south <= 6.5 &&
    b.east - b.west <= 60
  );
}

function resolveTargetAoi(
  aoiId: string,
  customAoi: AoiDefinition | null,
  savedAois: SavedAoiRecord[]
): AoiDefinition {
  if (customAoi && aoiId === customAoi.id) {
    return customAoi;
  }
  const savedMatch = savedAois.find((s) => s.aoi.id === aoiId);
  if (savedMatch) {
    return savedMatch.aoi;
  }
  return PRESET_AOIS.find((a) => a.id === aoiId) ?? PRESET_AOIS[0];
}

function readStoredThemeIsDark(): boolean {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

function writeStoredTheme(isDark: boolean): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {
    // Ignore storage write errors in restricted browsing contexts
  }
}

export function useFireScopeWorkspace() {
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

  const [isDark, setIsDark] = useState<boolean>(() => readStoredThemeIsDark());
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    writeStoredTheme(isDark);
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

  const [savedAois, setSavedAois] = useState<SavedAoiRecord[]>(() => loadSavedAois());

  const updateQueryState = (patch: Partial<SharedQueryState>) => {
    const projectedCustomAoi =
      patch.customAoi !== undefined ? patch.customAoi : queryState.customAoi;
    const projectedAoiId = patch.aoiId ?? queryState.aoiId;
    const projectedTargetAoi = resolveTargetAoi(projectedAoiId, projectedCustomAoi, savedAois);

    if (
      patch.startDate &&
      patch.startDate < '2024-01-01' &&
      !isAoiInIndonesiaArchive(projectedTargetAoi)
    ) {
      showToast('Switched AOI to Indonesia Archipelago (2001–2026 NASA FIRMS Archive)');
    }

    setQueryState((prev) => {
      const nextCustomAoi =
        patch.customAoi !== undefined ? patch.customAoi : prev.customAoi;
      const nextAoiId = patch.aoiId ?? prev.aoiId;
      const targetAoi = resolveTargetAoi(nextAoiId, nextCustomAoi, savedAois);

      if (
        patch.startDate &&
        patch.startDate < '2024-01-01' &&
        !isAoiInIndonesiaArchive(targetAoi)
      ) {
        return {
          ...prev,
          ...patch,
          aoiId: 'indonesia-archipelago',
          customAoi: null,
          selectedBinKey: null,
          selectedObservationId: null,
        };
      }

      if (
        (patch.aoiId !== undefined || patch.customAoi !== undefined) &&
        patch.startDate === undefined &&
        prev.startDate < '2024-01-01' &&
        !isAoiInIndonesiaArchive(targetAoi)
      ) {
        return {
          ...prev,
          ...patch,
          startDate: liveMinDate,
          endDate: liveMaxDate,
          granularity: 'day',
        };
      }

      return { ...prev, ...patch };
    });
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

  const [mapDisplayMode, setMapDisplayMode] = useState<MapDisplayMode>('points');
  const [gridResolutionDeg, setGridResolutionDeg] = useState<0.25 | 0.5 | 1.0 | 2.0>(0.5);
  const [gridData, setGridData] = useState<MapGridResponse | null>(null);
  const [autoRefreshMs, setAutoRefreshMs] = useState<AutoRefreshIntervalMs>(600000);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);
  const [analysisSubTab, setAnalysisSubTab] = useState<
    'calendar' | 'period-compare' | 'aoi-compare'
  >('calendar');

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

  useEffect(() => {
    if (autoRefreshMs === 0) return;
    const id = setInterval(() => {
      setRefreshNonce((n) => n + 1);
    }, autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs]);

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

  // Close map-only floating drawers and interactive draw/measure modes when leaving Map Explorer
  useEffect(() => {
    if (activeRoute !== 'map') {
      setActiveDockTool(null);
      setIsTimelineOpen(false);
      setInteractionMode('pan');
    }
  }, [activeRoute]);

  // Escape key handler
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
  const [isCalendarLoading, setIsCalendarLoading] = useState<boolean>(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarRetryNonce, setCalendarRetryNonce] = useState<number>(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsCalendarLoading(true);

    fetchCalendarAnalyticsFromApi(queryState, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          if (res) {
            setServerCalendarAnalytics(res);
          }
          setCalendarError(null);
          setIsCalendarLoading(false);
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
          setIsCalendarLoading(false);
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
    const withRecords = [...calendarAnalytics.series]
      .reverse()
      .find((b) => (b.pooled_observation_count ?? 0) > 0);
    return withRecords ?? calendarAnalytics.series[calendarAnalytics.series.length - 1];
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
  const [isBinObservationsLoading, setIsBinObservationsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedBin) {
      setIsBinObservationsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsBinObservationsLoading(true);

    fetchBoundedObservationsFromApi({
      state: queryState,
      startUtc: selectedBin.time_bin_start_utc,
      endUtc: selectedBin.time_bin_end_utc,
      limit: 150,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          if (res) {
            setServerSelectedBinObservations(res.items);
            setServerSelectedBinTotal(res.total_matching);
          }
          setIsBinObservationsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setServerSelectedBinObservations(null);
          setServerSelectedBinTotal(null);
          setIsBinObservationsLoading(false);
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
    const nextAoi = savedMatch
      ? savedMatch.aoi
      : PRESET_AOIS.find((a) => a.id === aoiId) ?? PRESET_AOIS[0];
    const shouldResetPre2024Window =
      queryState.startDate < '2024-01-01' && !isAoiInIndonesiaArchive(nextAoi);
    const windowResetPatch: Partial<SharedQueryState> = shouldResetPre2024Window
      ? {
          startDate: liveMinDate,
          endDate: liveMaxDate,
          granularity: 'day',
        }
      : {};

    if (savedMatch) {
      updateQueryState({
        aoiId: savedMatch.aoi.id,
        customAoi: savedMatch.aoi,
        selectedBinKey: null,
        selectedObservationId: null,
        ...windowResetPatch,
      });
      return;
    }
    updateQueryState({
      aoiId,
      customAoi: null,
      selectedBinKey: null,
      selectedObservationId: null,
      ...windowResetPatch,
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
    const shouldResetPre2024Window =
      queryState.startDate < '2024-01-01' && !isAoiInIndonesiaArchive(customAoi);

    updateQueryState({
      aoiId: customAoi.id,
      customAoi,
      selectedBinKey: null,
      selectedObservationId: null,
      ...(shouldResetPre2024Window
        ? {
            startDate: liveMinDate,
            endDate: liveMaxDate,
            granularity: 'day' as Granularity,
          }
        : {}),
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

  const triggerManualRefresh = () => {
    setRefreshNonce((n) => n + 1);
    showToast('Refreshing live NASA FIRMS streams...');
  };

  const retryCalendar = () => {
    setCalendarRetryNonce((n) => n + 1);
  };

  return {
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
  };
}
