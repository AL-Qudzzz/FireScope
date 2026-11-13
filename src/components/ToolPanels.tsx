import React, { useState } from 'react';
import {
  Bookmark,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  HelpCircle,
  Info,
  Layers,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Ruler,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  AoiDefinition,
  AutoRefreshIntervalMs,
  BoundingBox,
  CalendarBinRecord,
  GeoPoint,
  Granularity,
  MapDisplayMode,
  PlatformId,
  PlatformRegistryEntry,
  ProcessingStatus,
  SavedAoiRecord,
  SensorFilter,
  SharedQueryState,
} from '../types/firescope';
import { PRESET_AOIS } from '../data/firmsArchiveData';
import { calculateGeometryMeasurement, validateBoundingBox } from '../science/fireScience';
import {
  ActiveMapInteractionMode,
  BasemapStyle,
  MapOverlaySettings,
} from './MapCanvas';

export type DockToolId =
  | 'aoi'
  | 'layers'
  | 'timeline'
  | 'measure'
  | 'capture'
  | 'share'
  | 'more'
  | null;

interface MapToolDockProps {
  activeTool: DockToolId;
  onSelectTool: (tool: DockToolId) => void;
  isLayersOpen: boolean;
  onToggleLayers: () => void;
  isTimelineOpen: boolean;
  onToggleTimeline: () => void;
  onCaptureSnapshot: () => void;
  onShareUrl: () => void;
  onOpenHelp: () => void;
}

export const MapToolDock: React.FC<MapToolDockProps> = ({
  activeTool,
  onSelectTool,
  isLayersOpen,
  onToggleLayers,
  isTimelineOpen,
  onToggleTimeline,
  onCaptureSnapshot,
  onShareUrl,
  onOpenHelp,
}) => {
  const dockButtons = [
    {
      id: 'aoi' as const,
      label: 'AOI',
      active: activeTool === 'aoi',
      onClick: () => onSelectTool(activeTool === 'aoi' ? null : 'aoi'),
      icon: <Compass className="w-4 h-4" />,
    },
    {
      id: 'layers' as const,
      label: 'Layers',
      active: isLayersOpen,
      onClick: onToggleLayers,
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'timeline' as const,
      label: 'Timeline',
      active: isTimelineOpen,
      onClick: onToggleTimeline,
      icon: <CalendarIcon className="w-4 h-4" />,
    },
    {
      id: 'measure' as const,
      label: 'Measure',
      active: activeTool === 'measure',
      onClick: () => onSelectTool(activeTool === 'measure' ? null : 'measure'),
      icon: <Ruler className="w-4 h-4" />,
    },
    {
      id: 'capture' as const,
      label: 'Capture',
      active: false,
      onClick: onCaptureSnapshot,
      icon: <Camera className="w-4 h-4" />,
    },
    {
      id: 'share' as const,
      label: 'Share',
      active: false,
      onClick: onShareUrl,
      icon: <Share2 className="w-4 h-4" />,
    },
    {
      id: 'more' as const,
      label: 'Help',
      active: false,
      onClick: onOpenHelp,
      icon: <HelpCircle className="w-4 h-4" />,
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Map workspace tools"
      className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[10px] p-1.5 flex items-center gap-1 shadow-xl overflow-x-auto max-w-[95vw]"
    >
      {dockButtons.map((btn) => (
        <button
          key={btn.id}
          type="button"
          onClick={btn.onClick}
          aria-pressed={btn.active}
          className={`h-10 px-3 rounded-[6px] flex items-center gap-1.5 text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--ember)] ${
            btn.active
              ? 'bg-[var(--ember)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
          }`}
        >
          {btn.icon}
          <span>{btn.label}</span>
        </button>
      ))}
    </div>
  );
};

interface AoiSearchPanelProps {
  activeAoi: AoiDefinition;
  savedAois: SavedAoiRecord[];
  onSelectPresetAoi: (aoiId: string) => void;
  onSelectSavedAoi: (aoi: AoiDefinition) => void;
  onSaveCurrentAoi: (customLabel?: string) => void;
  onRenameSavedAoi: (aoiId: string, newName: string) => void;
  onDeleteSavedAoi: (aoiId: string) => void;
  onApplyCustomAoi: (aoi: AoiDefinition) => void;
  interactionMode: ActiveMapInteractionMode;
  onSetInteractionMode: (mode: ActiveMapInteractionMode) => void;
  onOpenAnalysis: () => void;
  onOpenPeriodCompare?: () => void;
  onClose: () => void;
}

export const AoiSearchPanel: React.FC<AoiSearchPanelProps> = ({
  activeAoi,
  savedAois,
  onSelectPresetAoi,
  onSelectSavedAoi,
  onSaveCurrentAoi,
  onRenameSavedAoi,
  onDeleteSavedAoi,
  onApplyCustomAoi,
  interactionMode,
  onSetInteractionMode,
  onOpenAnalysis,
  onOpenPeriodCompare,
  onClose,
}) => {
  const [tab, setTab] = useState<'search' | 'coordinates' | 'draw'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [westInput, setWestInput] = useState(String(activeAoi.bbox.west));
  const [southInput, setSouthInput] = useState(String(activeAoi.bbox.south));
  const [eastInput, setEastInput] = useState(String(activeAoi.bbox.east));
  const [northInput, setNorthInput] = useState(String(activeAoi.bbox.north));
  const [customName, setCustomName] = useState('');
  const [saveLabel, setSaveLabel] = useState('');
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);
  const [editingSavedText, setEditingSavedText] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);

  const filteredPresets = PRESET_AOIS.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.regionLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.biome.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleApplyCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const west = Number(westInput);
    const south = Number(southInput);
    const east = Number(eastInput);
    const north = Number(northInput);
    if (
      westInput.trim() === '' ||
      southInput.trim() === '' ||
      eastInput.trim() === '' ||
      northInput.trim() === '' ||
      [west, south, east, north].some((n) => !Number.isFinite(n))
    ) {
      setCoordError('Enter valid numeric WGS84 coordinates for West, South, East, and North.');
      return;
    }

    const validation = validateBoundingBox({ west, south, east, north });
    if (!validation.valid) {
      setCoordError(validation.error ?? 'Invalid bounding box coordinates.');
      return;
    }

    setCoordError(null);
    const geom = calculateGeometryMeasurement([
      { lat: south, lng: west },
      { lat: south, lng: east },
      { lat: north, lng: east },
      { lat: north, lng: west },
    ]);

    onApplyCustomAoi({
      id: 'custom-aoi',
      name:
        customName.trim() ||
        `WGS84 Box (${west.toFixed(2)}°, ${south.toFixed(2)}° to ${east.toFixed(2)}°, ${north.toFixed(2)}°)`,
      regionLabel: 'Custom Coordinate Extent',
      description: 'User-defined WGS84 coordinate bounding box.',
      geometryType: 'BBOX',
      bbox: { west, south, east, north },
      timezone: 'UTC',
      utcOffsetLabel: 'UTC+00:00',
      areaSqKm: Math.max(10, Math.round(geom.areaSqKm)),
      biome: 'User-Defined Region',
    });
  };

  return (
    <section
      aria-label="Area of Interest selection panel"
      className="w-[340px] max-w-[92vw] bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] shadow-xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[var(--ember)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Area of Interest
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Area of Interest panel"
          className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-3 bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[12px]">
          {(['search', 'coordinates', 'draw'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                if (t !== 'draw' && interactionMode.startsWith('draw-')) {
                  onSetInteractionMode('pan');
                }
              }}
              className={`py-1.5 rounded-[4px] font-medium capitalize transition-colors ${
                tab === t
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Body */}
      <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto">
        {tab === 'search' && (
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter reference regions or biomes..."
                aria-label="Search reference Areas of Interest"
                className="w-full h-8 pl-8 pr-7 rounded-[6px] bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-2 focus:outline-[var(--ember)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                  className="absolute right-2 top-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* P2 Persistent Personal Saved AOIs */}
            {savedAois.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-medium text-[var(--ember)] flex items-center gap-1.5">
                  <Bookmark className="w-3 h-3" />
                  <span>Saved AOIs ({savedAois.length})</span>
                </div>
                {savedAois.map((rec) => {
                  const isSelected = rec.aoi.id === activeAoi.id;
                  const isEditing = editingSavedId === rec.aoi.id;
                  return (
                    <div
                      key={rec.aoi.id}
                      className={`p-2 rounded-[6px] border ${
                        isSelected
                          ? 'bg-[var(--surface-2)] border-[var(--ember)]'
                          : 'bg-[var(--app-bg)]/60 border-[var(--border-subtle)]'
                      }`}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            onRenameSavedAoi(rec.aoi.id, editingSavedText);
                            setEditingSavedId(null);
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={editingSavedText}
                            onChange={(e) => setEditingSavedText(e.target.value)}
                            aria-label={`Rename ${rec.aoi.name}`}
                            className="flex-1 h-7 px-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)]"
                          />
                          <button
                            type="submit"
                            className="px-2 h-7 rounded bg-[var(--ember)] text-white text-[11px] font-medium"
                          >
                            Save
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectSavedAoi(rec.aoi)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                              {rec.aoi.name}
                            </div>
                            <div className="text-[10px] font-mono text-[var(--text-muted)]">
                              {rec.aoi.areaSqKm.toLocaleString()} km² · [{rec.aoi.bbox.west.toFixed(2)},{' '}
                              {rec.aoi.bbox.south.toFixed(2)}..{rec.aoi.bbox.east.toFixed(2)},{' '}
                              {rec.aoi.bbox.north.toFixed(2)}]
                            </div>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSavedId(rec.aoi.id);
                                setEditingSavedText(rec.aoi.name);
                              }}
                              aria-label={`Rename saved AOI ${rec.aoi.name}`}
                              className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteSavedAoi(rec.aoi.id)}
                              aria-label={`Delete saved AOI ${rec.aoi.name}`}
                              className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-3)]"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-1.5">
              {filteredPresets.map((aoi) => {
                const isSelected = aoi.id === activeAoi.id;
                return (
                  <button
                    key={aoi.id}
                    type="button"
                    onClick={() => onSelectPresetAoi(aoi.id)}
                    className={`w-full text-left p-2.5 rounded-[6px] border transition-colors ${
                      isSelected
                        ? 'bg-[var(--surface-2)] border-[var(--ember)] text-[var(--text-primary)]'
                        : 'bg-[var(--app-bg)]/50 border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                        {aoi.name}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[var(--ember)] shrink-0" />}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                      {aoi.regionLabel} · {aoi.areaSqKm.toLocaleString()} km² · {aoi.utcOffsetLabel}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'coordinates' && (
          <form onSubmit={handleApplyCoordinates} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Custom Area Label (optional)
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Southern Borneo Study Sector"
                className="w-full h-8 px-2.5 rounded-[6px] bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  West Lng (°E/W)
                </label>
                <input
                  type="text"
                  value={westInput}
                  onChange={(e) => setWestInput(e.target.value)}
                  placeholder="113.2"
                  className="w-full h-8 px-2 rounded-[6px] bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  East Lng (°E/W)
                </label>
                <input
                  type="text"
                  value={eastInput}
                  onChange={(e) => setEastInput(e.target.value)}
                  placeholder="115.0"
                  className="w-full h-8 px-2 rounded-[6px] bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  South Lat (°N/S)
                </label>
                <input
                  type="text"
                  value={southInput}
                  onChange={(e) => setSouthInput(e.target.value)}
                  placeholder="-3.2"
                  className="w-full h-8 px-2 rounded-[6px] bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  North Lat (°N/S)
                </label>
                <input
                  type="text"
                  value={northInput}
                  onChange={(e) => setNorthInput(e.target.value)}
                  placeholder="-1.8"
                  className="w-full h-8 px-2 rounded-[6px] bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]"
                />
              </div>
            </div>

            {coordError && (
              <div
                role="alert"
                className="p-2 rounded-[6px] bg-[var(--danger)]/15 border border-[var(--danger)] text-[11px] text-[var(--danger)]"
              >
                {coordError}
              </div>
            )}

            <button
              type="submit"
              className="w-full h-8 rounded-[6px] bg-[var(--surface-3)] hover:bg-[var(--ember)] text-[var(--text-primary)] hover:text-white text-[12px] font-medium transition-colors"
            >
              Validate &amp; Apply Bounding Box
            </button>
          </form>
        )}

        {tab === 'draw' && (
          <div className="space-y-2.5">
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              Draw an Area of Interest directly on the map canvas. Geometry area is calculated on the
              WGS84 ellipsoid.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  onSetInteractionMode(
                    interactionMode === 'draw-bbox' ? 'pan' : 'draw-bbox'
                  )
                }
                className={`py-2 px-3 rounded-[6px] border text-[12px] font-medium transition-colors ${
                  interactionMode === 'draw-bbox'
                    ? 'bg-[var(--ember)] border-[var(--ember)] text-white'
                    : 'bg-[var(--surface-2)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
                }`}
              >
                {interactionMode === 'draw-bbox' ? 'Drawing BBox...' : 'Draw Rectangle'}
              </button>
              <button
                type="button"
                onClick={() =>
                  onSetInteractionMode(
                    interactionMode === 'draw-polygon' ? 'pan' : 'draw-polygon'
                  )
                }
                className={`py-2 px-3 rounded-[6px] border text-[12px] font-medium transition-colors ${
                  interactionMode === 'draw-polygon'
                    ? 'bg-[var(--ember)] border-[var(--ember)] text-white'
                    : 'bg-[var(--surface-2)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
                }`}
              >
                {interactionMode === 'draw-polygon' ? 'Drawing Polygon...' : 'Draw Polygon'}
              </button>
            </div>
            {interactionMode !== 'pan' && (
              <button
                type="button"
                onClick={() => onSetInteractionMode('pan')}
                className="w-full py-1.5 rounded-[6px] bg-[var(--surface-2)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel Drawing &amp; Return to Pan
              </button>
            )}
          </div>
        )}

        {/* Selected AOI Summary */}
        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            Selected Area Summary
          </div>
          <div className="p-2.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">
              {activeAoi.name}
            </div>
            <div className="text-[11px] font-mono text-[var(--text-secondary)]">
              {activeAoi.geometryType} · [{activeAoi.bbox.west.toFixed(2)},{' '}
              {activeAoi.bbox.south.toFixed(2)}, {activeAoi.bbox.east.toFixed(2)},{' '}
              {activeAoi.bbox.north.toFixed(2)}]
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              Geometric extent: ~{activeAoi.areaSqKm.toLocaleString()} km² · Timezone:{' '}
              {activeAoi.timezone}
            </div>
            {activeAoi.id !== 'global-world' && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border-subtle)]">
                <input
                  type="text"
                  value={saveLabel}
                  onChange={(e) => setSaveLabel(e.target.value)}
                  placeholder="Optional saved AOI label..."
                  aria-label="Label for saved AOI"
                  className="flex-1 h-7 px-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    onSaveCurrentAoi(saveLabel || undefined);
                    setSaveLabel('');
                  }}
                  className="h-7 px-2.5 rounded bg-[var(--surface-3)] hover:bg-[var(--ember)] text-[11px] font-medium text-[var(--text-primary)] hover:text-white flex items-center gap-1 shrink-0"
                >
                  <Bookmark className="w-3 h-3" />
                  <span>Save AOI</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onOpenAnalysis}
              className="w-full h-9 rounded-[6px] bg-[var(--ember)] hover:bg-[var(--ember-hover)] text-white text-[13px] font-semibold transition-colors shadow-xs"
            >
              Open Activity Calendar
            </button>
            {onOpenPeriodCompare && (
              <button
                type="button"
                onClick={onOpenPeriodCompare}
                className="w-full h-8 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-primary)] transition-colors"
              >
                Compare Historical Years (2001–2026)
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

interface MeasurementPanelProps {
  interactionMode: ActiveMapInteractionMode;
  onSetInteractionMode: (mode: ActiveMapInteractionMode) => void;
  measurePoints: GeoPoint[];
  onUndoPoint: () => void;
  onClearPoints: () => void;
  unitSystem: 'metric' | 'imperial';
  onChangeUnitSystem: (u: 'metric' | 'imperial') => void;
  onClose: () => void;
}

export const MeasurementPanel: React.FC<MeasurementPanelProps> = ({
  interactionMode,
  onSetInteractionMode,
  measurePoints,
  onUndoPoint,
  onClearPoints,
  unitSystem,
  onChangeUnitSystem,
  onClose,
}) => {
  const stats = calculateGeometryMeasurement(measurePoints);

  return (
    <section
      aria-label="Geospatial measurement tool"
      className="w-[330px] max-w-[92vw] bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] shadow-xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Ruler className="w-4 h-4 text-[var(--ember)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Measure Geometry
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close measurement panel"
          className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Selector: Distance / Area / Pan */}
      <div className="grid grid-cols-3 gap-1.5 text-[12px]">
        <button
          type="button"
          onClick={() => onSetInteractionMode('measure-distance')}
          className={`py-1.5 px-2 rounded-[6px] border font-medium transition-colors ${
            interactionMode === 'measure-distance'
              ? 'bg-[var(--ember)] border-[var(--ember)] text-white'
              : 'bg-[var(--surface-2)] border-[var(--border-subtle)] text-[var(--text-primary)]'
          }`}
        >
          Distance
        </button>
        <button
          type="button"
          onClick={() => onSetInteractionMode('measure-area')}
          className={`py-1.5 px-2 rounded-[6px] border font-medium transition-colors ${
            interactionMode === 'measure-area'
              ? 'bg-[var(--ember)] border-[var(--ember)] text-white'
              : 'bg-[var(--surface-2)] border-[var(--border-subtle)] text-[var(--text-primary)]'
          }`}
        >
          Area
        </button>
        <button
          type="button"
          onClick={() => onSetInteractionMode('pan')}
          className={`py-1.5 px-2 rounded-[6px] border font-medium transition-colors ${
            interactionMode === 'pan'
              ? 'bg-[var(--surface-3)] border-[var(--border-subtle)] text-[var(--text-primary)]'
              : 'bg-[var(--surface-2)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
          }`}
        >
          Pan Map
        </button>
      </div>

      {/* Unit Toggle */}
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[var(--text-secondary)]">Measurement Units</span>
        <div className="flex bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => onChangeUnitSystem('metric')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
              unitSystem === 'metric'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            km / km²
          </button>
          <button
            type="button"
            onClick={() => onChangeUnitSystem('imperial')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
              unitSystem === 'imperial'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            mi / mi²
          </button>
        </div>
      </div>

      {/* Result Readout */}
      <div className="p-3 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[var(--text-secondary)]">Measured Distance</span>
          <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
            {unitSystem === 'metric'
              ? `${stats.distanceKm.toLocaleString()} km`
              : `${stats.distanceMi.toLocaleString()} mi`}
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[var(--text-secondary)]">Measured Geometry Area</span>
          <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
            {unitSystem === 'metric'
              ? `${stats.areaSqKm.toLocaleString()} km²`
              : `${stats.areaSqMi.toLocaleString()} mi²`}
          </span>
        </div>
        <div className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
          Vertices placed: {measurePoints.length}. Click on the map to add vertices.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={measurePoints.length === 0}
          onClick={onUndoPoint}
          className="flex-1 h-8 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 text-[12px] text-[var(--text-primary)] flex items-center justify-center gap-1.5 border border-[var(--border-subtle)]"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>Undo Point</span>
        </button>
        <button
          type="button"
          disabled={measurePoints.length === 0}
          onClick={onClearPoints}
          className="flex-1 h-8 rounded-[6px] bg-[var(--surface-2)] hover:bg-[var(--danger)]/20 disabled:opacity-40 text-[12px] text-[var(--text-primary)] flex items-center justify-center gap-1.5 border border-[var(--border-subtle)]"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        Note: Reports geometric distance or area of user-drawn coordinates, never satellite-derived
        burned area.
      </p>
    </section>
  );
};

interface LayerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: PlatformRegistryEntry[];
  queryState: SharedQueryState;
  onUpdateQueryState: (patch: Partial<SharedQueryState>) => void;
  overlays: MapOverlaySettings;
  onUpdateOverlays: (patch: Partial<MapOverlaySettings>) => void;
  basemap: BasemapStyle;
  onChangeBasemap: (style: BasemapStyle) => void;
  mapDisplayMode: MapDisplayMode;
  onChangeMapDisplayMode: (mode: MapDisplayMode) => void;
  gridResolutionDeg: 0.25 | 0.5 | 1.0 | 2.0;
  onChangeGridResolutionDeg: (deg: 0.25 | 0.5 | 1.0 | 2.0) => void;
  autoRefreshMs: AutoRefreshIntervalMs;
  onChangeAutoRefreshMs: (ms: AutoRefreshIntervalMs) => void;
  onManualRefresh: () => void;
}

export const LayerDrawer: React.FC<LayerDrawerProps> = ({
  isOpen,
  onClose,
  platforms,
  queryState,
  onUpdateQueryState,
  overlays,
  onUpdateOverlays,
  basemap,
  onChangeBasemap,
  mapDisplayMode,
  onChangeMapDisplayMode,
  gridResolutionDeg,
  onChangeGridResolutionDeg,
  autoRefreshMs,
  onChangeAutoRefreshMs,
  onManualRefresh,
}) => {
  if (!isOpen) return null;

  const togglePlatform = (pid: PlatformId) => {
    const exists = queryState.platforms.includes(pid);
    const next = exists
      ? queryState.platforms.filter((p) => p !== pid)
      : [...queryState.platforms, pid];
    onUpdateQueryState({ platforms: next });
  };

  return (
    <aside
      aria-label="Layers and sensor controls"
      className="w-[360px] max-w-[92vw] bg-[var(--surface-1)] border-l border-[var(--border-subtle)] h-full flex flex-col justify-between z-20 shadow-xl overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--ember)]" />
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
              Layers &amp; Sensor Filters
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Layers drawer"
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Overview vs Analyst Control Density Switch (Section 6.4) */}
        <div className="flex items-center justify-between bg-[var(--surface-2)] p-2.5 rounded-[6px] border border-[var(--border-subtle)]">
          <div>
            <div className="text-[12px] font-medium text-[var(--text-primary)]">
              Control Density
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {queryState.controlDensity === 'overview'
                ? 'Overview: standard sensor & platform toggles'
                : 'Analyst: native confidence & processing filters'}
            </div>
          </div>
          <div className="flex bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[11px]">
            <button
              type="button"
              onClick={() => onUpdateQueryState({ controlDensity: 'overview' })}
              className={`px-2.5 py-1 rounded font-medium ${
                queryState.controlDensity === 'overview'
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => onUpdateQueryState({ controlDensity: 'analyst' })}
              className={`px-2.5 py-1 rounded font-medium ${
                queryState.controlDensity === 'analyst'
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Analyst
            </button>
          </div>
        </div>

        {/* Group A — Active-fire detections */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Group A · Active-Fire Detections
            </h3>
            <div className="flex items-center gap-1 text-[11px]">
              {(['ALL', 'MODIS', 'VIIRS'] as SensorFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdateQueryState({ sensor: s })}
                  className={`px-2 py-0.5 rounded font-mono ${
                    queryState.sensor === s
                      ? 'bg-[var(--ember)] text-white font-semibold'
                      : 'bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            {platforms.map((p) => {
              const checked =
                queryState.platforms.includes(p.platform_id) &&
                (queryState.sensor === 'ALL' || queryState.sensor === p.sensor);
              const isSnppGap = p.status === 'NO_RECENT_DATA';

              return (
                <div
                  key={p.platform_id}
                  className={`p-2.5 rounded-[6px] border transition-colors ${
                    checked
                      ? 'bg-[var(--surface-2)] border-[var(--border-subtle)]'
                      : 'bg-[var(--app-bg)]/50 border-[var(--border-subtle)]/60 opacity-75'
                  }`}
                >
                  <label className="flex items-start justify-between gap-2 cursor-pointer">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePlatform(p.platform_id)}
                        className="mt-1 accent-[var(--ember)]"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 inline-block ${
                              p.sensor === 'MODIS' ? 'bg-[#FFB454] rounded-[1px]' : 'bg-[#61BDE0] rounded-full'
                            }`}
                          />
                          <span className="text-[13px] font-medium text-[var(--text-primary)]">
                            {p.display_name}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-muted)]">
                            {p.nominal_resolution}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono mt-0.5">
                          {p.collection} · {p.product_code}
                        </div>
                        <div className="text-[11px] mt-1 flex items-center gap-1.5">
                          <span
                            className={
                              isSnppGap
                                ? 'text-[var(--warning)] font-medium'
                                : 'text-[var(--success)] font-medium'
                            }
                          >
                            {isSnppGap
                              ? `Archive ends ${p.last_observation_date}`
                              : `Available through ${p.last_observation_date}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
              );
            })}
          </div>

          <label className="flex items-start justify-between gap-2.5 p-2.5 rounded-[6px] bg-[var(--surface-2)]/70 hover:bg-[var(--surface-2)] border border-[var(--border-subtle)] cursor-pointer">
            <div>
              <div className="text-[12px] font-medium text-[var(--text-primary)]">
                Exclude Offshore Oil/Gas Flares &amp; Sea Anomalies
              </div>
              <div className="text-[10px] text-[var(--text-muted)] leading-snug mt-0.5">
                Hides NASA FIRMS type=3 &amp; verified offshore rig flares (Natuna, Sarawak, Java
                Sea, Timor Sea, North Sea, Persian Gulf, etc.) without mutating raw NASA files.
              </div>
            </div>
            <input
              type="checkbox"
              checked={queryState.excludeOffshore}
              onChange={(e) => onUpdateQueryState({ excludeOffshore: e.target.checked })}
              aria-label="Exclude offshore oil and gas flares"
              className="mt-0.5 accent-[var(--ember)] shrink-0"
            />
          </label>
        </div>

        {/* Analyst Mode Native Filters (Never conflating MODIS and VIIRS confidence!) */}
        {queryState.controlDensity === 'analyst' && (
          <div className="p-3 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-primary)]">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--ember)]" />
              <span>Analyst Native Provenance Filters</span>
            </div>

            {/* Processing Status */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Processing State (NRT vs Standard Science Quality)
              </label>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                {(['ALL', 'STANDARD', 'NRT'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onUpdateQueryState({ processingStatus: st })}
                    className={`py-1 rounded font-mono ${
                      queryState.processingStatus === st
                        ? 'bg-[var(--ember)] text-white font-semibold'
                        : 'bg-[var(--app-bg)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Day / Night Overpass Filter */}
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Overpass Time Regime (Day / Night)
              </label>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                {[
                  { id: 'ALL' as const, label: 'All (D+N)' },
                  { id: 'D' as const, label: 'Day (D)' },
                  { id: 'N' as const, label: 'Night (N)' },
                ].map((dn) => (
                  <button
                    key={dn.id}
                    type="button"
                    onClick={() => onUpdateQueryState({ dayNight: dn.id })}
                    className={`py-1 rounded font-mono ${
                      queryState.dayNight === dn.id
                        ? 'bg-[var(--ember)] text-white font-semibold'
                        : 'bg-[var(--app-bg)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {dn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* MODIS Native Numeric Confidence (0–100) */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[var(--text-secondary)]">
                  MODIS Native Confidence (0–100)
                </span>
                <span className="font-mono text-[var(--modis)]">
                  ≥ {queryState.modisMinConfidence}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={90}
                step={10}
                value={queryState.modisMinConfidence}
                onChange={(e) =>
                  onUpdateQueryState({ modisMinConfidence: Number(e.target.value) })
                }
                aria-label="Minimum MODIS numeric confidence"
                className="w-full accent-[var(--modis)]"
              />
              <div className="text-[10px] text-[var(--text-muted)] mt-1">
                Note: Historical Parquet daily bins group confidence into &lt;30, ≥30, ≥80 buckets;
                live/raw views filter exact 0–100 values.
              </div>
            </div>

            {/* VIIRS Native Categorical Confidence (low / nominal / high) */}
            <div>
              <span className="block text-[11px] text-[var(--text-secondary)] mb-1">
                VIIRS C2 Categorical Confidence (Native)
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                {(['low', 'nominal', 'high'] as const).map((cat) => {
                  const active = queryState.viirsCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        const next = active
                          ? queryState.viirsCategories.filter((c) => c !== cat)
                          : [...queryState.viirsCategories, cat];
                        if (next.length > 0) {
                          onUpdateQueryState({ viirsCategories: next });
                        }
                      }}
                      className={`py-1 rounded capitalize font-mono border ${
                        active
                          ? 'bg-[var(--viirs)]/20 border-[var(--viirs)] text-[var(--text-primary)]'
                          : 'bg-[var(--app-bg)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">
                MODIS numeric and VIIRS categorical schemes are kept strictly separate.
              </div>
            </div>
          </div>
        )}

        {/* Group B — Map & Contextual Overlays (P2 Verifiable Only) */}
        <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Group B · Cartographic &amp; Contextual Overlays
          </h3>
          <div className="space-y-1.5 text-[12px]">
            {[
              {
                key: 'pixelFootprints' as const,
                label: 'Pixel Footprint Geometry (scan × track)',
              },
              {
                key: 'solarTerminator' as const,
                label: 'Solar Day/Night Terminator (Live UTC)',
              },
              {
                key: 'terrainHillshade' as const,
                label: 'Elevation Terrain Hillshade (Esri DEM)',
              },
              {
                key: 'graticuleGrid' as const,
                label: 'WGS84 Latitude / Longitude Graticule',
              },
              {
                key: 'adminBoundaries' as const,
                label: 'Regional & Administrative Boundaries',
              },
              {
                key: 'coastlines' as const,
                label: 'Continental & Island Coastlines',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between p-2 rounded-[6px] bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] cursor-pointer"
              >
                <span className="text-[var(--text-secondary)]">{item.label}</span>
                <input
                  type="checkbox"
                  checked={overlays[item.key]}
                  onChange={(e) => onUpdateOverlays({ [item.key]: e.target.checked })}
                  className="accent-[var(--ember)]"
                />
              </label>
            ))}
          </div>

          {/* P1 Spatial Grid / Clustering Layer Mode */}
          <div className="p-2.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-[var(--text-primary)]">
                Spatial Display Aggregation
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {mapDisplayMode.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
              {(['points', 'grid', 'cluster'] as MapDisplayMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeMapDisplayMode(mode)}
                  className={`py-1 rounded capitalize border ${
                    mapDisplayMode === mode
                      ? 'bg-[var(--ember)] border-[var(--ember)] text-white font-semibold'
                      : 'bg-[var(--app-bg)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {(mapDisplayMode === 'grid' || mapDisplayMode === 'cluster') && (
              <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)]">Grid Resolution</span>
                <div className="flex items-center gap-1 font-mono">
                  {([0.25, 0.5, 1.0, 2.0] as const).map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => onChangeGridResolutionDeg(deg)}
                      className={`px-1.5 py-0.5 rounded ${
                        gridResolutionDeg === deg
                          ? 'bg-[var(--surface-3)] text-[var(--ember)] font-semibold'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Group C — Basemap & Auto-Refresh (P2) */}
        <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Group C · OpenStreetMap, Satellite &amp; Auto-Refresh
          </h3>
          <div className="grid grid-cols-3 gap-1.5 text-[12px]">
            {(
              [
                { id: 'satellite' as const, label: 'Satellite' },
                { id: 'terrain' as const, label: 'Terrain (OSM)' },
                { id: 'reference' as const, label: 'OSM Map' },
              ]
            ).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onChangeBasemap(b.id)}
                className={`py-1.5 rounded-[6px] font-medium border ${
                  basemap === b.id
                    ? 'bg-[var(--surface-3)] border-[var(--ember)] text-[var(--text-primary)]'
                    : 'bg-[var(--surface-2)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="p-2.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[11px]">
            <div>
              <div className="font-medium text-[var(--text-primary)]">Live Feed Auto-Refresh</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Syncs /api/v1/data/status &amp; active view
              </div>
            </div>
            <div className="flex items-center gap-1">
              {(
                [
                  { ms: 0 as AutoRefreshIntervalMs, label: 'Off' },
                  { ms: 300000 as AutoRefreshIntervalMs, label: '5m' },
                  { ms: 600000 as AutoRefreshIntervalMs, label: '10m' },
                ]
              ).map((opt) => (
                <button
                  key={opt.ms}
                  type="button"
                  onClick={() => onChangeAutoRefreshMs(opt.ms)}
                  className={`px-2 py-1 rounded font-mono ${
                    autoRefreshMs === opt.ms
                      ? 'bg-[var(--ember)] text-white font-semibold'
                      : 'bg-[var(--app-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onManualRefresh}
                aria-label="Refresh live NASA FIRMS data now"
                title="Refresh now"
                className="w-7 h-7 rounded bg-[var(--app-bg)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-primary)] border border-[var(--border-subtle)]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-2)]/40 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            onUpdateQueryState({
              sensor: 'ALL',
              platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
              processingStatus: 'ALL',
              dayNight: 'ALL',
              modisMinConfidence: 0,
              viirsCategories: ['low', 'nominal', 'high'],
              excludeOffshore: true,
            })
          }
          className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
        >
          Reset Layers to Default
        </button>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          {queryState.platforms.length}/5 platforms active
        </span>
      </div>
    </aside>
  );
};

interface TimelineTrayProps {
  isOpen: boolean;
  onClose: () => void;
  queryState: SharedQueryState;
  onUpdateQueryState: (patch: Partial<SharedQueryState>) => void;
  series: CalendarBinRecord[];
  onOpenCalendarAnalysis: () => void;
  liveMinDate?: string;
  liveMaxDate?: string;
}

export const TimelineTray: React.FC<TimelineTrayProps> = ({
  isOpen,
  onClose,
  queryState,
  onUpdateQueryState,
  series,
  onOpenCalendarAnalysis,
  liveMinDate = '2026-11-12',
  liveMaxDate = '2026-11-13',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!isOpen) return null;

  const activeBinIdx = Math.max(
    0,
    series.findIndex((b) => b.bin_key === queryState.selectedBinKey)
  );
  const currentBin = series[activeBinIdx] ?? series[series.length - 1];

  const presets = [
    {
      label: 'TODAY (UTC Live)',
      startDate: liveMaxDate,
      endDate: liveMaxDate,
      granularity: 'day' as Granularity,
    },
    {
      label: '24HRS (Live NASA FIRMS)',
      startDate: liveMinDate,
      endDate: liveMaxDate,
      granularity: 'day' as Granularity,
    },
    {
      label: 'Oct–Nov 2026 Daily',
      startDate: '2026-10-15',
      endDate: liveMaxDate,
      granularity: 'day' as Granularity,
    },
    {
      label: '2024–2026 Monthly',
      startDate: '2024-01-01',
      endDate: liveMaxDate,
      granularity: 'month' as Granularity,
    },
    {
      label: '2015 El Niño (Monthly)',
      startDate: '2015-01-01',
      endDate: '2015-12-31',
      granularity: 'month' as Granularity,
    },
  ];

  const stepBin = (delta: number) => {
    if (series.length === 0) return;
    const nextIdx = Math.max(0, Math.min(series.length - 1, activeBinIdx + delta));
    onUpdateQueryState({ selectedBinKey: series[nextIdx].bin_key });
  };

  return (
    <section
      aria-label="Timeline and date range navigation"
      className="w-full max-w-[1060px] bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[8px] shadow-2xl p-3.5 space-y-3"
    >
      {/* Top Row: Presets + Date Inputs + Granularity + Close */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => {
            const isCurrent =
              queryState.startDate === p.startDate &&
              queryState.endDate === p.endDate &&
              queryState.granularity === p.granularity;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  onUpdateQueryState({
                    startDate: p.startDate,
                    endDate: p.endDate,
                    granularity: p.granularity,
                    selectedBinKey: null,
                  })
                }
                className={`px-2.5 py-1 rounded-[6px] text-[11px] font-medium transition-colors ${
                  isCurrent
                    ? 'bg-[var(--ember)] text-white'
                    : 'bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-mono">
            <input
              type="date"
              value={queryState.startDate}
              min="2001-01-01"
              max={queryState.endDate}
              onChange={(e) =>
                e.target.value && onUpdateQueryState({ startDate: e.target.value })
              }
              aria-label="Start date (UTC)"
              className="h-7 px-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            />
            <span className="text-[var(--text-muted)]">→</span>
            <input
              type="date"
              value={queryState.endDate}
              min={queryState.startDate}
              max={liveMaxDate}
              onChange={(e) =>
                e.target.value && onUpdateQueryState({ endDate: e.target.value })
              }
              aria-label="End date (UTC)"
              className="h-7 px-2 rounded bg-[var(--app-bg)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            />
          </div>

          <div className="flex bg-[var(--app-bg)] p-0.5 rounded-[6px] border border-[var(--border-subtle)] text-[11px]">
            {(['day', 'week', 'month'] as Granularity[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() =>
                  onUpdateQueryState({ granularity: g, selectedBinKey: null })
                }
                className={`px-2 py-0.5 rounded capitalize font-medium ${
                  queryState.granularity === g
                    ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close timeline tray"
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrubber & Mini Bar Strip */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => stepBin(-1)}
            aria-label="Previous time bin"
            className="w-7 h-7 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-primary)]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isPlaying) {
                stepBin(1);
              }
              setIsPlaying((prev) => !prev);
            }}
            aria-label={isPlaying ? 'Pause step playback' : 'Step forward'}
            title="Step through selected time bins"
            className="w-7 h-7 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--ember)]"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => stepBin(1)}
            aria-label="Next time bin"
            className="w-7 h-7 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-primary)]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Bin Bar Strip */}
        <div className="flex-1 flex items-end gap-1 h-12 bg-[var(--app-bg)] px-2 py-1.5 rounded-[6px] border border-[var(--border-subtle)] overflow-x-auto">
          {series.map((b) => {
            const isSelected = currentBin?.bin_key === b.bin_key;
            const modisVal = b.values.MODIS ?? 0;
            const viirsVal = b.values.VIIRS ?? 0;
            const modisH = Math.min(100, Math.max(8, modisVal * 3));
            const viirsH = Math.min(100, Math.max(8, viirsVal * 1.6));
            const isMissing = b.coverage_state === 'NO_SOURCE_DATA';

            return (
              <button
                key={b.bin_key}
                type="button"
                onClick={() => onUpdateQueryState({ selectedBinKey: b.bin_key })}
                title={`${b.label}: MODIS ${b.values.MODIS ?? 'N/A'}, VIIRS ${
                  b.values.VIIRS ?? 'N/A'
                }`}
                className={`flex-1 min-w-[16px] h-full flex items-end justify-center gap-[1px] rounded-xs px-0.5 transition-colors ${
                  isSelected
                    ? 'bg-[var(--surface-3)] ring-1 ring-[var(--selected)]'
                    : isMissing
                    ? 'pattern-missing-coverage'
                    : 'hover:bg-[var(--surface-2)]'
                }`}
              >
                {!isMissing && (
                  <>
                    <span
                      style={{ height: `${modisH}%` }}
                      className="w-1.5 bg-[#FFB454] rounded-t-[1px]"
                    />
                    <span
                      style={{ height: `${viirsH}%` }}
                      className="w-1.5 bg-[#61BDE0] rounded-t-[1px]"
                    />
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Bin Readout & Open Full Calendar CTA */}
        <div className="shrink-0 flex items-center gap-3">
          {currentBin && (
            <div className="text-right font-mono text-[11px] tabular-nums">
              <div className="font-semibold text-[var(--text-primary)]">
                {currentBin.label} (UTC)
              </div>
              <div className="text-[var(--text-secondary)]">
                <span className="text-[#FFB454]">
                  MODIS: {currentBin.values.MODIS ?? 'N/A'}
                </span>{' '}
                ·{' '}
                <span className="text-[#61BDE0]">
                  VIIRS: {currentBin.values.VIIRS ?? 'N/A'}
                </span>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onOpenCalendarAnalysis}
            className="h-8 px-3 rounded-[6px] bg-[var(--ember)] hover:bg-[var(--ember-hover)] text-white text-[12px] font-medium whitespace-nowrap"
          >
            Open Calendar
          </button>
        </div>
      </div>
    </section>
  );
};
