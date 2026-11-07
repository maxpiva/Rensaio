"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Sparkles, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SeriesStatus } from "@/lib/api/types";
import {
  SeriesStatusTag,
  statusStripeClass,
} from "@/components/comp/series/cloud-latest-status";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";

/**
 * SpotlightHero — the feature panel at the top of Just In. Shows up to 7
 * spotlight series with auto-advancing thumbnails, styled as a Paper "feature
 * page": a cover with an offset print shadow and a status-coloured top strip,
 * a crimson mono eyebrow, a serif display title, an icon + label status tag,
 * a meta strip, a fading description, tag chips and a single primary CTA.
 *
 * Implementation notes:
 *
 * - Auto-advance every {@link SpotlightHeroProps.autoAdvanceMs} (default 8s),
 *   paused for {@link SpotlightHeroProps.pauseAfterManualMs} (default 12s)
 *   after the user clicks a thumb. Respects `prefers-reduced-motion`.
 *
 * - A faint blurred wash of the active cover fades in from the right edge;
 *   the reading side stays plain paper so text keeps full contrast.
 *
 * - Content fades on transition (350ms cross-fade).
 *
 * - The thumbnail strip is vertical on the right at `lg+` and a scrollable
 *   row underneath at smaller widths. Each thumb is a 44px-wide target.
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
  const safeItems = useMemo(() => items.slice(0, 7), [items]);
  const [active, setActive] = useState(0);
  const [fading, setFading] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  // Collapse the description whenever the active spotlight item changes so
  // the next item starts in the clamped state rather than inheriting the
  // previous item's expanded view.
  useEffect(() => {
    setDescExpanded(false);
  }, [active]);
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
  const tags = (current.genres ?? []).slice(0, 4);

  const backdropSrc = current.thumbnailUrl
    ? formatThumbnailUrl(current.thumbnailUrl)
    : "/placeholder.jpg";

  return (
    <section
      role="region"
      aria-label="Spotlight"
      className="paper-grain relative isolate w-full overflow-hidden rounded-xl border border-rule bg-paper-1 shadow-paper"
    >
      {/* Backdrop: a faint wash of the active cover, fading in from the
          right edge so the reading side stays clean paper. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-full transition-opacity duration-500 [mask-image:linear-gradient(to_left,black,transparent_75%)] lg:w-3/4"
        style={{ opacity: fading ? 0.08 : 0.16 }}
      >
        <Image
          key={`bd-${current.id}`}
          src={backdropSrc}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{ filter: "blur(36px) saturate(130%)", transform: "scale(1.2)" }}
        />
      </div>

      <div className="relative z-10 flex flex-col gap-5 p-4 sm:p-6 lg:min-h-[380px] lg:flex-row lg:items-center lg:gap-8 lg:p-8 lg:pr-6">
        {/* Active item */}
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${heroId}-tab-${active}`}
          className={cn(
            "grid min-w-0 flex-1 grid-cols-[96px_minmax(0,1fr)] items-start gap-x-4 gap-y-4 transition-opacity duration-300 motion-reduce:transition-none",
            "sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-6",
            "lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-10",
            fading ? "opacity-0" : "opacity-100",
          )}
        >
          {/* Cover with offset print shadow */}
          <div className="relative lg:row-span-2 lg:self-center">
            <div aria-hidden className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-[3px] bg-rule-2 lg:translate-x-2 lg:translate-y-2" />
            <div className="relative aspect-[5/7] overflow-hidden rounded-[3px] bg-paper-2 ring-1 ring-rule">
              <div
                aria-hidden
                className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px]", statusStripeClass(status))}
              />
              <Image
                key={`cover-${current.id}`}
                src={backdropSrc}
                alt={current.title}
                fill
                priority={active === 0}
                sizes="(max-width: 640px) 96px, (max-width: 1024px) 150px, 200px"
                className="object-cover"
              />
            </div>
          </div>

          {/* Eyebrow + title */}
          <div className="min-w-0 self-center lg:self-end">
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-ink sm:text-[10.5px]">
              <EyebrowIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{eyebrow}</span>
              <span className="sm:hidden">
                {eyebrow.split("·")[0]?.trim() ?? eyebrow}
              </span>
            </div>
            <h2 className="line-clamp-3 font-serif text-[24px] font-normal leading-[1.08] tracking-[-0.015em] text-ink [overflow-wrap:anywhere] sm:text-[34px] lg:line-clamp-2 lg:text-[46px]">
              {current.title}
            </h2>
            {current.author && (
              <p className="mt-1.5 truncate text-[12.5px] text-ink-3 sm:text-[13px]">
                {current.author}
              </p>
            )}
          </div>

          {/* Details */}
          <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2">
            {/* Meta strip */}
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-3 max-sm:gap-x-4">
              <SeriesStatusTag status={status} />

              {variant === "library" ? (
                <>
                  {typeof current.trackedChapters === "number" && (
                    <span>
                      <b className="font-semibold text-ink">{current.trackedChapters}</b>{" "}
                      chapters tracked
                    </span>
                  )}
                  {typeof current.activeSources === "number" && (
                    <>
                      <span aria-hidden className="h-1 w-1 rounded-full bg-rule-3 max-sm:hidden" />
                      <span>
                        <b className="font-semibold text-ink">{current.activeSources}</b>{" "}
                        active sources
                      </span>
                    </>
                  )}
                  {current.lastDownload && (
                    <>
                      <span aria-hidden className="h-1 w-1 rounded-full bg-rule-3 max-sm:hidden" />
                      <span>Downloaded {current.lastDownload}</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  {typeof current.availableChapters === "number" && (
                    <span>
                      <b className="font-semibold text-ink">{current.availableChapters}</b>{" "}
                      chapters available
                    </span>
                  )}
                  {(current.sourceName ?? current.provider) && (
                    <>
                      <span aria-hidden className="h-1 w-1 rounded-full bg-rule-3 max-sm:hidden" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        Source:{" "}
                        <b className="font-semibold text-ink">
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
              <div className="mb-4 max-w-2xl text-[14px] leading-[1.6] text-ink-2">
                <div
                  id={`${panelId}-desc`}
                  className={cn(
                    "relative overflow-hidden",
                    !descExpanded && "max-h-[4.8em] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
                  )}
                >
                  <p className={cn(!descExpanded && "line-clamp-3")}>
                    {current.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  aria-expanded={descExpanded}
                  aria-controls={`${panelId}-desc`}
                  className="mt-1 inline-flex min-h-8 items-center font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink underline-offset-4 transition-colors duration-150 hover:underline focus-visible:underline focus-visible:outline-none max-sm:min-h-11"
                >
                  {descExpanded ? "Read less" : "Read more"}
                </button>
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-1.5">
                {tags.map((tag, idx) => (
                  <span
                    key={tag}
                    className={cn(
                      "rounded-full border px-2.5 py-[3px] text-[11px]",
                      idx === 0
                        ? "border-accent-line bg-accent-soft text-accent-ink"
                        : "border-rule-2 text-ink-2",
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
                className="h-10 gap-2 px-5 max-sm:h-11 max-sm:w-full"
              >
                {CtaIcon && <CtaIcon className="h-4 w-4" />}
                {ctaLabel}
              </Button>
            </div>
          </div>
        </div>

        {/* Thumb strip: vertical on the right at lg+, a row below otherwise */}
        {safeItems.length > 1 && (
          <div
            role="tablist"
            aria-label="Spotlight selection"
            className={cn(
              "flex shrink-0 gap-1",
              "lg:flex-col lg:gap-1.5 lg:border-l lg:border-rule lg:pl-5",
              "max-lg:mx-auto max-lg:max-w-full max-lg:overflow-x-auto max-lg:border-t max-lg:border-rule max-lg:pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
                    "group/thumb flex shrink-0 cursor-pointer items-center justify-center rounded-[5px] p-1 outline-none transition-colors",
                    "h-[60px] w-11 lg:h-[56px] lg:w-[46px]",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <span
                    className={cn(
                      "relative block h-full w-full overflow-hidden rounded-[3px] transition-[opacity,box-shadow] duration-200",
                      isActive
                        ? "opacity-100 ring-2 ring-primary"
                        : "opacity-60 ring-1 ring-rule group-hover/thumb:opacity-100",
                    )}
                  >
                    <Image
                      src={thumbSrc}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </span>
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
