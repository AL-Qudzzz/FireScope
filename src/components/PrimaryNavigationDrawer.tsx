import React, { useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  Compass,
  Database,
  ExternalLink,
  HelpCircle,
  Info,
  Map as MapIcon,
  Share2,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AppRoute } from './GlobalHeader';
import { PRESET_AOIS } from '../data/firmsArchiveData';
import { AoiDefinition } from '../types/firescope';

interface PrimaryNavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  activeAoi: AoiDefinition;
  onSelectPresetAoi: (aoiId: string) => void;
  onOpenAoiTool?: () => void;
  onOpenTimelineTool?: () => void;
  onShareView?: () => void;
  onOpenHelpModal?: () => void;
}

export const PrimaryNavigationDrawer: React.FC<PrimaryNavigationDrawerProps> = ({
  isOpen,
  onClose,
  activeRoute,
  onNavigate,
  activeAoi,
  onSelectPresetAoi,
  onOpenAoiTool,
  onOpenTimelineTool,
  onShareView,
  onOpenHelpModal,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navItems: Array<{
    id: AppRoute;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'map',
      label: 'Global Map',
      subtitle: 'Interactive geospatial workspace, layers & observation clusters',
      icon: <MapIcon className="w-4 h-4" />,
    },
    {
      id: 'analysis',
      label: 'AOI Analysis',
      subtitle: 'Burning-activity calendar, sensor series, FRP & bin provenance',
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      id: 'data-sources',
      label: 'Data Sources',
      subtitle: 'Platform continuity, S-NPP status, NRT/Standard lag & checksums',
      icon: <Database className="w-4 h-4" />,
    },
    {
      id: 'methodology',
      label: 'Methodology',
      subtitle: 'M0/M1/M2 harmonization rules, confidence schemes & limitations',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'about',
      label: 'About FireScope',
      subtitle: 'Project scope, non-claims & NASA FIRMS attribution',
      icon: <Info className="w-4 h-4" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Primary application navigation"
        className="relative w-80 max-w-[88vw] bg-[var(--surface-1)] border-r border-[var(--border-subtle)] h-full flex flex-col justify-between z-10 shadow-xl"
      >
        <div className="p-4 space-y-5 overflow-y-auto flex-1">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <div className="text-[16px] font-semibold text-[var(--text-primary)]">
                FireScope
              </div>
              <div className="text-[12px] text-[var(--text-secondary)]">
                Field Atlas · Active-Fire Observation Analysis
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation drawer"
              className="min-w-[44px] min-h-[44px] md:min-w-8 md:min-h-8 md:w-8 md:h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-[var(--ember)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Destinations */}
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-[var(--text-muted)] px-2 pb-1">
              Workspace Destinations
            </div>
            {navItems.map((item) => {
              const active = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className={`w-full text-left px-3 py-2.5 min-h-[44px] rounded-md flex items-start gap-3 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ember)] ${
                    active
                      ? 'bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--ember)]/60'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  <span
                    className={`mt-0.5 ${
                      active ? 'text-[var(--ember)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <div>
                    <div className="text-[13px] font-medium text-[var(--text-primary)]">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] leading-snug mt-0.5">
                      {item.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Compact / Mobile Quick Utility Controls (ensures 100% feature parity on <1024px) */}
          {(onOpenAoiTool || onOpenTimelineTool || onShareView || onOpenHelpModal) && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1.5 lg:hidden">
              <div className="text-[11px] font-medium text-[var(--text-muted)] px-2">
                Quick Workspace Tools
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {onOpenAoiTool && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAoiTool();
                    }}
                    className="min-h-[44px] px-2.5 py-2 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] flex items-center gap-2 text-left"
                  >
                    <Compass className="w-3.5 h-3.5 text-[var(--ember)] shrink-0" />
                    <span className="truncate">Select AOI</span>
                  </button>
                )}
                {onOpenTimelineTool && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTimelineTool();
                    }}
                    className="min-h-[44px] px-2.5 py-2 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] flex items-center gap-2 text-left"
                  >
                    <Calendar className="w-3.5 h-3.5 text-[var(--ember)] shrink-0" />
                    <span className="truncate">Date Window</span>
                  </button>
                )}
                {onShareView && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onShareView();
                    }}
                    className="min-h-[44px] px-2.5 py-2 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] flex items-center gap-2 text-left"
                  >
                    <Share2 className="w-3.5 h-3.5 text-[var(--viirs)] shrink-0" />
                    <span className="truncate">Share Link</span>
                  </button>
                )}
                {onOpenHelpModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenHelpModal();
                    }}
                    className="min-h-[44px] px-2.5 py-2 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] flex items-center gap-2 text-left"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-[var(--modis)] shrink-0" />
                    <span className="truncate">Help &amp; Keys</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick Global AOI Switcher */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1.5">
            <div className="text-[11px] font-medium text-[var(--text-muted)] px-2">
              Reference Areas of Interest (AOIs)
            </div>
            {PRESET_AOIS.map((aoi) => {
              const isSelected = aoi.id === activeAoi.id;
              return (
                <button
                  key={aoi.id}
                  type="button"
                  onClick={() => {
                    onSelectPresetAoi(aoi.id);
                    onClose();
                  }}
                  className={`w-full text-left px-3 py-2 min-h-[44px] rounded-md text-[12px] transition-colors ${
                    isSelected
                      ? 'bg-[var(--surface-3)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="truncate">{aoi.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                    {aoi.regionLabel} · {aoi.areaSqKm.toLocaleString()} km²
                  </div>
                </button>
              );
            })}
          </div>

          {/* Scientific Guardrail Notice */}
          <div className="p-3 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-primary)]">
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--modis)] shrink-0" />
              <span>Analytical Scope Notice</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              FireScope presents satellite thermal-anomaly detections (M0–M2). It is not an
              emergency dispatch system, incident confirmation service, or burned-area
              estimator.
            </p>
          </div>
        </div>

        {/* Footer NASA FIRMS External Reference */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-2)]/50 space-y-2 pb-safe">
          <div className="text-[11px] text-[var(--text-secondary)]">
            External Reference Documentation
          </div>
          <div className="flex flex-col gap-1.5 text-[12px]">
            <a
              href="https://firms.modaps.eosdis.nasa.gov/map/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[var(--viirs)] hover:underline"
            >
              <span>NASA FIRMS Global Fire Map</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://www.earthdata.nasa.gov/data/tools/firms"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[var(--viirs)] hover:underline"
            >
              <span>NASA Earthdata FIRMS Overview</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
};
