import React, { useEffect, useId, useRef, useState } from 'react';
import { FLAME_PATHS } from './BrandLogo';

export type FirmsSyncPhase = 'connecting' | 'streaming' | 'ready';

interface FirmsSyncOverlayProps {
  isSyncing: boolean;
  phase: FirmsSyncPhase;
  isManualTrigger?: boolean;
  liveConnected: boolean;
  liveCount?: number;
  onDismissEarly?: () => void;
}

const WHITE_FACET_FILLS = ['#FFFFFF', '#F8FAFC', '#F1F5F9', '#E2E8F0', '#F8FAFC'] as const;

export const FirmsSyncOverlay: React.FC<FirmsSyncOverlayProps> = ({
  isSyncing,
  phase,
  isManualTrigger = false,
  liveConnected,
  liveCount,
  onDismissEarly,
}) => {
  const titleId = useId();
  const statusId = useId();

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dismissedEarlyRef = useRef(false);

  const [shouldRender, setShouldRender] = useState<boolean>(isSyncing);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [enterMode, setEnterMode] = useState<'instant' | 'animate'>(
    isManualTrigger ? 'animate' : 'instant'
  );
  const [fillPct, setFillPct] = useState<number>(isSyncing ? 10 : 100);
  const [showEarlySkip, setShowEarlySkip] = useState<boolean>(false);

  // Open / re-open when syncing starts
  useEffect(() => {
    if (isSyncing) {
      dismissedEarlyRef.current = false;
      setIsClosing(false);
      setShouldRender(true);
      setFillPct((prev) => (prev >= 100 || !shouldRender ? 10 : prev));
      setEnterMode(isManualTrigger ? 'animate' : 'instant');
    }
  }, [isSyncing, isManualTrigger, shouldRender]);

  // Move keyboard focus into overlay when shown, restore cleanly after unmount
  useEffect(() => {
    if (!shouldRender || isClosing) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && !overlayRef.current?.contains(active)) {
      previousFocusRef.current = active;
    }
    overlayRef.current?.focus({ preventScroll: true });
  }, [shouldRender, isClosing]);

  useEffect(() => {
    if (shouldRender) return;
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    if (target && target !== document.body && target.isConnected) {
      requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
      });
    }
  }, [shouldRender]);

  // Smooth bottom-to-top milestone progression while NASA FIRMS syncs
  useEffect(() => {
    if (!shouldRender || !isSyncing) return;

    const targetCeiling = phase === 'connecting' ? 44 : 88;
    const floorMin = phase === 'streaming' ? 46 : 10;

    setFillPct((prev) => Math.max(prev, floorMin));

    const intervalId = window.setInterval(() => {
      setFillPct((prev) => {
        const clamped = Math.max(prev, floorMin);
        if (clamped >= targetCeiling) return clamped;
        const step = Math.max(0.65, (targetCeiling - clamped) * 0.085);
        return Math.min(targetCeiling, Number((clamped + step).toFixed(2)));
      });
    }, 85);

    return () => window.clearInterval(intervalId);
  }, [shouldRender, isSyncing, phase]);

  // Slow-network escape hatch after 7 seconds
  useEffect(() => {
    if (!shouldRender || !isSyncing) {
      setShowEarlySkip(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowEarlySkip(true);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [shouldRender, isSyncing]);

  // Complete fill to 100% before fading out smoothly
  useEffect(() => {
    if (!shouldRender || isSyncing || isClosing) return;

    setFillPct(100);
    const holdDelayMs = dismissedEarlyRef.current ? 40 : 480;
    const closeTimer = window.setTimeout(() => {
      setIsClosing(true);
    }, holdDelayMs);

    return () => window.clearTimeout(closeTimer);
  }, [shouldRender, isSyncing, isClosing]);

  // Wait for CSS exit transition/animations (Firefox & Chrome/Safari safe) before unmounting
  useEffect(() => {
    if (!shouldRender || !isClosing) return;

    let cancelled = false;
    const waitAndUnmount = async () => {
      const el = overlayRef.current;
      const animations = el?.getAnimations?.() ?? [];
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise<void>((resolve) => window.setTimeout(resolve, 420)),
        ]);
      } else {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 360));
      }
      if (!cancelled) {
        setShouldRender(false);
        setIsClosing(false);
      }
    };

    void waitAndUnmount();
    return () => {
      cancelled = true;
    };
  }, [shouldRender, isClosing]);

  if (!shouldRender) {
    return null;
  }

  const roundedPct = Math.max(0, Math.min(100, Math.round(fillPct)));
  const haloOpacity = Number((0.14 + 0.56 * (fillPct / 100)).toFixed(2));

  const statusText = !isSyncing
    ? liveConnected && typeof liveCount === 'number' && liveCount > 0
      ? `${liveCount.toLocaleString()} live detections ready`
      : 'NASA FIRMS ready'
    : phase === 'connecting'
    ? 'Connecting to NASA FIRMS…'
    : 'Syncing NASA FIRMS data…';

  const handleEarlyDismiss = () => {
    dismissedEarlyRef.current = true;
    setIsClosing(true);
    onDismissEarly?.();
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={statusId}
      tabIndex={-1}
      data-enter={enterMode}
      data-closing={isClosing ? 'true' : undefined}
      className="firescope-sync-overlay fixed inset-0 z-50 items-center justify-center px-6 py-8 select-none outline-none"
    >
      <div className="firescope-sync-card relative flex flex-col items-center text-center max-w-sm w-full">
        {/* Soft warm radial aura behind flame */}
        <div
          aria-hidden="true"
          data-active={isSyncing ? 'true' : 'false'}
          style={{
            opacity: haloOpacity,
            background:
              'radial-gradient(circle, rgba(254, 168, 3, 0.34) 0%, rgba(246, 43, 0, 0.14) 46%, transparent 72%)',
          }}
          className="firescope-flame-halo pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 w-44 h-44 rounded-full blur-xl"
        />

        {/* FireScope Flame Loader: White Base -> Bottom-to-Top Original Color Fill */}
        <div
          aria-hidden="true"
          className="relative w-24 h-24 sm:w-28 sm:h-28 mb-5 flex items-center justify-center"
        >
          {/* Base Pure White Icon Layer */}
          <svg
            viewBox="-25 0 180 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
          >
            {FLAME_PATHS.map((layer, index) => (
              <path
                key={`white-${layer.fill}`}
                d={layer.d}
                fill={WHITE_FACET_FILLS[index]}
                stroke={index > 0 ? 'rgba(148, 163, 184, 0.28)' : 'none'}
                strokeWidth={index > 0 ? '0.6' : undefined}
              />
            ))}
          </svg>

          {/* Clipped Full-Color Reveal Rising Upward */}
          <div
            style={{ '--sync-fill': `${fillPct}%` } as React.CSSProperties}
            className="firescope-flame-reveal absolute inset-0"
          >
            <svg
              viewBox="-25 0 180 180"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full drop-shadow-[0_4px_20px_rgba(246,43,0,0.35)]"
            >
              {FLAME_PATHS.map((layer) => (
                <path key={`color-${layer.fill}`} d={layer.d} fill={layer.fill} />
              ))}
            </svg>
          </div>
        </div>

        {/* Crisp Light Wordmark Over Smoked Blur Backdrop */}
        <h2
          id={titleId}
          className="text-[22px] sm:text-[24px] font-semibold tracking-tight leading-none mb-2"
        >
          <span className="text-[#F0783C]">Fire</span>
          <span className="text-[#F8FAFC]">Scope</span>
        </h2>

        {/* Concise Single-Line Sync Status */}
        <p
          id={statusId}
          className="text-[13px] font-medium tracking-wide text-[#CBD5E1] min-h-[20px] leading-snug"
        >
          {statusText}
        </p>

        {/* Visually Hidden Native Progress Element for Assistive Tech */}
        <progress
          max={100}
          value={roundedPct}
          aria-labelledby={statusId}
          className="sr-only"
        />

        {showEarlySkip && isSyncing && (
          <button
            type="button"
            onClick={handleEarlyDismiss}
            className="mt-5 px-3 py-1.5 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-[11px] font-medium text-[#CBD5E1] hover:text-white transition-colors"
          >
            Continue to map
          </button>
        )}
      </div>
    </div>
  );
};
