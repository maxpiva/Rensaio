"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Sparkles, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SeriesStatus } from "@/lib/api/types";
import { getStatusDisplay } from "@/lib/utils/series-status";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";

/**
 * SpotlightHero — the big cinematic hero that sits at the top of the Library
 * and Browse pages. Shows up to 5 spotlight series with auto-advancing
 * thumbnails on the right, a blurred backdrop of the active series cover,
 * a 200×280 floating crisp cover with a status-colored top strip, an eyebrow
 * label, a large display title, a status pill, a meta strip, a gradient-faded
 * description, tag chips, and a single pink primary CTA.
 *
 * Implementation notes:
 *
 * - Auto-advance every {@link SpotlightHeroProps.autoAdvanceMs} (default 8s),
 *   paused for {@link SpotlightHeroProps.pauseAfterManualMs} (default 12s)
 *   after the user clicks a thumb. Respects `prefers-reduced-motion`.
 *
 * - The backdrop is a blurred/saturated copy of the active cover (filter:
 *   `blur(40px) saturate(150%) brightness(0.45)`). A pink radial overlay
 *   in the top-right gives the "galaxy" vibe; a dark veil keeps text legible.
 *
 * - Content fades on transition (350ms cross-fade) but the backdrop also
 *   transitions opacity for a soft crossfade between covers.
 *
 * - The right-side dot strip is vertical at `lg+` and horizontal under the
 *   cover at smaller widths. Each "dot" is a tiny cover thumbnail.
 */

export type SpotlightItem = {
  id: string | number;
  title: string;
  author?: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  status?: SeriesStatus;
  genres?: string[];
  // Library-specific
  trackedChapters?: number;
  activeSources?: number;
  lastDownload?: string; // pre-formatted relative string e.g. "3h ago"
  // Browse-specific
  availableChapters?: number;
  sourceName?: string;
  provider?: string;
};

export type SpotlightHeroProps = {
  items: SpotlightItem[];
  eyebrow: string;
  eyebrowIcon?: LucideIcon;
  ctaLabel: string;
  ctaIcon?: LucideIcon;
  onCtaClick: (item: SpotlightItem) => void;
  autoAdvanceMs?: number;
  pauseAfterManualMs?: number;
  variant?: "library" | "browse";
};

const PINK = "hsl(346.8 77.2% 49.8%)";

// Map series status -> CSS color used for the cover top strip.
function statusBarColor(status?: SeriesStatus): string {
  switch (status) {
    case SeriesStatus.ONGOING:
      return "#22c55e";
    case SeriesStatus.COMPLETED:
    case SeriesStatus.PUBLISHING_FINISHED:
      return "#3b82f6";
    case SeriesStatus.LICENSED:
      return "#a855f7";
    case SeriesStatus.CANCELLED:
      return "#ef4444";
    case SeriesStatus.ON_HIATUS:
      return "#eab308";
    case SeriesStatus.DISABLED:
      return "#4b5563";
    default:
      return "#6b7280";
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function SpotlightHero({
  items,
  eyebrow,
  eyebrowIcon: EyebrowIcon = Sparkles,
  ctaLabel,
  ctaIcon: CtaIcon,
  onCtaClick,
  autoAdvanceMs = 8000,
  pauseAfterManualMs = 12000,
  variant = "library",
}: SpotlightHeroProps) {
  const heroId = useId();
  const panelId = `${heroId}-panel`;
  const safeItems = useMemo(() => items.slice(0, 5), [items]);
  const [active, setActive] = useState(0);
  const [fading, setFading] = useState(false);
  const pauseUntilRef = useRef<number>(0);
  const crossfadeTimerRef = useRef<number | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const scheduleRef = useRef<(() => void) | null>(null);
  const reduced = usePrefersReducedMotion();

  // Clamp active when items array shrinks.
  useEffect(() => {
    if (active >= safeItems.length && safeItems.length > 0) {
      setActive(0);
    }
  }, [safeItems.length, active]);

  // Auto-advance loop.
  useEffect(() => {
    if (safeItems.length <= 1 || reduced) return;

    const schedule = () => {
      const now = Date.now();
      const wait = Math.max(autoAdvanceMs, pauseUntilRef.current - now);
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        const remaining = pauseUntilRef.current - Date.now();
        if (remaining > 0) {
          schedule();
          return;
        }
        // crossfade
        setFading(true);
        crossfadeTimerRef.current = window.setTimeout(() => {
          setActive((a) => (a + 1) % safeItems.length);
          setFading(false);
          schedule();
        }, 350);
      }, wait);
    };
    scheduleRef.current = schedule;
    schedule();
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
      if (crossfadeTimerRef.current !== null) {
        window.clearTimeout(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
    };
  }, [safeItems.length, autoAdvanceMs, reduced]);

  // Pause auto-advance when the tab is hidden; restart when it becomes visible.
  useEffect(() => {
    if (safeItems.length <= 1 || reduced) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Clear both timers — do not advance while hidden.
        if (autoAdvanceTimerRef.current !== null) {
          window.clearTimeout(autoAdvanceTimerRef.current);
          autoAdvanceTimerRef.current = null;
        }
        if (crossfadeTimerRef.current !== null) {
          window.clearTimeout(crossfadeTimerRef.current);
          crossfadeTimerRef.current = null;
          setFading(false);
        }
      } else {
        // Tab is visible again — restart the advance schedule.
        if (scheduleRef.current) {
          scheduleRef.current();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [safeItems.length, reduced]);

  const goTo = useCallback(
    (idx: number) => {
      if (idx === active || idx < 0 || idx >= safeItems.length) return;
      pauseUntilRef.current = Date.now() + pauseAfterManualMs;
      if (reduced) {
        setActive(idx);
        return;
      }
      if (crossfadeTimerRef.current !== null) {
        window.clearTimeout(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
      setFading(true);
      crossfadeTimerRef.current = window.setTimeout(() => {
        setActive(idx);
        setFading(false);
        crossfadeTimerRef.current = null;
      }, 200);
    },
    [active, pauseAfterManualMs, safeItems.length, reduced],
  );

  if (safeItems.length === 0) return null;

  const current = safeItems[active]!;
  const status = current.status ?? SeriesStatus.UNKNOWN;
  const statusInfo = getStatusDisplay(status);
  const stripColor = statusBarColor(status);
  const tags = (current.genres ?? []).slice(0, 4);
  const isOngoing = status === SeriesStatus.ONGOING;

  const backdropSrc = current.thumbnailUrl
    ? formatThumbnailUrl(current.thumbnailUrl)
    : "/placeholder.jpg";

  return (
    <section
      role="region"
      aria-label="Spotlight"
      className={cn(
        "relative isolate w-full overflow-hidden rounded-2xl border border-white/[0.06]",
        "h-[420px] max-lg:h-auto",
      )}
      style={{
        background: "hsl(240 8% 7%)",
      }}
    >
      {/* Backdrop (blurred + saturated cover) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 transition-opacity duration-500"
        style={{
          opacity: fading ? 0.55 : 1,
        }}
      >
        <Image
          key={`bd-${current.id}`}
          src={backdropSrc}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{
            filter: "blur(40px) saturate(150%) brightness(0.45)",
            transform: "scale(1.15)",
          }}
        />
      </div>

      {/* Pink radial top-right + dark veil for legibility */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 600px at 85% -10%, hsla(346.8, 77.2%, 49.8%, 0.42), transparent 60%)," +
            " linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.3) 75%, rgba(0,0,0,0.55) 100%)," +
            " linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Content row */}
      <div
        className={cn(
          "relative z-10 flex h-full items-stretch gap-6 px-5 py-6",
          "sm:gap-8 sm:px-8",
          "lg:items-center lg:gap-10 lg:px-10",
          "max-lg:flex-col",
        )}
      >
        {/* Floating cover */}
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-xl",
            "transition-opacity duration-300",
            fading ? "opacity-0" : "opacity-100",
          )}
          style={{
            width: 200,
            height: 280,
            boxShadow:
              "0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px hsla(0, 0%, 100%, 0.06)",
          }}
        >
          {/* Status-colored top strip */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5"
            style={{
              background: stripColor,
              boxShadow: `0 0 12px ${stripColor}`,
            }}
          />
          <Image
            key={`cover-${current.id}`}
            src={backdropSrc}
            alt={current.title}
            fill
            priority={active === 0}
            sizes="200px"
            className="object-cover"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 35%, transparent 60%)",
            }}
          />
          <div className="absolute inset-x-3 bottom-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/80 line-clamp-1">
              {current.title}
            </div>
            {current.author && (
              <div className="text-[10px] text-white/55 line-clamp-1">
                {current.author}
              </div>
            )}
          </div>
        </div>

        {/* Right-side text content */}
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${heroId}-tab-${active}`}
          className={cn(
            "min-w-0 flex-1 transition-opacity duration-300",
            "lg:max-w-2xl",
            fading ? "opacity-0" : "opacity-100",
          )}
        >
          {/* Eyebrow */}
          <div
            className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase"
            style={{
              letterSpacing: "0.28em",
              color: "hsl(346.8 90% 70%)",
            }}
          >
            <EyebrowIcon className="h-3 w-3" />
            <span className="hidden sm:inline">{eyebrow}</span>
            <span className="sm:hidden">
              {eyebrow.split("·")[0]?.trim() ?? eyebrow}
            </span>
          </div>

          {/* Title */}
          <h2 className="mb-4 text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl line-clamp-2">
            {current.title}
          </h2>

          {/* Meta strip */}
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isOngoing && "animate-pulse",
                )}
                style={{
                  background: stripColor,
                  boxShadow: isOngoing
                    ? `0 0 0 0 ${stripColor}`
                    : undefined,
                }}
              />
              {statusInfo.text}
            </span>

            {variant === "library" ? (
              <>
                {typeof current.trackedChapters === "number" && (
                  <span className="text-white/55">
                    <b className="text-white/90">{current.trackedChapters}</b>{" "}
                    chapters tracked
                  </span>
                )}
                {typeof current.activeSources === "number" && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                    <span className="text-white/55">
                      <b className="text-white/90">{current.activeSources}</b>{" "}
                      active sources
                    </span>
                  </>
                )}
                {current.lastDownload && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                    <span className="text-white/55">
                      Downloaded {current.lastDownload}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                {typeof current.availableChapters === "number" && (
                  <span className="text-white/55">
                    <b className="text-white/90">{current.availableChapters}</b>{" "}
                    chapters available
                  </span>
                )}
                {(current.sourceName ?? current.provider) && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                    <span className="text-white/55">
                      Source:{" "}
                      <b className="text-white/90">
                        {current.sourceName ?? current.provider}
                      </b>
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Description */}
          {current.description && (
            <div className="relative mb-5 max-h-[4.5em] overflow-hidden text-[14px] leading-[1.5] text-white/65">
              <p className="line-clamp-3">{current.description}</p>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-6"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, rgba(0,0,0,0.9))",
                }}
              />
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {tags.map((tag, idx) => (
                <span
                  key={tag}
                  className={cn(
                    "rounded-full border px-2 py-[3px] text-[10.5px] tracking-wide",
                    idx === 0
                      ? "border-[hsla(346.8,77.2%,49.8%,0.32)] bg-[hsla(346.8,77.2%,49.8%,0.14)] text-[hsl(346.8,90%,75%)]"
                      : "border-white/10 bg-white/[0.06] text-white/65",
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              onClick={() => onCtaClick(current)}
              className="h-10 gap-2 rounded-lg px-5 text-[13px] font-semibold text-white shadow-[0_8px_24px_hsla(346.8,77.2%,49.8%,0.35),inset_0_1px_0_hsla(0,0%,100%,0.18)] transition-all duration-150 ease-out hover:brightness-110 hover:shadow-[0_10px_32px_hsla(346.8,77.2%,49.8%,0.55),inset_0_1px_0_hsla(0,0%,100%,0.25)] active:scale-[0.97] active:brightness-95 active:shadow-[0_4px_16px_hsla(346.8,77.2%,49.8%,0.3),inset_0_1px_0_hsla(0,0%,100%,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[hsl(346.8_90%_70%)] motion-reduce:transition-none"
              style={{ background: PINK }}
            >
              {CtaIcon && <CtaIcon className="h-4 w-4" />}
              {ctaLabel}
            </Button>
          </div>
        </div>

        {/* Dot strip: vertical right at lg+, horizontal under cover at <lg */}
        {safeItems.length > 1 && (
          <div
            role="tablist"
            aria-label="Spotlight selection"
            className={cn(
              "z-20",
              // lg+: absolute vertical strip on the right
              "lg:absolute lg:right-6 lg:top-1/2 lg:flex lg:-translate-y-1/2 lg:flex-col lg:gap-3",
              // <lg: a horizontal scroll row under the content
              "max-lg:order-last max-lg:flex max-lg:flex-row max-lg:flex-wrap max-lg:gap-2",
            )}
          >
            {safeItems.map((item, idx) => {
              const isActive = idx === active;
              const thumbSrc = item.thumbnailUrl
                ? formatThumbnailUrl(item.thumbnailUrl)
                : "/placeholder.jpg";
              return (
                <button
                  key={item.id}
                  id={`${heroId}-tab-${idx}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={panelId}
                  aria-label={`Spotlight ${idx + 1}: ${item.title}`}
                  onClick={() => goTo(idx)}
                  className={cn(
                    "relative cursor-pointer overflow-hidden rounded-md border transition-all duration-200",
                    "w-[28px] h-[40px] lg:w-[36px] lg:h-[52px]",
                    isActive
                      ? "border-transparent opacity-100"
                      : "border-white/10 opacity-55 hover:opacity-95",
                  )}
                  style={
                    isActive
                      ? {
                          boxShadow:
                            "0 0 0 1px hsl(346.8 77.2% 49.8%), 0 0 16px hsla(346.8, 77.2%, 49.8%, 0.5)",
                          transform: "translateX(-4px)",
                        }
                      : undefined
                  }
                >
                  <Image
                    src={thumbSrc}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(0,0,0,0.6), transparent 60%)",
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default SpotlightHero;
