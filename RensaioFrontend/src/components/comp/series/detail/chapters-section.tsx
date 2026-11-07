"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Search } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  useRedownloadChapter,
  useSeriesChapters,
} from "@/lib/api/hooks/useSeries";
import { cn } from "@/lib/utils";
import { ChapterRow } from "./chapter-row";

export interface ChaptersSectionProps {
  seriesId: string;
  /** Series-level pause flag — threaded from the detail page so it reflects live UI state. */
  paused: boolean;
  /** User may queue downloads. */
  canManage: boolean;
}

export function ChaptersSection({ seriesId, paused, canManage }: ChaptersSectionProps) {
  const [open, setOpen] = useState(false);
  // Keep the query enabled once the section has been opened so collapsing doesn't refetch.
  const [hasOpened, setHasOpened] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Set<number>>(new Set());

  const { toast } = useToast();
  const redownload = useRedownloadChapter();
  const { data: chapters, isLoading, isError } = useSeriesChapters(seriesId, hasOpened);

  const total = chapters?.length ?? 0;
  const downloadedCount = chapters?.filter((c) => c.downloaded).length ?? 0;
  const missingCount = total - downloadedCount;

  const filtered = useMemo(() => {
    let list = chapters ?? [];
    if (missingOnly) list = list.filter((c) => !c.downloaded);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          (c.number?.toString().includes(q) ?? false) ||
          c.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [chapters, missingOnly, query]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setHasOpened(true);
  };

  const handleRedownload = (chapterNumber: number, providerId?: string) => {
    setPending((prev) => new Set(prev).add(chapterNumber));
    redownload.mutate(
      { seriesId, chapterNumber, providerId },
      {
        onSuccess: (res) => {
          toast({
            variant: "success",
            title: "Re-download queued",
            description: res.sourceProviderName
              ? `Queued chapter ${chapterNumber} from ${res.sourceProviderName}.`
              : `Queued chapter ${chapterNumber} for download.`,
          });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Re-download failed",
            description:
              err instanceof Error ? err.message : "Could not queue the chapter. Please try again.",
          });
        },
        onSettled: () => {
          setPending((prev) => {
            const next = new Set(prev);
            next.delete(chapterNumber);
            return next;
          });
        },
      }
    );
  };

  return (
    <section>
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex min-h-11 w-full items-center gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <h2 className="font-serif text-[22px] font-normal leading-none tracking-[-0.02em] text-ink transition-colors group-hover:text-accent-ink sm:text-2xl">
              Chapters
            </h2>
            {total > 0 && (
              <span className="font-mono text-[11px] font-medium tabular-nums text-ink-3">{total}</span>
            )}
            <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-rule" />
            {hasOpened && total > 0 && (
              <span className="hidden font-mono text-[11.5px] tabular-nums text-ink-3 sm:inline">
                {downloadedCount} of {total} downloaded
                {missingCount > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-warn">{missingCount} missing</span>
                  </>
                )}
              </span>
            )}
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-rule-2 bg-paper-1 text-ink-2 transition-colors group-hover:border-rule-3 group-hover:text-ink max-sm:h-11 max-sm:w-11">
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
                  open && "rotate-180"
                )}
              />
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4">
          {hasOpened && total > 0 && (
            <p className="mb-3 font-mono text-[11.5px] tabular-nums text-ink-3 sm:hidden">
              {downloadedCount} of {total} downloaded
              {missingCount > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-warn">{missingCount} missing</span>
                </>
              )}
            </p>
          )}
          {isLoading && (
            <div role="status" className="flex items-center justify-center gap-2 rounded-lg border border-rule-2 bg-paper-1 py-10 text-sm text-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading chapters…
            </div>
          )}

          {isError && (
            <div role="alert" className="flex items-center justify-center gap-2 rounded-lg border border-bad/30 bg-bad-soft px-6 py-8 text-center text-sm font-medium text-bad">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Couldn&apos;t load chapters. Please try again.
            </div>
          )}

          {!isLoading && !isError && (
            <>
              {/* Controls */}
              <div className="mb-3 flex items-center gap-2 sm:justify-between">
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by number or title…"
                    aria-label="Filter chapters"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setMissingOnly((v) => !v)}
                  aria-pressed={missingOnly}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-accent-soft max-sm:h-11",
                    missingOnly
                      ? "border-warn/40 bg-warn-soft text-warn"
                      : "border-rule-2 bg-paper-1 text-ink-3 hover:border-rule-3 hover:text-ink"
                  )}
                >
                  Missing only
                  {missingCount > 0 && (
                    <span className="font-mono text-[11px] tabular-nums opacity-80">({missingCount})</span>
                  )}
                </button>
              </div>

              {/* Rows */}
              {filtered.length > 0 ? (
                <TooltipProvider delayDuration={200}>
                  <div className="divide-y divide-rule overflow-hidden rounded-lg border border-rule-2 bg-paper-1 shadow-paper">
                    {filtered.map((chapter, index) => (
                      <ChapterRow
                        key={chapter.number ?? `idx-${index}`}
                        chapter={chapter}
                        paused={paused}
                        canManage={canManage}
                        isPending={chapter.number != null && pending.has(chapter.number)}
                        onRedownload={handleRedownload}
                      />
                    ))}
                  </div>
                </TooltipProvider>
              ) : (
                <div className="rounded-lg border border-dashed border-rule-3 bg-paper-1/60 px-6 py-10 text-center font-serif text-lg italic text-ink-2">
                  {total === 0
                    ? "No chapters tracked for this series yet."
                    : missingOnly
                      ? "No missing chapters — everything is downloaded."
                      : "No chapters match your filter."}
                </div>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
