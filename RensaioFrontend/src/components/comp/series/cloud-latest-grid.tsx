"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from '@/components/ui/tooltip';
import { Plus, Loader2, ExternalLink, SearchX, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import { type LatestSeriesInfo, InLibraryStatus } from '@/lib/api/types';
import { AddSeries } from '@/components/comp/series/add-series';
import ReactCountryFlag from "react-country-flag";
import { usePermission } from '@/hooks/use-permission';
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { DynamicTags } from "@/components/comp/series/add-series/steps/confirm-series-step";
import { useRouter } from 'next/navigation';
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { cn } from "@/lib/utils";
import { CloudLatestDetailsModal } from '@/components/comp/series/cloud-latest-details-modal';
import {
  InLibraryTag,
  SeriesStatusInline,
  SeriesStatusTag,
  formatFetchAge,
} from '@/components/comp/series/cloud-latest-status';

// Eagerly load only the first row of covers to protect LCP. The grid is
// responsive (columns recomputed on resize), so we use a safe upper bound
// of 12 that comfortably covers the widest realistic first row. Everything
// beyond this lazy-loads via next/image viewport intersection logic. Kept
// in sync with FIRST_ROW_PRIORITY_COUNT in list-series for consistency.
const FIRST_ROW_PRIORITY_COUNT = 12;

// Per-size type scale for the caption under each cover. The card-size
// options keep their own `text` class as a fallback for unknown widths.
const CARD_TYPE: Record<string, { title: string; meta: string; showMeta: boolean; showStatus: boolean; compactTags: boolean }> = {
  "w-20": { title: "text-[10px] leading-tight", meta: "", showMeta: false, showStatus: false, compactTags: true },
  "w-32": { title: "text-[13px] leading-[1.15]", meta: "text-[10px]", showMeta: true, showStatus: false, compactTags: true },
  "w-45": { title: "text-[14.5px] leading-[1.15]", meta: "text-[10.5px]", showMeta: true, showStatus: true, compactTags: false },
  "w-58": { title: "text-[16px] leading-[1.15]", meta: "text-[11px]", showMeta: true, showStatus: true, compactTags: false },
  "w-70": { title: "text-[17px] leading-[1.15]", meta: "text-[11.5px]", showMeta: true, showStatus: true, compactTags: false },
};

interface CloudLatestGridProps {
  items: LatestSeriesInfo[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  error?: Error | null;
  cardWidth: string;
  cardWidthOptions: { value: string; label: string; text: string }[];
}

interface CloudLatestCardProps {
  item: LatestSeriesInfo;
  cardWidth: string;
  textSize: string;
  priority?: boolean;
}

function SourceChip({ item, onOpen }: { item: LatestSeriesInfo; onOpen?: () => void }) {
  const flag = (
    <ReactCountryFlag
      countryCode={getCountryCodeForLanguage(item.language)}
      svg
      className="shrink-0"
      style={{ width: '16px', height: '12px', borderRadius: '2px' }}
      title={item.language.toUpperCase()}
    />
  );
  const base = "inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-rule bg-paper-2 px-2 py-0.5 font-mono text-[11px] text-ink-2";
  if (!onOpen) {
    return (
      <span className={base}>
        {flag}
        <span className="truncate">{item.provider}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cn(base, "cursor-pointer transition-colors hover:border-accent-line hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title="Click to open in the source"
    >
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{item.provider}</span>
      {flag}
    </button>
  );
}

const CloudLatestCard: React.FC<CloudLatestCardProps> = ({ item, cardWidth, textSize, priority = false }) => {
  const [showAddSeries, setShowAddSeries] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const router = useRouter();
  const canAddSeries = usePermission('canAddSeries');

  // Handle card click - open details modal for items not in library, navigate for library items
  const handleCardClick = () => {
    if (item.seriesId) {
      // Navigate to individual series page using query parameter
      router.push(`/library/series?id=${item.seriesId}`);
    } else {
      // Open details modal for items not in library
      setShowDetailsModal(true);
    }
  };

  const type = CARD_TYPE[cardWidth] ?? { title: textSize, meta: "text-[11px]", showMeta: true, showStatus: true, compactTags: false };
  const age = formatFetchAge(item.fetchDate);
  const hasChapter = item.latestChapter !== undefined && item.latestChapter !== null && `${item.latestChapter}` !== "";
  const accessibleName = [
    item.title,
    hasChapter ? `chapter ${item.latestChapter}` : null,
    `on ${item.provider}`,
    age ? age.long : null,
    item.inLibrary === InLibraryStatus.InLibrary ? "in your library" : null,
    item.inLibrary === InLibraryStatus.InLibraryButDisabled ? "in your library, disabled" : null,
  ].filter(Boolean).join(", ");

  return (
    <>
      <div data-latest-card className={`group relative ${cardWidth}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCardClick}
              aria-label={accessibleName}
              className="block w-full cursor-pointer rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span
                className="relative block w-full overflow-hidden rounded-md bg-paper-2 shadow-paper ring-1 ring-rule transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-lift motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
                style={{ aspectRatio: '2/3' }}
              >
                <Image
                  {...(priority ? { priority: true } : { loading: "lazy" as const })}
                  sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 280px"
                  src={formatThumbnailUrl(item.thumbnailUrl)}
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

                {/* Fetch age — top left */}
                {age && cardWidth !== "w-20" && (
                  <span
                    aria-hidden
                    className="absolute left-1.5 top-1.5 z-10 rounded-[3px] bg-ink/80 px-1.5 py-[3px] font-mono text-[10px] font-semibold leading-none text-paper backdrop-blur-sm"
                  >
                    {age.short}
                  </span>
                )}

                {/* Library membership — top right (icon + label) */}
                {item.inLibrary !== InLibraryStatus.NotInLibrary && (
                  <span aria-hidden className="absolute right-1.5 top-1.5 z-10">
                    <InLibraryTag inLibrary={item.inLibrary} compact={type.compactTags} />
                  </span>
                )}
              </span>

              <span className="mt-2 block min-w-0 px-0.5">
                <span className={cn("line-clamp-2 font-serif tracking-[-0.01em] text-ink [overflow-wrap:anywhere]", type.title)}>
                  {item.title}
                </span>
                {type.showMeta && (
                  <span className={cn("mt-1 flex min-w-0 items-baseline gap-1.5 font-mono text-ink-3", type.meta)}>
                    {hasChapter && (
                      <span className="shrink-0 font-semibold text-ink-2">Ch. {item.latestChapter}</span>
                    )}
                    <span className="min-w-0 truncate uppercase tracking-[0.06em]">{item.provider}</span>
                  </span>
                )}
                {type.showStatus && (
                  <SeriesStatusInline status={item.status} className={cn("mt-1 flex", type.meta)} />
                )}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="relative w-[min(26rem,calc(100vw-2rem))] max-w-none rounded-lg border border-rule bg-paper-1 p-0 text-ink shadow-lift"
          >
            <div className="space-y-2.5 p-4 pb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {hasChapter && (
                    <div className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-ink">
                      Ch. {item.latestChapter}
                      {age && <span className="text-ink-3"> · {age.long}</span>}
                    </div>
                  )}
                  <h3 className="font-serif text-[19px] font-medium leading-tight text-ink">{item.title}</h3>
                </div>
                <SeriesStatusTag status={item.status} />
              </div>
              {(Boolean(item.author) || Boolean(item.artist)) && (
                <div className="flex flex-wrap gap-x-2 text-[12.5px] text-ink-3">
                  {item.author && <span>by {item.author}</span>}
                  {item.artist && item.artist !== item.author && <span>art by {item.artist}</span>}
                </div>
              )}
              {item.genre && item.genre.length > 0 && (
                <DynamicTags genres={item.genre} />
              )}
              <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
                {item.description?.length ? item.description : "No description available"}
              </p>
              <div className="flex flex-wrap gap-1 pr-10 pt-0.5">
                <SourceChip
                  item={item}
                  onOpen={item.url ? () => window.open(item.url, '_blank', 'noopener,noreferrer') : undefined}
                />
              </div>
            </div>

            {/* Add Series Button — only if not in library */}
            {item.inLibrary === InLibraryStatus.NotInLibrary && canAddSeries && (
              <Button
                size="sm"
                className="absolute bottom-3 right-3 h-8 w-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddSeries(true);
                }}
                title="Add to library"
                aria-label="Add to library"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Add Series Modal */}
      {showAddSeries && (
        <AddSeries
          open={showAddSeries}
          onOpenChange={setShowAddSeries}
          title={item.title}
        />
      )}

      {/* Details Modal - for mobile/touch users */}
      <CloudLatestDetailsModal
        open={showDetailsModal}
        onOpenChange={setShowDetailsModal}
        item={item}
        onAddSeries={canAddSeries ? () => setShowAddSeries(true) : undefined}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Day grouping. Groups are runs of consecutive items that share a local
// calendar day, so the server's order is never changed.
// ---------------------------------------------------------------------------

type DayGroup = { key: string; date: Date | null; items: { item: LatestSeriesInfo; index: number }[] };

function groupByDay(items: LatestSeriesInfo[]): DayGroup[] {
  const groups: DayGroup[] = [];
  items.forEach((item, index) => {
    const d = item.fetchDate ? new Date(item.fetchDate) : null;
    const valid = d && !Number.isNaN(d.getTime()) ? d : null;
    const key = valid ? valid.toDateString() : "undated";
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push({ item, index });
    } else {
      groups.push({ key, date: valid, items: [{ item, index }] });
    }
  });
  return groups;
}

function dayLabel(date: Date | null): { lead: string | null; long: string; short: string } {
  if (!date) return { lead: null, long: "Undated", short: "Undated" };
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(date)) / 86400000);
  const lead = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : null;
  const long = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const short = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return { lead, long, short };
}

function DayDivider({ group }: { group: DayGroup }) {
  const { lead, long, short } = dayLabel(group.date);
  const total = group.items.length;
  const inLibrary = group.items.filter(({ item }) => item.inLibrary !== InLibraryStatus.NotInLibrary).length;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
      <h3 className="shrink-0 font-semibold text-ink-2">
        {lead && <span className="text-accent-ink">{lead}</span>}
        {lead && <span aria-hidden> · </span>}
        {lead && <span className="sr-only">, </span>}
        <span className="hidden sm:inline">{long}</span>
        <span className="sm:hidden">{short}</span>
      </h3>
      <span aria-hidden className="h-px min-w-4 flex-1 bg-rule" />
      <span className="shrink-0 tabular-nums max-sm:order-last max-sm:basis-full max-sm:tracking-[0.1em]">
        {total} {total === 1 ? "update" : "updates"}
        {inLibrary > 0 && (
          <>
            <span aria-hidden> · </span>
            <span className="sr-only">, </span>
            {inLibrary}
            <span> in your library</span>
          </>
        )}
      </span>
    </div>
  );
}

function GridNotice({
  tone,
  title,
  body,
}: {
  tone: "empty" | "error";
  title: string;
  body: React.ReactNode;
}) {
  const Icon = tone === "error" ? TriangleAlert : SearchX;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center"
    >
      <span
        className={cn(
          "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border",
          tone === "error" ? "border-bad/30 bg-bad-soft text-bad" : "border-rule bg-paper-1 text-ink-3",
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="font-serif text-[22px] leading-tight text-ink">{title}</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3 [overflow-wrap:anywhere]">{body}</p>
    </div>
  );
}

export const CloudLatestGrid: React.FC<CloudLatestGridProps> = ({
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  error,
  cardWidth,
  cardWidthOptions
}) => {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  // Determine text size for the card title based on cardWidth
  const textSize = cardWidthOptions.find(opt => opt.value === cardWidth)?.text ?? "text-sm";

  const groups = useMemo(() => groupByDay(items), [items]);

  // Calculate columns on resize (same logic as main page). Measured on the
  // first day group; every group shares the same width and card size.
  useEffect(() => {
    function updateColumns() {
      const grid = gridRef.current?.querySelector<HTMLElement>("[data-latest-grid]");
      if (!grid) return;
      const containerWidth = grid.offsetWidth;
      // Dynamically measure the first card's width
      const firstItem = grid.querySelector("[data-latest-card]");
      let actualItemWidth = 272; // Default width
      if (firstItem) {
        actualItemWidth = firstItem.getBoundingClientRect().width;
      }
      // Dynamically get the computed gap from CSS
      const computedStyle = window.getComputedStyle(grid);
      let actualGap = 16;
      if (computedStyle.columnGap && computedStyle.columnGap !== "normal") {
        actualGap = parseFloat(computedStyle.columnGap);
      } else if (computedStyle.gap) {
        actualGap = parseFloat(computedStyle.gap);
      }
      const cols = Math.max(1, Math.floor((containerWidth + actualGap) / (actualItemWidth + actualGap)));
      setColumns(cols);
    }
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [items.length, cardWidth]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '200px' // Trigger 200px before the element becomes visible
      }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, onLoadMore, items.length]);

  if (error) {
    return (
      <GridNotice
        tone="error"
        title="Error loading latest series"
        body={error.message}
      />
    );
  }

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading latest series">
        <Skeleton className="mb-4 h-3 w-56" />
        <div className="flex flex-wrap gap-x-4 gap-y-6" style={{ justifyContent: "space-evenly" }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className={`relative ${cardWidth}`}>
              <Skeleton className="w-full rounded-md" style={{ aspectRatio: "2/3" }} />
              <Skeleton className="mt-2 h-3 w-4/5" />
              <Skeleton className="mt-1.5 h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <GridNotice
        tone="empty"
        title="No series found"
        body="Try adjusting your search or source filter"
      />
    );
  }

  return (
    <TooltipProvider delayDuration={2000}>
      <div className="w-full" ref={gridRef}>
        {groups.map((group, gi) => {
          // Dummy items keep the last row of each group left-aligned.
          const remainder = columns > 1 ? group.items.length % columns : 0;
          const dummyCount = remainder === 0 ? 0 : columns - remainder;
          return (
            <section key={`${group.key}-${gi}`} className={gi > 0 ? "mt-10" : undefined}>
              <DayDivider group={group} />
              <div
                data-latest-grid
                className="flex flex-wrap gap-x-4 gap-y-6"
                style={{ justifyContent: 'space-evenly' }}
              >
                {group.items.map(({ item, index }) => (
                  <CloudLatestCard
                    key={`${item.mihonId}-${index}`}
                    item={item}
                    cardWidth={cardWidth}
                    textSize={textSize}
                    // Eagerly load only the first row of covers to protect LCP.
                    priority={index < FIRST_ROW_PRIORITY_COUNT}
                  />
                ))}

                {/* Dummy items for grid alignment */}
                {Array.from({ length: dummyCount }).map((_, i) => (
                  <div
                    key={`dummy-${i}`}
                    className={cardWidth}
                    style={{
                      visibility: "hidden",
                      height: 0,
                      margin: 0,
                      padding: 0,
                      maxWidth: '17rem',
                      minWidth: 0
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* Load More Trigger - Outside the flex container */}
        {hasMore && (
          <div ref={loadMoreRef} className="mt-8 flex min-h-[80px] items-center justify-center py-4">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                <span>Loading more...</span>
              </div>
            ) : (
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Scroll to load more</div>
            )}
          </div>
        )}

        {/* End of Results */}
        {!hasMore && items.length > 0 && (
          <div className="mt-10 flex items-center gap-3 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            <span aria-hidden className="h-px flex-1 bg-rule" />
            <p>No more results</p>
            <span aria-hidden className="h-px flex-1 bg-rule" />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
