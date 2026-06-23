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
        "flex items-center gap-3 rounded-lg border border-border/40 bg-card/50 px-3 py-2.5",
        "transition-colors hover:bg-foreground/[0.03]"
      )}
    >
      {/* Status icon */}
      {chapter.downloaded ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      )}

      {/* Chapter number + title */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium tabular-nums">{formatChapter(num)}</span>
          {chapter.name && (
            <span className="truncate text-sm text-muted-foreground" title={chapter.name}>
              {chapter.name}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px]">
          {chapter.downloaded ? (
            <span className="text-muted-foreground">
              from{" "}
              <span className="font-medium text-foreground/80">
                {chapter.sourceProviderName ?? "unknown source"}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-amber-500">
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
                  <Button size="sm" variant="outline" disabled className="h-8 gap-1.5">
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
                className="h-8 gap-1.5 rounded-r-none border-r-0"
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
                    className="h-8 rounded-l-none px-1.5"
                    aria-label="Choose source"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
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
                        <Check className="h-3.5 w-3.5 text-muted-foreground" />
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
