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
  const desktopTabClass = (route: AppRoute, hideBelowXl = false) =>
    `${
      hideBelowXl ? 'hidden xl:flex' : 'flex'
    } h-full px-2.5 text-[12px] font-medium items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
      activeRoute === route
        ? 'border-[var(--ember)] text-[var(--text-primary)] font-semibold'
        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
    }`;

  return (
    <header className="h-14 px-2.5 sm:px-3.5 md:px-5 bg-[var(--surface-1)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0 z-30 select-none w-full max-w-full overflow-hidden">
      {/* Left Group: Menu + Field Atlas Wordmark + Navigation Tabs */}
      <div className="flex items-center gap-2 sm:gap-3 h-full shrink-0">
        <button
          type="button"
          onClick={onOpenNavDrawer}
          aria-label="Open primary navigation"
          title="Navigation menu"
          className="min-w-[44px] min-h-[44px] md:min-w-8 md:min-h-8 md:w-8 md:h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('map')}
          className="flex items-center gap-2 text-left rounded px-1 py-1 shrink-0"
        >
          <span
            aria-hidden="true"
            className="w-2.5 h-2.5 border-[1.5px] border-[var(--ember)] bg-[var(--ember)]/20 inline-block shrink-0"
          />
          <span className="text-[15px] sm:text-[16px] font-semibold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
            FireScope
          </span>
        </button>

        <span className="hidden md:inline text-[var(--border-subtle)] shrink-0" aria-hidden="true">
          |
        </span>

        {/* Primary Workspaces Navigation */}
        <nav
          aria-label="Primary workspaces"
          className="flex items-center h-full gap-0.5 sm:gap-1 shrink-0"
        >
          <button
            type="button"
            onClick={() => onNavigate('map')}
            className={desktopTabClass('map')}
          >
            <MapIcon className="hidden sm:block w-3.5 h-3.5 text-[var(--ember)] shrink-0" />
            <span className="hidden xl:inline">Map Explorer</span>
            <span className="xl:hidden">Map</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('analysis')}
            className={desktopTabClass('analysis')}
          >
            <Calendar className="hidden sm:block w-3.5 h-3.5 text-[var(--ember)] shrink-0" />
            <span className="hidden xl:inline">AOI Analysis</span>
            <span className="xl:hidden">Analysis</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('data-sources')}
            className={desktopTabClass('data-sources', true)}
          >
            <Database className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Sources</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('methodology')}
            className={desktopTabClass('methodology', true)}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Methods</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('about')}
            className={desktopTabClass('about', true)}
          >
            <span>About</span>
          </button>
        </nav>
      </div>

      {/* Center Group: Unified AOI & Date Window Context Control (>=1024px Desktop) */}
      <div
        role="group"
        aria-label="Active query context"
        className="hidden lg:flex items-center h-8 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] divide-x divide-[var(--border-subtle)] min-w-0 shrink-0 overflow-hidden"
      >
        <button
          type="button"
          onClick={onOpenAoiTool}
          title="Change or draw Area of Interest (AOI)"
          className="h-full px-2.5 hover:bg-[var(--surface-3)] flex items-center gap-1.5 text-[12px] text-[var(--text-primary)] transition-colors max-w-[165px] xl:max-w-[195px] min-w-0"
        >
          <Compass className="w-3.5 h-3.5 text-[var(--ember)] shrink-0" />
          <span className="truncate font-medium">{activeAoi.name}</span>
        </button>

        <button
          type="button"
          onClick={onOpenTimelineTool}
          title="Adjust observation date window and granularity"
          className="h-full px-2.5 hover:bg-[var(--surface-3)] flex items-center gap-1.5 text-[11px] text-[var(--text-primary)] font-mono tabular-nums transition-colors whitespace-nowrap shrink-0"
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
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onNavigate('data-sources')}
          title="Live NASA FIRMS EOSDIS data status — Click to inspect Data Sources"
          className="min-h-[36px] md:min-h-0 h-8 px-2 sm:px-2.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] flex items-center gap-1.5 text-[10px] sm:text-[11px] transition-colors whitespace-nowrap shrink-0"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--success)] inline-block shrink-0" />
          <span className="font-mono font-semibold text-[var(--success)] sm:hidden">
            LIVE
          </span>
          <span className="font-mono font-semibold text-[var(--success)] hidden sm:inline">
            {dataStatus.live_firms_connected ? 'LIVE FIRMS' : 'LIVE EONET'}
          </span>
          {typeof dataStatus.live_firms_count === 'number' &&
          dataStatus.live_firms_count > 0 ? (
            <>
              <span className="hidden md:inline text-[var(--text-muted)]">·</span>
              <span className="hidden md:inline font-mono text-[var(--text-primary)]">
                {dataStatus.live_firms_count.toLocaleString()} Active
              </span>
            </>
          ) : (
            typeof dataStatus.live_eonet_event_count === 'number' &&
            dataStatus.live_eonet_event_count > 0 && (
              <>
                <span className="hidden md:inline text-[var(--text-muted)]">·</span>
                <span className="hidden md:inline font-mono text-[var(--text-primary)]">
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
          className="hidden sm:flex min-w-[40px] min-h-[40px] md:min-w-8 md:min-h-8 md:w-8 md:h-8 rounded-md items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] border border-transparent hover:border-[var(--border-subtle)] transition-colors"
        >
          <Share2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to Field Atlas Light theme' : 'Switch to Night Orbit Dark theme'}
          title={isDark ? 'Switch to Field Atlas Light' : 'Switch to Night Orbit Dark'}
          className="min-w-[44px] min-h-[44px] md:min-w-8 md:min-h-8 md:h-8 md:px-2 rounded-md flex items-center justify-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] border border-transparent hover:border-[var(--border-subtle)] transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
          <span className="hidden 2xl:inline">{isDark ? 'Dark' : 'Light'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenHelpModal}
          aria-label="Help and keyboard shortcuts"
          title="Help, scientific guide & keyboard shortcuts"
          className="hidden sm:flex min-w-[40px] min-h-[40px] md:min-w-8 md:min-h-8 md:w-8 md:h-8 rounded-md items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] border border-transparent hover:border-[var(--border-subtle)] transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
