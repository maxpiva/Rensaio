"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
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
          (c.number != null && c.number.toString().includes(q)) ||
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
    <section className="space-y-4">
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-3 rounded-lg text-left"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Chapters</h2>
              {total > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/10 px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {hasOpened && total > 0 && (
                <span className="hidden sm:inline">
                  {downloadedCount} of {total} downloaded
                  {missingCount > 0 && (
                    <>
                      {" · "}
                      <span className="font-medium text-amber-500">{missingCount} missing</span>
                    </>
                  )}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading chapters…
            </div>
          )}

          {isError && (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">
              Couldn&apos;t load chapters. Please try again.
            </div>
          )}

          {!isLoading && !isError && (
            <>
              {/* Controls */}
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-xs flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by number or title…"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setMissingOnly((v) => !v)}
                  aria-pressed={missingOnly}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                    missingOnly
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
                      : "border-border/40 bg-foreground/[0.04] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                  )}
                >
                  Missing only
                  {missingCount > 0 && (
                    <span className="tabular-nums opacity-80">({missingCount})</span>
                  )}
                </button>
              </div>

              {/* Rows */}
              {filtered.length > 0 ? (
                <TooltipProvider delayDuration={200}>
                  <div className="space-y-2">
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
                <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">
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
