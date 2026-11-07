"use client";

import { useLibrary } from "@/lib/api/hooks/useSeries";
import { useSearch } from "@/contexts/search-context";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type SeriesInfo, SeriesStatus } from "@/lib/api/types";
import "./list-series.css";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LastChapterBadge } from "@/components/ui/last-chapter-badge";
import { DynamicTags } from "@/components/comp/series/add-series/steps/confirm-series-step";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { AlertTriangle, BookOpen, Database, ExternalLink, Pause, SearchX } from "lucide-react";
import { getStatusDisplay } from "@/lib/utils/series-status";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { getStatusTone } from "@/components/comp/series/detail/status-tone";

// Caption / badge scale per card-size option (keyed by the option's `text`).
const CARD_SCALE: Record<
  string,
  { title: string; meta: string; badge: string; marker: string; markerIcon: string; compact: boolean; showMeta: boolean }
> = {
  "text-[0.4rem]": { title: "text-[11px]", meta: "text-[9px]", badge: "top-1 right-1 px-1 py-0 text-[8px]", marker: "p-0.5 text-[8px]", markerIcon: "h-2.5 w-2.5", compact: true, showMeta: false },
  "text-xs": { title: "text-[13px]", meta: "text-[9.5px]", badge: "top-1.5 right-1.5 px-1.5 py-0.5 text-[10px]", marker: "px-1 py-0.5 text-[9px]", markerIcon: "h-3 w-3", compact: true, showMeta: true },
  "text-sm": { title: "text-[15px]", meta: "text-[10px]", badge: "top-2 right-2 px-1.5 py-0.5 text-[11px]", marker: "px-1.5 py-0.5 text-[10px]", markerIcon: "h-3 w-3", compact: false, showMeta: true },
  "text-base": { title: "text-[17px]", meta: "text-[10.5px]", badge: "top-2 right-2 px-2 py-0.5 text-xs", marker: "px-1.5 py-0.5 text-[10.5px]", markerIcon: "h-3.5 w-3.5", compact: false, showMeta: true },
  "text-lg": { title: "text-[19px]", meta: "text-[11px]", badge: "top-2.5 right-2.5 px-2 py-0.5 text-[13px]", marker: "px-2 py-1 text-[11px]", markerIcon: "h-3.5 w-3.5", compact: false, showMeta: true },
};

// Eagerly load only the first row of covers to protect LCP. The grid is
// responsive (columns recomputed on resize), so we use a safe upper bound
// of 12 that comfortably covers the widest realistic first row. Everything
// beyond this lazy-loads via the browser's viewport intersection logic in
// next/image.
export const FIRST_ROW_PRIORITY_COUNT = 12;

// Color array for the last change ring (31 colors from green to blue)
const LAST_CHANGE_COLORS = [
  "00FF00", "22FF00", "44FF00", "66FF00", "88FF00", "AAFF00", "CCFF00", "FFFF00",
  "FFCC00", "FFAA00", "FF8800", "FF6600", "FF4400", "FF2200", "FF0000", "FF0022",
  "FF0044", "FF0066", "FF0088", "FF00AA", "FF00CC", "FF00FF", "CC00FF", "AA00FF",
  "8800FF", "6600FF", "4400FF", "2200FF", "0000FF", "2200FF", "4400FF"
];

// Function to get the ring color based on days since last change
function getLastChangeRingColor(lastChangeUTC?: string | null): string | undefined {
  if (!lastChangeUTC) return undefined;

  const now = new Date();
  const lastChange = new Date(lastChangeUTC);
  const diffTime = now.getTime() - lastChange.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Return color index based on days (0-30), or undefined if over 31 days
  if (diffDays < 0 || diffDays > 31) return undefined;
  const colorIndex = Math.min(diffDays, 30);
  return LAST_CHANGE_COLORS[colorIndex] ?? undefined;
}
export interface ListSeriesProps {
  filterFn?: (series: SeriesInfo) => boolean;
  sortFn?: (a: SeriesInfo, b: SeriesInfo) => number;
  cardWidth?: string;
  cardWidthOptions?: { value: string; label: string; text: string }[];
  orderBy?: string;
  library?: SeriesInfo[];
}

export function ListSeries({ filterFn, sortFn, cardWidth = "w-40", cardWidthOptions, orderBy, library: propLibrary }: ListSeriesProps) {
  // Always call hooks at the top level to avoid hook count mismatches
  const { data: hookLibrary, isLoading } = useLibrary();
  const { debouncedSearchTerm } = useSearch();
  const router = useRouter();
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const itemWidth = 272; // px (17rem + 1rem gap, adjust as needed)

  // Use prop library if provided, otherwise use hook library
  const library = propLibrary ?? hookLibrary;

  // Filter and sort series based on debounced search term, filterFn, and sortFn
  const filteredLibrary = useMemo(() => {
    if (!library) return library;
    let result = library;
    if (debouncedSearchTerm.trim()) {
      result = result.filter((series: SeriesInfo) =>
        series.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      );
    }
    if (filterFn) {
      result = result.filter(filterFn);
    }
    if (sortFn) {
      result = [...result].sort(sortFn);
    }
    return result;
  }, [library, debouncedSearchTerm, filterFn, sortFn]);

  // Calculate columns on resize
  useEffect(() => {
    function updateColumns() {
      if (!gridRef.current) return;
      const containerWidth = gridRef.current.offsetWidth;
      // Dynamically measure the first card's width
      const firstItem = gridRef.current.querySelector("div.relative");
      let actualItemWidth = itemWidth;
      if (firstItem) {
        actualItemWidth = firstItem.getBoundingClientRect().width;
      }
      // Dynamically get the computed gap from CSS
      const computedStyle = window.getComputedStyle(gridRef.current);
      // Try 'gap' first, fallback to 'columnGap' for cross-browser
      let actualGap = 16;
      if (computedStyle.gap) {
        actualGap = parseFloat(computedStyle.gap);
      } else if (computedStyle.columnGap) {
        actualGap = parseFloat(computedStyle.columnGap);
      }
      const cols = Math.max(1, Math.floor((containerWidth + actualGap) / (actualItemWidth + actualGap)));

      setColumns(cols);
    }
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [filteredLibrary?.length, cardWidth]);
  // Determine text size for the card title based on cardWidth
  const textSize = cardWidthOptions?.find(opt => opt.value === cardWidth)?.text ?? "text-sm";
  const scale = CARD_SCALE[textSize] ?? CARD_SCALE["text-sm"]!;

  const handleSeriesClick = (seriesId: string) => {
    router.push(`/library/series?id=${seriesId}`);
  };

  // Calculate dummy items and remainder for layout
  const items = filteredLibrary ?? [];
  const remainder = columns > 1 ? items.length % columns : 0;
  const dummyCount = remainder === 0 ? 0 : columns - remainder;

  // Empty / no-results state — rendered outside the grid so it isn't capped by
  // `.grid-auto-fit > *` (max-width: 17rem) and can center on the page.
  if (!isLoading && (filteredLibrary === undefined || filteredLibrary.length === 0)) {
    const searching = !!debouncedSearchTerm.trim();
    return (
      <div className="flex min-h-[52vh] w-full flex-col items-center justify-center px-4 py-14 text-center motion-safe:animate-paper-rise">
        <div className="relative mb-6">
          <div className="h-[118px] w-[84px] -rotate-6 rounded-[3px] border border-rule-2 bg-paper-2 shadow-paper" />
          <div className="absolute left-5 top-1 grid h-[118px] w-[84px] rotate-3 place-items-center rounded-[3px] border border-rule-2 bg-paper-1 shadow-lift">
            {searching ? (
              <SearchX className="h-7 w-7 text-ink-3" strokeWidth={1.5} />
            ) : (
              <BookOpen className="h-7 w-7 text-ink-3" strokeWidth={1.5} />
            )}
          </div>
          <span
            aria-hidden="true"
            className="absolute -right-6 -top-2 grid h-7 w-7 rotate-6 place-items-center rounded-[3px] bg-primary font-jp text-[13px] font-bold text-primary-foreground shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.3)]"
          >
            {searching ? "無" : "空"}
          </span>
        </div>
        <p className="paper-eyebrow mb-2">{searching ? "Search" : "Empty shelf"}</p>
        <p className="max-w-md font-serif text-[26px] leading-tight tracking-[-0.02em] text-ink text-balance sm:text-[30px]">
          {searching ? `No results for \u201c${debouncedSearchTerm}\u201d` : "No series found"}
        </p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
          {searching ? "Try a different search term." : "Add some manga to get started."}
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={2000}>
      <div
        className="grid-auto-fit flex w-full flex-wrap gap-x-4 gap-y-6 sm:gap-y-7"
        ref={gridRef}
        aria-busy={isLoading || undefined}
      >
        {isLoading ? (
          <>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={`relative ${cardWidth}`} aria-hidden="true">
                <div className="skeleton-shimmer aspect-[2/3] w-full rounded-[3px]" />
                <div className="skeleton-shimmer mt-2.5 h-3 w-4/5 rounded-[2px]" />
                <div className="skeleton-shimmer mt-1.5 h-2.5 w-1/2 rounded-[2px]" />
              </div>
            ))}
            <span className="sr-only">Loading library…</span>
          </>
        ) : (
          <>
            {items.map((series: SeriesInfo, index: number) => {
              const ringColor = getLastChangeRingColor(series.lastChangeUTC);
              const showRing = orderBy === "lastChange" && ringColor;
              const isPriority = index < FIRST_ROW_PRIORITY_COUNT;
              const tone = getStatusTone(series.status);
              const badgeTone = getStatusTone(series.isActive ? series.status : SeriesStatus.DISABLED);
              const providerName = series.lastChangeProvider?.provider;
              return (
                <div key={series.id} className={`relative ${cardWidth} group`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        role="link"
                        tabIndex={0}
                        aria-label={series.title}
                        onClick={() => handleSeriesClick(series.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSeriesClick(series.id);
                          }
                        }}
                        className="block cursor-pointer rounded-[4px] outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                      >
                        {/* Cover */}
                        <div
                          className={`relative aspect-[2/3] w-full overflow-hidden rounded-[3px] bg-paper-2 shadow-paper ring-1 ring-ink/10 transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-lift motion-reduce:transition-none motion-reduce:group-hover:translate-y-0`}
                          style={
                            showRing
                              ? {
                                  boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 3.5px #${ringColor}`,
                                }
                              : undefined
                          }
                        >
                          <Image
                            {...(isPriority ? { priority: true } : { loading: "lazy" as const })}
                            sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 280px"
                            src={formatThumbnailUrl(series.thumbnailUrl) ?? '/placeholder.jpg'}
                            alt=""
                            fill
                            className="object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              if (target.src !== window.location.origin + '/rensaio.png') {
                                target.src = '/rensaio.png';
                              }
                            }}
                          />
                          {/* Print sheen + spine shadow */}
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.18),transparent_7%,transparent_92%,rgba(255,255,255,.06))]"
                          />

                          {/* Status bar — strip across the top edge, color-coded by
                              series.status. Hidden while sorting by Last Change,
                              where it would clash with the age-graded ring. */}
                          {!showRing && (
                            <div
                              className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] ${tone.fill}`}
                              aria-hidden
                            />
                          )}

                          {/* Last chapter — top right, tinted by status */}
                          {series.lastChapter !== undefined && (
                            <LastChapterBadge
                              lastChapter={series.lastChapter}
                              status={series.isActive ? series.status : SeriesStatus.DISABLED}
                              className={`z-10 rounded-[3px] font-mono font-semibold tabular-nums text-paper shadow-[0_1px_3px_rgba(0,0,0,.35)] ${badgeTone.fill} ${scale.badge}`}
                            />
                          )}

                          {/* Attention + paused markers — bottom of cover */}
                          {(series.hasUnknown || series.pausedDownloads) && (
                            <div className={`absolute bottom-1.5 left-1.5 right-1.5 z-10 flex items-center gap-1`}>
                              {series.hasUnknown && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-[3px] bg-warn font-semibold text-paper shadow-[0_1px_3px_rgba(0,0,0,.35)] ${scale.marker}`}
                                  title="Has unassigned providers"
                                >
                                  <AlertTriangle className={scale.markerIcon} />
                                  {!scale.compact && <span>Unassigned</span>}
                                </span>
                              )}
                              {series.pausedDownloads && (
                                <span
                                  className={`ml-auto inline-flex items-center gap-1 rounded-[3px] bg-ink/85 font-semibold text-paper shadow-[0_1px_3px_rgba(0,0,0,.35)] ${scale.marker}`}
                                  title="Downloads paused"
                                >
                                  <Pause className={`fill-current ${scale.markerIcon}`} />
                                  {!scale.compact && <span>Paused</span>}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Caption */}
                        <div className="mt-2 min-w-0 px-0.5">
                          <p
                            className={`line-clamp-2 font-serif leading-[1.15] tracking-[-0.01em] text-ink transition-colors group-hover:text-accent-ink ${scale.title}`}
                          >
                            {series.title}
                          </p>
                          {providerName && scale.showMeta && (
                            <p className={`mt-1 flex items-center gap-1.5 truncate font-mono uppercase tracking-[0.06em] text-ink-3 ${scale.meta}`}>
                              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.fill}`} />
                              <span className="truncate">{providerName}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="min-w-[22rem] max-w-xl rounded-md border border-rule-2 bg-paper-1 p-0 text-ink shadow-lift"
                    >
                      <div className="space-y-2.5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {series.lastChapter ? (
                              <p className="paper-eyebrow mb-1">Ch. {series.lastChapter}</p>
                            ) : null}
                            <h3 className="font-serif text-xl leading-tight tracking-[-0.015em] text-ink">{series.title}</h3>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${tone.chip}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${tone.fill}`} />
                            {getStatusDisplay(series.status).text}
                          </span>
                        </div>
                        {(series.author || series.artist) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-serif text-[13.5px] italic text-ink-2">
                            {series.author && <span>by {series.author}</span>}
                            {series.artist && series.artist !== series.author && <span>art by {series.artist}</span>}
                          </div>
                        )}
                        {series.genre && series.genre.length > 0 && (
                          <DynamicTags genres={series.genre} />
                        )}
                        <p className="line-clamp-4 whitespace-pre-line text-[13px] font-normal leading-relaxed text-ink-2">
                          {series.description || "No description available"}
                        </p>
                        {series.providers && series.providers.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 border-t border-rule pt-2.5">
                            {series.providers.map((provider, index) => {
                              const key = `${provider.provider}-${provider.language}-${provider.scanlator || 'no-scanlator'}-${index}`;
                              const body = (
                                <>
                                  {provider.url && <ExternalLink className="h-3 w-3 text-ink-3" />}
                                  {provider.provider}{provider.scanlator && provider.scanlator !== provider.provider && ` \u2022 ${provider.scanlator}`}
                                  <ReactCountryFlag
                                    countryCode={getCountryCodeForLanguage(provider.language)}
                                    svg
                                    style={{ width: '16px', height: '12px', borderRadius: '2px', border: '1px solid var(--rule-2)' }}
                                    title={provider.language.toUpperCase()}
                                  />
                                  {(provider.isStorage) && (
                                    <Database className="h-3.5 w-3.5 text-ok" aria-label="Storage source" />
                                  )}
                                </>
                              );
                              return provider.url ? (
                                <span
                                  key={key}
                                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-rule-2 bg-paper px-2 py-0.5 text-[12.5px] font-medium text-ink transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent-ink"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (provider.url) {
                                      window.open(provider.url, '_blank', 'noopener,noreferrer');
                                    }
                                  }}
                                  title="Click to open in the source"
                                >
                                  {body}
                                </span>
                              ) : (
                                <span
                                  key={key}
                                  className="inline-flex items-center gap-1.5 rounded-[4px] border border-rule-2 bg-paper px-2 py-0.5 text-[12.5px] font-medium text-ink"
                                >
                                  {body}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
            {Array.from({ length: dummyCount }).map((_, i) => (
              <div key={`dummy-${i}`} className={cardWidth} style={{ visibility: "hidden", height: 0, margin: 0, padding: 0 }} />
            ))}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
