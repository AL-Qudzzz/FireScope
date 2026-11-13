import React from 'react';
import {
  Calendar,
  Compass,
  Database,
  FileSpreadsheet,
  HelpCircle,
  Layers,
  Map as MapIcon,
  Menu,
  Moon,
  Share2,
  Sun,
} from 'lucide-react';
import { AoiDefinition, DataStatusResponse, SharedQueryState } from '../types/firescope';

export type AppRoute = 'map' | 'analysis' | 'data-sources' | 'methodology' | 'about';

interface GlobalHeaderProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenNavDrawer: () => void;
  queryState: SharedQueryState;
  activeAoi: AoiDefinition;
  dataStatus: DataStatusResponse;
  onOpenAoiTool: () => void;
  onOpenTimelineTool: () => void;
  onOpenHelpModal: () => void;
  onShareView: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  activeRoute,
  onNavigate,
  onOpenNavDrawer,
  queryState,
  activeAoi,
  dataStatus,
  onOpenAoiTool,
  onOpenTimelineTool,
  onOpenHelpModal,
  onShareView,
  isDark,
  onToggleTheme,
}) => {
  return (
    <header className="h-14 px-3 md:px-4 bg-[var(--surface-1)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0 z-30 select-none">
      {/* Left Group: Menu + FireScope Wordmark + Workspace Switcher */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenNavDrawer}
          aria-label="Open primary navigation"
          title="Navigation menu"
          className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-[var(--ember)] transition-colors shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('map')}
          className="flex items-baseline gap-2 text-left focus-visible:outline-2 focus-visible:outline-[var(--ember)] rounded px-1 py-0.5 shrink-0"
        >
          <span className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
            FireScope
          </span>
          <span className="hidden 2xl:inline text-[11px] text-[var(--text-muted)] whitespace-nowrap">
            Active Fire Intelligence
          </span>
        </button>

        <span className="hidden sm:inline text-[var(--border-subtle)]" aria-hidden="true">
          |
        </span>

        {/* Workspace Mode Switcher: Map Explorer vs AOI Calendar Analysis */}
        <nav
          aria-label="Primary workspaces"
          className="hidden sm:flex items-center bg-[var(--app-bg)] p-0.5 rounded-md border border-[var(--border-subtle)] shrink-0"
        >
          <button
            type="button"
            onClick={() => onNavigate('map')}
            className={`px-2 py-1 rounded text-[12px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeRoute === 'map'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5 text-[var(--ember)]" />
            <span>Map Explorer</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('analysis')}
            className={`px-2 py-1 rounded text-[12px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeRoute === 'analysis'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-[var(--ember)]" />
            <span>AOI Analysis</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('data-sources')}
            className={`hidden xl:flex px-2 py-1 rounded text-[12px] font-medium items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeRoute === 'data-sources'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Sources</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('methodology')}
            className={`hidden xl:flex px-2 py-1 rounded text-[12px] font-medium items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeRoute === 'methodology'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Methods</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('about')}
            className={`hidden xl:flex px-2 py-1 rounded text-[12px] font-medium items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeRoute === 'about'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>About</span>
          </button>
        </nav>
      </div>

      {/* Center Group: Active AOI & Date Window Quick Triggers */}
      <div className="hidden lg:flex items-center gap-1.5 min-w-0 shrink">
        <button
          type="button"
          onClick={onOpenAoiTool}
          title="Change or draw Area of Interest (AOI)"
          className="h-8 px-2 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] flex items-center gap-1.5 text-[12px] text-[var(--text-primary)] transition-colors max-w-[155px] min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--ember)]"
        >
          <Compass className="w-3.5 h-3.5 text-[var(--ember)] shrink-0" />
          <span className="truncate font-medium">{activeAoi.name}</span>
        </button>

        <button
          type="button"
          onClick={onOpenTimelineTool}
          title="Adjust observation date window and granularity"
          className="h-8 px-2 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] flex items-center gap-1 text-[11px] text-[var(--text-primary)] font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--ember)]"
        >
          <span>
            {queryState.startDate} → {queryState.endDate}
          </span>
          <span className="hidden 2xl:inline text-[var(--text-muted)]">·</span>
          <span className="hidden 2xl:inline text-[11px] font-sans text-[var(--text-secondary)] capitalize">
            {queryState.granularity}
          </span>
        </button>
      </div>

      {/* Right Group: Live NASA FIRMS Status + Share + Theme + Help */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onNavigate('about')}
          title="Synchronized with Official NASA FIRMS Live Open Data CSV Streams (MODIS C6.1 & VIIRS C2) — Click to view Data Architecture in About"
          className="h-8 px-2.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--success)]/45 flex items-center gap-1.5 text-[11px] transition-colors whitespace-nowrap shrink-0"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--success)] inline-block shrink-0" />
          <span className="font-mono font-semibold text-[var(--success)]">
            {dataStatus.live_firms_connected ? 'LIVE FIRMS' : 'LIVE EONET'}
          </span>
          {typeof dataStatus.live_firms_count === 'number' &&
          dataStatus.live_firms_count > 0 ? (
            <>
              <span className="hidden sm:inline text-[var(--text-muted)]">·</span>
              <span className="hidden sm:inline font-mono text-[var(--text-primary)]">
                {dataStatus.live_firms_count.toLocaleString()} Active
              </span>
            </>
          ) : (
            typeof dataStatus.live_eonet_event_count === 'number' &&
            dataStatus.live_eonet_event_count > 0 && (
              <>
                <span className="hidden sm:inline text-[var(--text-muted)]">·</span>
                <span className="hidden sm:inline font-mono text-[var(--text-primary)]">
                  {dataStatus.live_eonet_event_count} Active
                </span>
              </>
            )
          )}
        </button>

        <button
          type="button"
          onClick={onShareView}
          aria-label="Share reproducible view link"
          title="Copy reproducible view URL"
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] border border-transparent hover:border-[var(--border-subtle)] transition-colors"
        >
          <Share2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to Field Atlas Light theme' : 'Switch to Field Atlas Dark theme'}
          title={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] border border-transparent hover:border-[var(--border-subtle)] transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenHelpModal}
          aria-label="Help and keyboard shortcuts"
          title="Help, scientific guide & keyboard shortcuts"
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] border border-transparent hover:border-[var(--border-subtle)] transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
