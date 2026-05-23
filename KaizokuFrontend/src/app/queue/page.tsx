"use client";

import React, { useMemo, memo, useCallback, useState } from 'react';
import { useDownloadProgress } from '@/lib/api/hooks/useQueue';
import {
  useCompletedDownloadsWithCount,
  useWaitingDownloadsWithCount,
  useFailedDownloadsWithCount,
  useClearDownloadsByStatus,
  useRetryAllFailedDownloads,
  useDownloadsMetrics,
  useRemoveDownload,
  useManageErrorDownload,
} from '@/lib/api/hooks/useDownloads';
import { useSearch } from '@/contexts/search-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ErrorDownloadAction,
  QueueStatus,
} from '@/lib/api/types';
import { JobsPanel } from '@/components/kzk/jobs/jobs-panel';
import { RibbonSlot } from '@/components/kzk/layout/ribbon';
import { QueueRow, type QueueRowItem, type QueueRowCallbacks } from '@/components/kzk/queue/queue-row';
import {
  normalizeUtcString,
  formatRelativeTime,
  getDateBucket,
  BUCKET_LABELS,
  type DateBucket,
} from '@/components/kzk/queue/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LIST_FETCH_LIMIT = 5000;
const MAX_VISIBLE = 500;

// Ordered bucket sequence for display
const BUCKET_ORDER: DateBucket[] = ['today', 'yesterday', 'this-week', 'earlier'];

// ---------------------------------------------------------------------------
// Filter pill types
// ---------------------------------------------------------------------------

type FilterPill = 'all' | 'completed' | 'failed' | 'queued';

const FILTER_LABELS: Record<FilterPill, string> = {
  all: 'All',
  completed: 'Completed',
  failed: 'Failed',
  queued: 'Queued',
};

// ---------------------------------------------------------------------------
// Confirmation Dialog (shared)
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: 'destructive' | 'default';
  onConfirm: () => void;
  isPending?: boolean;
}

const ConfirmDialog = memo(function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = 'destructive',
  onConfirm,
  isPending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
ConfirmDialog.displayName = 'ConfirmDialog';

// ---------------------------------------------------------------------------
// Filter pill segmented control
// ---------------------------------------------------------------------------

interface FilterPillsProps {
  value: FilterPill;
  onChange: (v: FilterPill) => void;
}

const FilterPills = memo(function FilterPills({ value, onChange }: FilterPillsProps) {
  const pills: FilterPill[] = ['all', 'completed', 'failed', 'queued'];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full px-0.5 py-0.5 border border-white/[0.06] bg-white/[0.015]">
      {pills.map((pill) => {
        const isActive = value === pill;
        return (
          <button
            key={pill}
            type="button"
            onClick={() => onChange(pill)}
            className={`rounded-full px-3.5 py-[5px] text-[12.5px] font-medium transition-colors duration-[120ms] ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {FILTER_LABELS[pill]}
          </button>
        );
      })}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Section group renderer
// ---------------------------------------------------------------------------

interface SectionGroupProps {
  label: string;
  items: QueueRowItem[];
  callbacks: QueueRowCallbacks;
}

const SectionGroup = memo(function SectionGroup({ label, items, callbacks }: SectionGroupProps) {
  if (items.length === 0) return null;
  return (
    <section className="mb-10">
      <div className="px-1 pb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="rounded-lg overflow-hidden">
        {items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            callbacks={callbacks}
          />
        ))}
      </div>
    </section>
  );
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QueuePage() {
  const { debouncedSearchTerm } = useSearch();
  const search = debouncedSearchTerm.trim().toLowerCase();

  // --- Data hooks ---
  const { downloads: activeDownloads, downloadCount } = useDownloadProgress();
  const { data: waitingData, isLoading: waitingLoading } = useWaitingDownloadsWithCount(
    LIST_FETCH_LIMIT,
    search || undefined,
    { refetchInterval: 5000, refetchIntervalInBackground: true, staleTime: 2000 },
  );
  const { data: completedData, isLoading: completedLoading } = useCompletedDownloadsWithCount(
    LIST_FETCH_LIMIT,
    search || undefined,
    { refetchInterval: 5000, refetchIntervalInBackground: true, staleTime: 2000 },
  );
  const { data: failedData, isLoading: failedLoading } = useFailedDownloadsWithCount(
    LIST_FETCH_LIMIT,
    search || undefined,
    { refetchInterval: 30000, refetchIntervalInBackground: true, staleTime: 15000 },
  );
  const { data: metrics } = useDownloadsMetrics();

  const isLoading = waitingLoading || completedLoading || failedLoading;

  // --- Mutations ---
  const clearDownloads = useClearDownloadsByStatus();
  const retryAllFailed = useRetryAllFailedDownloads();
  const removeDownload = useRemoveDownload();
  const manageErrorDownload = useManageErrorDownload();

  // --- Dialog state ---
  const [clearCompletedOpen, setClearCompletedOpen] = useState(false);
  const [retryAllOpen, setRetryAllOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);

  // --- Filter pill ---
  const [filter, setFilter] = useState<FilterPill>('all');

  // --- Action callbacks ---
  const handleRetry = useCallback(
    (id: string) => { manageErrorDownload.mutate({ id, action: ErrorDownloadAction.Retry }); },
    [manageErrorDownload],
  );

  const handleRemove = useCallback(
    (id: string) => { removeDownload.mutate(id); },
    [removeDownload],
  );

  const handleOpen = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleCancelQueued = useCallback(
    (id: string) => { removeDownload.mutate(id); },
    [removeDownload],
  );

  const callbacks: QueueRowCallbacks = useMemo(
    () => ({
      onRetry: handleRetry,
      onRemove: handleRemove,
      onOpen: handleOpen,
      onCancel: handleCancelQueued,
    }),
    [handleRetry, handleRemove, handleOpen, handleCancelQueued],
  );

  const handleClearCompleted = useCallback(() => {
    clearDownloads.mutate(QueueStatus.COMPLETED, { onSuccess: () => setClearCompletedOpen(false) });
  }, [clearDownloads]);

  const handleRetryAll = useCallback(() => {
    retryAllFailed.mutate(undefined, { onSuccess: () => setRetryAllOpen(false) });
  }, [retryAllFailed]);

  // --- Raw data arrays ---
  const waitingDownloads = useMemo(() => waitingData?.downloads ?? [], [waitingData]);
  const completedDownloads = useMemo(() => completedData?.downloads ?? [], [completedData]);
  const failedDownloads = useMemo(() => failedData?.downloads ?? [], [failedData]);

  const completedCount = completedData?.totalCount ?? completedDownloads.length;
  const failedCount = metrics?.failed ?? failedDownloads.length;

  // --- Merge and build QueueRowItems ---
  const allItems = useMemo<QueueRowItem[]>(() => {
    const items: QueueRowItem[] = [];

    // Active (SignalR) — always "today"
    for (const d of activeDownloads) {
      const chapterLabel = d.cardInfo.chapterName || (d.cardInfo.chapterNumber !== undefined ? `Ch. ${d.cardInfo.chapterNumber}` : '');
      // Client-side search filter on active items (server doesn't filter them)
      if (search) {
        const titleMatch = d.cardInfo.title.toLowerCase().includes(search);
        const chapterMatch = chapterLabel.toLowerCase().includes(search);
        if (!titleMatch && !chapterMatch) continue;
      }
      items.push({
        id: d.id,
        status: 'downloading',
        seriesTitle: d.cardInfo.title,
        chapterLabel,
        thumbnailUrl: d.cardInfo.thumbnailUrl,
        provider: d.cardInfo.provider,
        scanlator: d.cardInfo.scanlator,
        url: d.cardInfo.url,
        sortTime: 0,
        displayTime: 'downloading',
        hasRetry: false,
        progress: typeof d.percentage === 'number' ? d.percentage : undefined,
      });
    }

    // Waiting / queued
    for (const d of waitingDownloads) {
      const chapterLabel = d.chapterTitle || (d.chapter !== undefined ? `Ch. ${d.chapter}` : '');
      let sortTime = 0;
      if (d.scheduledDateUTC) {
        const parsed = Date.parse(normalizeUtcString(d.scheduledDateUTC));
        if (!Number.isNaN(parsed)) sortTime = 0; // queued items go to today
      }
      items.push({
        id: d.id,
        status: 'queued',
        seriesTitle: d.title,
        chapterLabel,
        thumbnailUrl: d.thumbnailUrl,
        provider: d.provider,
        scanlator: d.scanlator,
        url: d.url,
        sortTime,
        displayTime: 'queued',
        hasRetry: false,
      });
    }

    // Completed
    for (const d of completedDownloads) {
      const chapterLabel = d.chapterTitle || (d.chapter !== undefined ? `Ch. ${d.chapter}` : '');
      let sortTime = 0;
      let displayTime = 'completed';
      if (d.downloadDateUTC) {
        const parsed = Date.parse(normalizeUtcString(d.downloadDateUTC));
        if (!Number.isNaN(parsed)) {
          sortTime = parsed;
          displayTime = formatRelativeTime(new Date(parsed));
        }
      }
      items.push({
        id: d.id,
        status: 'completed',
        seriesTitle: d.title,
        chapterLabel,
        thumbnailUrl: d.thumbnailUrl,
        provider: d.provider,
        scanlator: d.scanlator,
        url: d.url,
        sortTime,
        displayTime,
        hasRetry: false,
      });
    }

    // Failed
    for (const d of failedDownloads) {
      const chapterLabel = d.chapterTitle || (d.chapter !== undefined ? `Ch. ${d.chapter}` : '');
      let sortTime = 0;
      let displayTime = 'failed';
      if (d.downloadDateUTC) {
        const parsed = Date.parse(normalizeUtcString(d.downloadDateUTC));
        if (!Number.isNaN(parsed)) {
          sortTime = parsed;
          displayTime = formatRelativeTime(new Date(parsed));
        }
      }
      items.push({
        id: d.id,
        status: 'failed',
        seriesTitle: d.title,
        chapterLabel,
        thumbnailUrl: d.thumbnailUrl,
        provider: d.provider,
        scanlator: d.scanlator,
        url: d.url,
        sortTime,
        displayTime,
        hasRetry: true,
      });
    }

    return items;
  }, [activeDownloads, waitingDownloads, completedDownloads, failedDownloads, search]);

  // --- Filter by pill ---
  const filteredItems = useMemo(() => {
    if (filter === 'all') return allItems;
    if (filter === 'queued') return allItems.filter((i) => i.status === 'queued' || i.status === 'downloading');
    return allItems.filter((i) => i.status === filter);
  }, [allItems, filter]);

  // --- Sort descending by sortTime (newest first; 0 = active/queued → always top) ---
  const sortedItems = useMemo(() => {
    const copy = [...filteredItems];
    copy.sort((a, b) => {
      // Items with sortTime=0 (active/queued) float to the top
      if (a.sortTime === 0 && b.sortTime === 0) return 0;
      if (a.sortTime === 0) return -1;
      if (b.sortTime === 0) return 1;
      return b.sortTime - a.sortTime;
    });
    return copy;
  }, [filteredItems]);

  // --- Cap to MAX_VISIBLE ---
  const visibleItems = useMemo(() => sortedItems.slice(0, MAX_VISIBLE), [sortedItems]);
  const totalAfterFilter = sortedItems.length;

  // --- Bucket into groups ---
  const buckets = useMemo(() => {
    const groups: Record<DateBucket, QueueRowItem[]> = {
      today: [],
      yesterday: [],
      'this-week': [],
      earlier: [],
    };
    for (const item of visibleItems) {
      const bucket = getDateBucket(item.sortTime);
      groups[bucket].push(item);
    }
    return groups;
  }, [visibleItems]);

  // --- Total count for the header ---
  const totalCount = allItems.length;

  return (
    <>
      {/* Ribbon: filter pills */}
      <RibbonSlot>
        <div className="flex w-full justify-center">
          <FilterPills value={filter} onChange={setFilter} />
        </div>
      </RibbonSlot>

      {/* Page content */}
      <div className="mx-auto max-w-[1100px] py-6 sm:py-10">

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div className="flex items-baseline gap-3">
              <h1 className="text-[22px] font-semibold tracking-tight">Queue</h1>
              <span className="text-sm tabular-nums text-muted-foreground/70">
                {totalCount}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {completedCount > 0 && (
                <>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-md transition-colors hover:text-foreground hover:bg-white/[0.03]"
                    onClick={() => setClearCompletedOpen(true)}
                    disabled={clearDownloads.isPending}
                  >
                    Clear completed
                  </button>
                  <span className="text-muted-foreground">·</span>
                </>
              )}
              {failedCount > 0 && (
                <>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-md transition-colors hover:text-foreground hover:bg-white/[0.03]"
                    onClick={() => setRetryAllOpen(true)}
                    disabled={retryAllFailed.isPending}
                  >
                    Retry all failed
                  </button>
                  <span className="text-muted-foreground">·</span>
                </>
              )}
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-md transition-colors hover:text-foreground hover:bg-white/[0.03]"
                onClick={() => setJobsOpen(true)}
              >
                Jobs
              </button>
            </div>
          </div>
        </header>

        {/* Body */}
        {isLoading && downloadCount === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-16">Loading…</div>
        ) : visibleItems.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-16">
            {filter === 'all'
              ? "That's everything from the last 7 days."
              : `Nothing to show for "${FILTER_LABELS[filter]}".`}
          </div>
        ) : (
          <>
            {BUCKET_ORDER.map((bucket) => (
              <SectionGroup
                key={bucket}
                label={BUCKET_LABELS[bucket]}
                items={buckets[bucket]}
                callbacks={callbacks}
              />
            ))}

            {totalAfterFilter > MAX_VISIBLE && (
              <div className="text-center text-xs text-muted-foreground py-4">
                Showing {MAX_VISIBLE} of {totalAfterFilter}
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={clearCompletedOpen}
        onOpenChange={setClearCompletedOpen}
        title="Clear completed downloads?"
        description={`This will permanently remove all ${completedCount} completed download record${completedCount !== 1 ? 's' : ''}. This action cannot be undone.`}
        confirmLabel="Clear completed"
        onConfirm={handleClearCompleted}
        isPending={clearDownloads.isPending}
      />

      <ConfirmDialog
        open={retryAllOpen}
        onOpenChange={setRetryAllOpen}
        title="Retry all failed downloads?"
        description={`This will re-queue all ${failedCount} failed download${failedCount !== 1 ? 's' : ''} for another attempt.`}
        confirmLabel="Retry all"
        confirmVariant="default"
        onConfirm={handleRetryAll}
        isPending={retryAllFailed.isPending}
      />

      <Dialog open={jobsOpen} onOpenChange={setJobsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Jobs</DialogTitle>
          </DialogHeader>
          <JobsPanel />
        </DialogContent>
      </Dialog>
    </>
  );
}
