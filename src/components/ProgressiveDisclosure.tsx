import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ChevronDown, ChevronUp, Info, X } from 'lucide-react';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type PopoverMode = 'hover' | 'pinned';

interface GlobalPopoverState {
  id: string | null;
  mode: PopoverMode | null;
}

// Module-level singleton store so only one InfoPopover can be open across the app at a time.
let activePopoverId: string | null = null;
let activePopoverMode: PopoverMode | null = null;
let popoverSnapshot: GlobalPopoverState = { id: null, mode: null };
const listeners = new Set<() => void>();

function setGlobalPopover(id: string | null, mode: PopoverMode | null): void {
  const nextId = mode === null ? null : id;
  const nextMode = nextId === null ? null : mode;
  if (activePopoverId === nextId && activePopoverMode === nextMode) return;

  activePopoverId = nextId;
  activePopoverMode = nextMode;
  popoverSnapshot = { id: activePopoverId, mode: activePopoverMode };
  listeners.forEach((listener) => listener());
}

function subscribePopover(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPopoverSnapshot(): GlobalPopoverState {
  return popoverSnapshot;
}

/**
 * Props for the progressive-disclosure InfoPopover component.
 */
export interface InfoPopoverProps {
  title: string;
  children: React.ReactNode;
  triggerLabel?: string;
  align?: 'left' | 'right';
  buttonClassName?: string;
}

/**
 * Compact hover-or-click popover for secondary scientific definitions, caveats,
 * and technical metadata without crowding primary Field Atlas views.
 */
export const InfoPopover: React.FC<InfoPopoverProps> = ({
  title,
  children,
  triggerLabel,
  align = 'left',
  buttonClassName = '',
}) => {
  const [shiftX, setShiftX] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shiftXRef = useRef(0);
  const hoverOpenedAtRef = useRef<number>(0);
  const closeTimerRef = useRef<number | null>(null);
  const panelId = useId();

  const popoverState = useSyncExternalStore(
    subscribePopover,
    getPopoverSnapshot,
    getPopoverSnapshot
  );
  const isOpen = popoverState.id === panelId;

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
      if (activePopoverId === panelId) {
        setGlobalPopover(null, null);
      }
    };
  }, [panelId]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        clearCloseTimer();
        setGlobalPopover(null, null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearCloseTimer();
        setGlobalPopover(null, null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Keep the floating panel inside the viewport horizontally (e.g., 390px mobile)
  // and flip upward when near the bottom edge.
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) {
      shiftXRef.current = 0;
      setShiftX(0);
      setOpenUpward(false);
      return;
    }

    const updatePosition = () => {
      const wrapper = wrapperRef.current;
      const panel = panelRef.current;
      if (!wrapper || !panel || typeof window === 'undefined') return;

      const wrapperRect = wrapper.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      if (panelRect.width === 0) return;

      const edgePadding = 16;
      const viewportWidth = window.innerWidth;
      const naturalLeft = panelRect.left - shiftXRef.current;
      const naturalRight = panelRect.right - shiftXRef.current;

      let nextShift = 0;
      if (naturalRight > viewportWidth - edgePadding) {
        nextShift = viewportWidth - edgePadding - naturalRight;
      }
      if (naturalLeft + nextShift < edgePadding) {
        nextShift = edgePadding - naturalLeft;
      }

      const roundedShift = Math.round(nextShift);
      if (roundedShift !== shiftXRef.current) {
        shiftXRef.current = roundedShift;
        setShiftX(roundedShift);
      }

      const shouldOpenUpward =
        wrapperRect.bottom + panelRect.height + 16 > window.innerHeight &&
        wrapperRect.top > panelRect.height + 16;
      setOpenUpward((prev) => (prev === shouldOpenUpward ? prev : shouldOpenUpward));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [isOpen, align]);

  const handleMouseEnter = () => {
    clearCloseTimer();
    if (activePopoverId !== panelId) {
      hoverOpenedAtRef.current = Date.now();
      setGlobalPopover(panelId, 'hover');
    }
  };

  const handleMouseLeave = () => {
    if (activePopoverId === panelId && activePopoverMode === 'hover') {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        if (activePopoverId === panelId && activePopoverMode === 'hover') {
          setGlobalPopover(null, null);
        }
      }, 100);
    }
  };

  const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearCloseTimer();
    if (activePopoverId === panelId && activePopoverMode === 'pinned') {
      setGlobalPopover(null, null);
    } else if (activePopoverId === panelId && activePopoverMode === 'hover') {
      if (Date.now() - hoverOpenedAtRef.current < 350) {
        setGlobalPopover(panelId, 'pinned');
      } else {
        setGlobalPopover(null, null);
      }
    } else {
      setGlobalPopover(panelId, 'pinned');
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        aria-label={title}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={handleTriggerClick}
        className={[
          'inline-flex items-center gap-1 rounded-full border transition-colors whitespace-nowrap font-sans font-medium normal-case tracking-normal cursor-pointer',
          triggerLabel ? 'px-2 py-0.5 text-[11px] leading-tight' : 'p-1',
          isOpen
            ? 'bg-[var(--surface-2)] border-[var(--border-strong)] text-[var(--text-primary)]'
            : 'bg-[var(--surface-2)]/70 hover:bg-[var(--surface-2)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          buttonClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {triggerLabel ? <span>{triggerLabel}</span> : null}
      </button>

      {isOpen ? (
        <div
          id={panelId}
          ref={panelRef}
          role="region"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
          style={shiftX !== 0 ? { transform: `translateX(${shiftX}px)` } : undefined}
          // ::before fills the 6px gap so moving the pointer from trigger to panel does not trigger onMouseLeave.
          className={`absolute ${
            openUpward
              ? "bottom-full mb-1.5 before:content-[''] before:absolute before:-bottom-1.5 before:inset-x-0 before:h-1.5"
              : "top-full mt-1.5 before:content-[''] before:absolute before:-top-1.5 before:inset-x-0 before:h-1.5"
          } ${
            align === 'right' ? 'right-0' : 'left-0'
          } z-50 w-64 sm:w-72 max-w-[calc(100vw-2rem)] p-3 rounded-md bg-[var(--surface-1)] border border-[var(--border-strong)] shadow-xl text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans font-normal normal-case tracking-normal whitespace-normal text-left`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-semibold text-[var(--text-primary)]">{title}</div>
            <button
              type="button"
              aria-label="Close info"
              onClick={(event) => {
                event.stopPropagation();
                clearCloseTimer();
                setGlobalPopover(null, null);
              }}
              className="p-0.5 -mr-1 -mt-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
};

/**
 * Props for the collapsible DisclosureAccordion component.
 */
export interface DisclosureAccordionProps {
  title: string;
  summaryBadge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Collapsible progressive-disclosure section for technical provenance, warnings,
 * archive checksums, and mathematical methodology formulas.
 */
export const DisclosureAccordion: React.FC<DisclosureAccordionProps> = ({
  title,
  summaryBadge,
  defaultOpen = false,
  children,
  className = '',
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={className || undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-3 py-2 rounded-md bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
      >
        <span className="flex flex-wrap items-center gap-2 min-w-0 text-left">
          <span>{title}</span>
          {summaryBadge ? (
            <span className="px-1.5 py-0.5 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] shrink-0">
              {summaryBadge}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div id={contentId} className="mt-2">
          {children}
        </div>
      ) : null}
    </div>
  );
};
