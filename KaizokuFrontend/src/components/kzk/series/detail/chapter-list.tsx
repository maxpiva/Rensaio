"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CircleDashed,
  Clock,
  Download,
  ExternalLink,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChapterDownloadStatus, type ChapterDto } from "@/lib/api/types";
import {
  useChaptersForSeries,
  useDownloadMissingChapters,
  useRefreshChapters,
} from "@/lib/api/hooks/useSeries";

// ---------------------------------------------------------------------------
// relativeTime — same body as library-stats-card.tsx (not exported there)
// ---------------------------------------------------------------------------
function relativeTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  const ms = Date.now() - time;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// StatusDisc
// ---------------------------------------------------------------------------
function StatusDisc({ status }: { status: ChapterDownloadStatus }) {
  const config = {
    [ChapterDownloadStatus.Downloaded]: { bg: "bg-emerald-500/15", text: "text-emerald-400", icon: Check },
    [ChapterDownloadStatus.Queued]: { bg: "bg-primary/15", text: "text-primary", icon: Clock },
    [ChapterDownloadStatus.Missing]: { bg: "bg-amber-500/15", text: "text-amber-400", icon: CircleDashed },
    [ChapterDownloadStatus.Failed]: { bg: "bg-destructive/15", text: "text-destructive", icon: AlertTriangle },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${config.bg} ${config.text}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// FilterChip
// ---------------------------------------------------------------------------
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full h-6 px-2.5 font-medium transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ChapterRow
// ---------------------------------------------------------------------------
function ChapterRow({
  chapter,
  canEdit,
  onDownload,
  isDownloading,
}: {
  chapter: ChapterDto;
  canEdit: boolean;
  onDownload: () => void;
  isDownloading: boolean;
}) {
  const status = chapter.status;
  const numberLabel = chapter.number !== null ? `Ch. ${chapter.number}` : "Ch. ?";
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.04] transition-colors">
      <StatusDisc status={status} />
      <div className="flex-1 min-w-0">
        <div className="truncate text-[13px] font-medium text-foreground leading-tight">
          {numberLabel}
          {chapter.name ? ` · ${chapter.name}` : ""}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
          {chapter.pageCount != null && chapter.pageCount > 0 && <span>{chapter.pageCount} pages</span>}
          {chapter.pageCount != null && chapter.pageCount > 0 && (chapter.downloadDate || chapter.providerUploadDate) && <span>·</span>}
          {chapter.downloadDate && <span>Downloaded {relativeTime(chapter.downloadDate)}</span>}
          {!chapter.downloadDate && chapter.providerUploadDate && (
            <span>Uploaded {relativeTime(chapter.providerUploadDate)}</span>
          )}
          {chapter.providers.length > 1 && (
            <>
              <span>·</span>
              <span>{chapter.providers.length} sources</span>
            </>
          )}
        </div>
      </div>
      {/* Per-row download — only when missing, canEdit, and chapter has a non-null number */}
      {canEdit && status === ChapterDownloadStatus.Missing && chapter.number !== null && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={`Download ${numberLabel}`}
          disabled={isDownloading}
          onClick={onDownload}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      )}
      {status === ChapterDownloadStatus.Downloaded && chapter.providers[0]?.url && (
        <a
          href={chapter.providers[0].url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:bg-foreground/[0.16] opacity-0 group-hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Open chapter source"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChapterList
// ---------------------------------------------------------------------------

type FilterValue = "all" | "downloaded" | "missing";
type SortDir = "asc" | "desc";

interface ChapterListProps {
  seriesId: string;
  canEditSeries: boolean;
}

const PAGE_SIZE = 50;

export function ChapterList({ seriesId, canEditSeries }: ChapterListProps) {
  const { data, isLoading } = useChaptersForSeries(seriesId);
  const chapters = data ?? [];

  const downloadAll = useDownloadMissingChapters(seriesId);
  const downloadOne = useDownloadMissingChapters(seriesId);
  const refreshChapters = useRefreshChapters(seriesId);

  // Refresh throttle — disable for 30s after click
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  const [filter, setFilter] = useState<FilterValue>("all");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showAll, setShowAll] = useState(false);

  const missingCount = useMemo(
    () => chapters.filter(c => c.status === ChapterDownloadStatus.Missing).length,
    [chapters],
  );
  const downloadedCount = useMemo(
    () => chapters.filter(c => c.status === ChapterDownloadStatus.Downloaded).length,
    [chapters],
  );

  const filteredAndSorted = useMemo(() => {
    let result = chapters;
    if (filter === "downloaded") {
      result = result.filter(c => c.status === ChapterDownloadStatus.Downloaded);
    } else if (filter === "missing") {
      result = result.filter(c => c.status === ChapterDownloadStatus.Missing);
    }
    return [...result].sort((a, b) => {
      const an = a.number ?? Infinity;
      const bn = b.number ?? Infinity;
      return sortDir === "asc" ? an - bn : bn - an;
    });
  }, [chapters, filter, sortDir]);

  const hasMore = filteredAndSorted.length > PAGE_SIZE && !showAll;
  const visibleChapters = showAll ? filteredAndSorted : filteredAndSorted.slice(0, PAGE_SIZE);

  // Schedule a re-render exactly when the cooldown expires so the button
  // re-enables itself without needing another user interaction.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const remaining = cooldownUntil - Date.now();
    const timer = setTimeout(() => {
      setCooldownUntil(0);
    }, remaining + 50); // 50ms buffer
    return () => clearTimeout(timer);
  }, [cooldownUntil]);

  const refreshDisabled = refreshChapters.isPending || Date.now() < cooldownUntil;

  const handleRefresh = () => {
    setCooldownUntil(Date.now() + 30_000);
    refreshChapters.mutate();
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Chapters</h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/10 px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            {chapters.length}
          </span>
          {missingCount > 0 && (
            <span className="inline-flex h-5 items-center rounded-full bg-amber-500/15 px-2 text-[11px] font-medium text-amber-500 tabular-nums">
              {missingCount} missing
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canEditSeries && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Refresh chapters from sources"
              disabled={refreshDisabled}
              onClick={handleRefresh}
            >
              <RefreshCcw
                className={`h-3.5 w-3.5 ${refreshChapters.isPending ? "animate-spin" : ""}`}
              />
            </Button>
          )}
          {canEditSeries && missingCount > 0 && (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs gap-1.5"
              disabled={downloadAll.isPending}
              onClick={() => downloadAll.mutate(undefined)}
            >
              <Download className="h-3 w-3" />
              Download All
            </Button>
          )}
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/40 text-[11px]">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All ({chapters.length})
        </FilterChip>
        <FilterChip active={filter === "downloaded"} onClick={() => setFilter("downloaded")}>
          Downloaded ({downloadedCount})
        </FilterChip>
        <FilterChip active={filter === "missing"} onClick={() => setFilter("missing")}>
          Missing ({missingCount})
        </FilterChip>
        <div className="ml-auto">
          <button
            onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:bg-foreground/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Sort ${sortDir === "asc" ? "descending" : "ascending"}`}
          >
            {sortDir === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            Ch. {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Loading chapters…
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <BookOpen className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            {chapters.length === 0
              ? "No chapters yet — click Refresh to fetch from sources."
              : filter === "missing"
                ? "No missing chapters — all caught up!"
                : filter === "downloaded"
                  ? "No downloaded chapters yet."
                  : "No chapters match the filter."}
          </p>
        </div>
      ) : (
        <div className="max-h-[480px] overflow-y-auto divide-y divide-border/40">
          {visibleChapters.map((c, i) => (
            <ChapterRow
              key={`${c.number ?? "null"}-${i}`}
              chapter={c}
              canEdit={canEditSeries}
              onDownload={() => downloadOne.mutate([c.number!])}
              isDownloading={
                downloadOne.isPending &&
                Array.isArray(downloadOne.variables) &&
                downloadOne.variables[0] === c.number
              }
            />
          ))}
          {/* TODO: allow user to collapse back to 50 (currently one-way expansion) */}
          {hasMore && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-2 text-xs text-primary hover:bg-foreground/[0.04] transition-colors"
            >
              Show all ({filteredAndSorted.length})
            </button>
          )}
        </div>
      )}
    </section>
  );
}
