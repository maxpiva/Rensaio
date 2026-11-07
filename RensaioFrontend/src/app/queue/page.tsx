"use client";

import React, { useMemo, memo, useCallback, useState } from 'react';
import { useDownloadProgress, useRemoveFromQueue } from '@/lib/api/hooks/useQueue';
import {
  useCompletedDownloadsWithCount,
  useWaitingDownloadsWithCount,
  useFailedDownloadsWithCount,
  useManageErrorDownload,
} from '@/lib/api/hooks/useDownloads';
import { useSearch } from '@/contexts/search-context';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ErrorDownloadAction,
} from '@/lib/api/types';
import { AlertTriangle, Inbox, ListChecks, RotateCcw, type LucideIcon } from 'lucide-react';
import { JobsPanel } from '@/components/comp/jobs/jobs-panel';
import { PageHeader, SectionHeading } from '@/components/comp/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { QueueRow, type QueueRowItem, type QueueRowCallbacks } from '@/components/comp/queue/queue-row';
import { ActiveDownloadCard } from '@/components/comp/queue/active-download-card';
import {
  normalizeUtcString,
  formatRelativeTime,
  getDateBucket,
  BUCKET_LABELS,
  type DateBucket,
} from '@/components/comp/queue/utils';

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
// Filter segmented control (with truthful per-filter counts)
// ---------------------------------------------------------------------------

interface FilterPillsProps {
  value: FilterPill;
  onChange: (v: FilterPill) => void;
  counts: Record<FilterPill, number>;
  /** Pills whose count could not be loaded; they show a dash instead of a misleading 0. */
  unknown?: ReadonlySet<FilterPill>;
}

const FilterPills = memo(function FilterPills({ value, onChange, counts, unknown }: FilterPillsProps) {
  const pills: FilterPill[] = ['all', 'completed', 'failed', 'queued'];
  return (
    <div
      role="group"
      aria-label="Filter queue"
      className="grid w-full grid-cols-4 gap-0.5 rounded-md border border-rule-2 bg-paper-1 p-[3px] sm:inline-flex sm:w-auto"
    >
      {pills.map((pill) => {
        const isActive = value === pill;
        return (
          <button
            key={pill}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(pill)}
            className={cn(
              'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[4px] px-3 text-[12.5px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
              'h-[30px] max-sm:h-auto max-sm:min-h-[44px] max-sm:flex-col max-sm:gap-0.5 max-sm:px-1 max-sm:py-1',
              isActive ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-hover hover:text-ink',
            )}
          >
            <span className="inline-flex items-center gap-1">
              {pill === 'failed' && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
              {FILTER_LABELS[pill]}
            </span>
            <span
              className={cn(
                'font-mono text-[10.5px] font-medium tabular-nums',
                isActive ? 'text-paper/70' : 'text-ink-3',
              )}
            >
              {unknown?.has(pill) ? '–' : counts[pill]}
            </span>
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
  const headingId = `queue-bucket-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section className="mb-6" aria-labelledby={headingId}>
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <h3 id={headingId} className="paper-eyebrow text-ink-2">
          {label}
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-ink-3">{items.length}</span>
      </div>
      <ul className="overflow-hidden rounded-lg border border-rule bg-paper-1 shadow-paper">
        {items.map((item) => (
          <QueueRow key={item.id} item={item} callbacks={callbacks} />
        ))}
      </ul>
    </section>
  );
});

// ---------------------------------------------------------------------------
// Empty / loading / error blocks
// ---------------------------------------------------------------------------

function QueueNotice({
  icon: Icon,
  title,
  body,
  tone = 'neutral',
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: React.ReactNode;
  tone?: 'neutral' | 'bad';
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className="flex flex-col items-center rounded-lg border border-dashed border-rule-2 bg-paper-1/60 px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mb-4 grid h-12 w-12 place-items-center rounded-full border',
          tone === 'bad' ? 'border-bad/30 bg-bad-soft text-bad' : 'border-rule-2 bg-paper-2 text-ink-3',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-serif text-[20px] leading-tight text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading queue">
      <Skeleton className="mb-3 h-3 w-24" />
      <div className="overflow-hidden rounded-lg border border-rule bg-paper-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-rule px-4 py-3 first:border-t-0">
            <Skeleton className="hidden h-[22px] w-[88px] md:block" />
            <Skeleton className="h-[42px] w-[30px] rounded-[3px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chapter title when present (empty string counts as missing), else "Ch. N". */
function chapterLabelFor(title: string | null | undefined, chapter: number | null | undefined): string {
  if (typeof title === 'string' && title.length > 0) return title;
  return chapter !== undefined && chapter !== null ? `Ch. ${chapter}` : '';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QueuePage() {
  const { debouncedSearchTerm } = useSearch();
  const search = debouncedSearchTerm.trim().toLowerCase();

  // --- Data hooks ---
  const { downloads: activeDownloads, downloadCount } = useDownloadProgress();
  const waitingQuery = useWaitingDownloadsWithCount(
    LIST_FETCH_LIMIT,
    search || undefined,
    { refetchInterval: 5000, refetchIntervalInBackground: true, staleTime: 2000 },
  );
  const completedQuery = useCompletedDownloadsWithCount(
    LIST_FETCH_LIMIT,
    search || undefined,
    { refetchInterval: 5000, refetchIntervalInBackground: true, staleTime: 2000 },
  );
  const failedQuery = useFailedDownloadsWithCount(
    LIST_FETCH_LIMIT,
    search || undefined,
    { refetchInterval: 30000, refetchIntervalInBackground: true, staleTime: 15000 },
  );

  const { data: waitingData, isLoading: waitingLoading } = waitingQuery;
  const { data: completedData, isLoading: completedLoading } = completedQuery;
  const { data: failedData, isLoading: failedLoading } = failedQuery;

  const isLoading = waitingLoading || completedLoading || failedLoading;
  const hasError = waitingQuery.isError || completedQuery.isError || failedQuery.isError;
  const { refetch: refetchWaiting } = waitingQuery;
  const { refetch: refetchCompleted } = completedQuery;
  const { refetch: refetchFailed } = failedQuery;
  const retryLoad = useCallback(() => {
    void refetchWaiting();
    void refetchCompleted();
    void refetchFailed();
  }, [refetchWaiting, refetchCompleted, refetchFailed]);

  // --- Mutations ---
  const removeFromQueue = useRemoveFromQueue();
  const manageErrorDownload = useManageErrorDownload();

  // --- Dialog state ---
  const [jobsOpen, setJobsOpen] = useState(false);

  // --- Filter pill ---
  const [filter, setFilter] = useState<FilterPill>('all');

  // --- Action callbacks ---
  const handleRetry = useCallback(
    (id: string) => { manageErrorDownload.mutate({ id, action: ErrorDownloadAction.Retry }); },
    [manageErrorDownload],
  );

  const handleRemove = useCallback(
    (id: string) => { removeFromQueue.mutate(id); },
    [removeFromQueue],
  );

  const handleOpen = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleCancelQueued = useCallback(
    (id: string) => { removeFromQueue.mutate(id); },
    [removeFromQueue],
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

  // --- Raw data arrays ---
  const waitingDownloads = useMemo(() => waitingData?.downloads ?? [], [waitingData]);
  const completedDownloads = useMemo(() => completedData?.downloads ?? [], [completedData]);
  const failedDownloads = useMemo(() => failedData?.downloads ?? [], [failedData]);

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
      const chapterLabel = chapterLabelFor(d.chapterTitle, d.chapter);
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
        retries: d.retries,
      });
    }

    // Completed
    for (const d of completedDownloads) {
      const chapterLabel = chapterLabelFor(d.chapterTitle, d.chapter);
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
      const chapterLabel = chapterLabelFor(d.chapterTitle, d.chapter);
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
        retries: d.retries,
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

  // --- Split: in-flight downloads render as cards, the rest as the ledger ---
  const activeVisible = useMemo(
    () => visibleItems.filter((i) => i.status === 'downloading'),
    [visibleItems],
  );
  const historyVisible = useMemo(
    () => visibleItems.filter((i) => i.status !== 'downloading'),
    [visibleItems],
  );

  // --- Bucket into groups ---
  const buckets = useMemo(() => {
    const groups: Record<DateBucket, QueueRowItem[]> = {
      today: [],
      yesterday: [],
      'this-week': [],
      earlier: [],
    };
    for (const item of historyVisible) {
      const bucket = getDateBucket(item.sortTime);
      groups[bucket].push(item);
    }
    return groups;
  }, [historyVisible]);

  // --- Counts (same predicates as the filter, so tabs never lie) ---
  const counts = useMemo<Record<FilterPill, number>>(() => {
    let completed = 0;
    let failed = 0;
    let queued = 0;
    let downloading = 0;
    for (const i of allItems) {
      if (i.status === 'completed') completed++;
      else if (i.status === 'failed') failed++;
      else if (i.status === 'queued') queued++;
      else downloading++;
    }
    return { all: allItems.length, completed, failed, queued: queued + downloading };
  }, [allItems]);
  const downloadingCount = useMemo(
    () => allItems.filter((i) => i.status === 'downloading').length,
    [allItems],
  );

  // --- Total count for the header ---
  const totalCount = allItems.length;
  const showError = hasError && allItems.length === 0 && !isLoading;
  // A failed request makes its pill (and "All") unknown, even when the other
  // requests succeeded, so a partial outage never reads as an honest 0.
  const unknownPills = useMemo(() => {
    const out = new Set<FilterPill>();
    if (waitingQuery.isError) out.add('queued');
    if (completedQuery.isError) out.add('completed');
    if (failedQuery.isError) out.add('failed');
    if (out.size > 0) out.add('all');
    return out;
  }, [waitingQuery.isError, completedQuery.isError, failedQuery.isError]);

  return (
    <div className="w-full max-w-[1100px]">
      <PageHeader
        folio="03"
        eyebrow="Queue · Downloads"
        title="The"
        accent="Queue"
        tate="印刷"
        meta={
          showError
            ? 'Queue unavailable'
            : [
                unknownPills.has('all')
                  ? '– items'
                  : `${totalCount} item${totalCount === 1 ? '' : 's'}`,
                `${downloadingCount} downloading`,
                `${unknownPills.has('failed') ? '–' : counts.failed} failed`,
              ]
        }
        actions={
          <Button variant="outline" size="sm" className="max-sm:min-h-11" onClick={() => setJobsOpen(true)}>
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            Jobs
          </Button>
        }
      >
        <FilterPills value={filter} onChange={setFilter} counts={counts} unknown={unknownPills} />
      </PageHeader>

      {hasError && !showError && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad"
        >
          <AlertTriangle className="h-4 w-4 flex-none" aria-hidden="true" />
          <span className="min-w-0 flex-1">Part of the queue couldn&rsquo;t be loaded. The list below may be incomplete.</span>
          <Button variant="danger" size="xs" className="max-sm:min-h-11" onClick={retryLoad}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {/* Body */}
      {isLoading && downloadCount === 0 ? (
        <QueueSkeleton />
      ) : showError ? (
        <QueueNotice
          icon={AlertTriangle}
          tone="bad"
          title="Couldn’t load the queue"
          body="The server didn’t answer. Downloads keep running in the background."
          action={
            <Button variant="ink" onClick={retryLoad}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          }
        />
      ) : visibleItems.length === 0 ? (
        <QueueNotice
          icon={Inbox}
          title={filter === 'all' ? 'The press is quiet' : `Nothing ${FILTER_LABELS[filter].toLowerCase()}`}
          body={
            filter === 'all'
              ? "That's everything from the last 7 days."
              : `Nothing to show for "${FILTER_LABELS[filter]}".`
          }
        />
      ) : (
        <>
          {activeVisible.length > 0 && (
            <section aria-label="Downloading now" className="mb-8">
              <SectionHeading title="Now printing" count={activeVisible.length} />
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
                {activeVisible.map((item) => (
                  <ActiveDownloadCard key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}

          {historyVisible.length > 0 && (
            <section aria-label="History">
              <SectionHeading title="History" count={historyVisible.length} />
              {BUCKET_ORDER.map((bucket) => (
                <SectionGroup
                  key={bucket}
                  label={BUCKET_LABELS[bucket]}
                  items={buckets[bucket]}
                  callbacks={callbacks}
                />
              ))}
            </section>
          )}

          {totalAfterFilter > MAX_VISIBLE && (
            <p className="py-4 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
              Showing {MAX_VISIBLE} of {totalAfterFilter}
            </p>
          )}
        </>
      )}

      {/* Dialogs */}
      <Dialog open={jobsOpen} onOpenChange={setJobsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Jobs</DialogTitle>
          </DialogHeader>
          <JobsPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}
