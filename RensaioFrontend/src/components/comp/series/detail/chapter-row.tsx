"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ChapterDetail } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export interface ChapterRowProps {
  chapter: ChapterDetail;
  /** Series is paused — the action is blocked. */
  paused: boolean;
  /** User may queue downloads. When false the action column is hidden. */
  canManage: boolean;
  /** This chapter currently has a queued re-download in flight. */
  isPending: boolean;
  /** Omit providerId for the priority default; pass it to force a specific source. */
  onRedownload: (chapterNumber: number, providerId?: string) => void;
}

function formatChapter(n: number | undefined): string {
  if (n == null) return "—";
  return `Ch. ${n}`;
}

export function ChapterRow({
  chapter,
  paused,
  canManage,
  isPending,
  onRedownload,
}: ChapterRowProps) {
  const num = chapter.number;
  const label = chapter.downloaded ? "Re-download" : "Download";

  const disabledReason = paused
    ? "Unpause the series to re-download"
    : chapter.availableProviders.length === 0
      ? "No source available to download this chapter"
      : num == null
        ? "Chapter number is unknown"
        : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3.5 py-2.5 sm:px-4",
        "transition-colors hover:bg-hover",
        !chapter.downloaded && "bg-warn-soft/60"
      )}
    >
      {/* Status icon */}
      {chapter.downloaded ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-label="Downloaded" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-label="Missing" />
      )}

      {/* Chapter number + title */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-ink">{formatChapter(num)}</span>
          {chapter.name && (
            <span className="truncate text-sm text-ink-2" title={chapter.name}>
              {chapter.name}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px]">
          {chapter.downloaded ? (
            <span className="text-ink-3">
              from{" "}
              <span className="font-semibold text-ink-2">
                {chapter.sourceProviderName ?? "unknown source"}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-warn">
              Missing
            </span>
          )}
        </div>
      </div>

      {/* Re-download split button */}
      {canManage && (
        <div className="shrink-0">
          {disabledReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button size="sm" variant="outline" disabled className="gap-1.5 bg-paper max-sm:h-11">
                    {chapter.downloaded ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {label}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{disabledReason}</TooltipContent>
            </Tooltip>
          ) : (
            <div className="inline-flex items-stretch">
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => num != null && onRedownload(num)}
                className="gap-1.5 rounded-r-none border-r-0 bg-paper max-sm:h-11"
                title={
                  chapter.downloaded
                    ? `Re-download from the best source`
                    : `Download chapter ${num}`
                }
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : chapter.downloaded ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {label}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    className="rounded-l-none bg-paper px-1.5 max-sm:h-11 max-sm:w-10"
                    aria-label="Choose source"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  <DropdownMenuLabel className="paper-eyebrow">
                    {chapter.downloaded ? "Re-download from" : "Download from"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {chapter.availableProviders.map((src) => (
                    <DropdownMenuItem
                      key={src.id}
                      onSelect={() => num != null && onRedownload(num, src.id)}
                      className="gap-2"
                    >
                      <span className="flex-1 truncate">{src.name}</span>
                      {src.id === chapter.sourceProviderId && (
                        <Check className="h-3.5 w-3.5 text-accent-ink" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
