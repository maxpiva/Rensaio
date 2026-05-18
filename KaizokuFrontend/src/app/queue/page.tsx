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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle,
  Clock,
  Smile,
  RotateCcw,
  Activity,
  Layers,
} from 'lucide-react';
import {
  ErrorDownloadAction,
  ProgressStatus,
  QueueStatus,
} from '@/lib/api/types';
import { JobsPanel } from '@/components/kzk/jobs/jobs-panel';
import { QueueListView } from '@/components/kzk/queue/queue-list-view';
import {
  ActiveRow,
  QueueRow,
  ErrorRow,
  type ActiveDownloadItem,
  type QueueRowData,
  type ErrorRowData,
} from '@/components/kzk/queue/queue-list-row';
import {
  sortDownloads,
  type SortDir,
  type SortKey,
} from '@/components/kzk/queue/queue-list-columns';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LIST_FETCH_LIMIT = 5000;

// ---------------------------------------------------------------------------
// Confirmation Dialog
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

const ConfirmDialog = memo(
  ({ open, onOpenChange, title, description, confirmLabel, confirmVariant = 'destructive', onConfirm, isPending = false }: ConfirmDialogProps) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
);
ConfirmDialog.displayName = 'ConfirmDialog';

// ---------------------------------------------------------------------------
// Metrics Summary Bar
// ---------------------------------------------------------------------------

const MetricsSummary = memo(() => {
  const { data: metrics } = useDownloadsMetrics();
  const active = metrics?.downloads ?? 0;
  const queued = metrics?.queued ?? 0;
  const failed = metrics?.failed ?? 0;

  return (
    <div className="flex flex-wrap justify-center gap-2 mb-3">
      <div className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm">
        <Activity className="h-4 w-4 text-blue-500" />
        <span className="font-medium text-blue-500">{active}</span>
        <span className="text-muted-foreground hidden sm:inline">active</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm">
        <Clock className="h-4 w-4 text-amber-500" />
        <span className="font-medium text-amber-500">{queued}</span>
        <span className="text-muted-foreground hidden sm:inline">queued</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <span className="font-medium text-red-500">{failed}</span>
        <span className="text-muted-foreground hidden sm:inline">failed</span>
      </div>
    </div>
  );
});
MetricsSummary.displayName = 'MetricsSummary';

// ---------------------------------------------------------------------------
// Tab Header Bar
// ---------------------------------------------------------------------------

const TabHeader = memo(({ title, count, totalCount, children }: { title: string; count: number; totalCount?: number; children?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Badge variant="secondary" className="text-xs">{count}</Badge>
      {totalCount !== undefined && totalCount > count && (
        <>
          <span className="text-xs text-muted-foreground">of</span>
          <Badge variant="outline" className="text-xs">{totalCount}</Badge>
        </>
      )}
    </div>
    {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
  </div>
));
TabHeader.displayName = 'TabHeader';

// ---------------------------------------------------------------------------
// Empty / Loading States
// ---------------------------------------------------------------------------

const EmptyState = memo(({ icon, message }: { icon: React.ReactNode; message: string }) => (
  <div className="flex items-center justify-center py-16">
    <div className="text-center text-muted-foreground">
      <div className="flex justify-center mb-4 opacity-40">{icon}</div>
      <p className="text-sm">{message}</p>
    </div>
  </div>
));
EmptyState.displayName = 'EmptyState';

const LoadingState = memo(() => (
  <div className="flex items-center justify-center py-16">
    <div className="text-muted-foreground text-sm">Loading…</div>
  </div>
));
LoadingState.displayName = 'LoadingState';

// ---------------------------------------------------------------------------
// Sort hook helper
// ---------------------------------------------------------------------------

function useSortState() {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: null, dir: 'asc' });
  const onSortChange = useCallback((key: SortKey, dir: SortDir) => {
    setSort({ key, dir });
  }, []);
  return { sortKey: sort.key, sortDir: sort.dir, onSortChange };
}

// ---------------------------------------------------------------------------
// Tab Panels
// ---------------------------------------------------------------------------

const ActiveTabPanel = memo(() => {
  const { downloads, downloadCount } = useDownloadProgress();
  const activeItems = useMemo<ActiveDownloadItem[]>(() => downloads.map((d) => ({
    id: d.id, seriesTitle: d.cardInfo.title, chapterTitle: d.cardInfo.chapterName, thumbnailUrl: d.cardInfo.thumbnailUrl,
    status: d.status === ProgressStatus.Started || d.status === ProgressStatus.InProgress ? 'downloading' : d.status === ProgressStatus.Completed ? 'completed' : 'error',
    progress: Math.round(d.percentage), provider: d.cardInfo.provider, scanlator: d.cardInfo.scanlator,
    language: d.cardInfo.language, chapterNumber: d.cardInfo.chapterNumber, pageCount: d.cardInfo.pageCount,
    message: d.message, errorMessage: d.errorMessage, url: d.cardInfo.url,
  })), [downloads]);

  // Active tab is always sorted by insertion order — no user sort.
  const noopSort = useCallback((_key: SortKey, _dir: SortDir) => undefined, []);
  const activeItemData = useMemo(() => ({ items: activeItems }), [activeItems]);

  return (
    <div>
      <TabHeader title="Active Downloads" count={downloadCount} />
      {activeItems.length === 0 ? (
        <EmptyState icon={<Download className="h-12 w-12" />} message="No active downloads right now" />
      ) : (
        <QueueListView
          itemData={activeItemData}
          itemCount={activeItems.length}
          sortKey={null}
          sortDir="asc"
          onSortChange={noopSort}
          rowComponent={ActiveRow}
          showSortableColumns={false}
        />
      )}
    </div>
  );
});
ActiveTabPanel.displayName = 'ActiveTabPanel';

const QueuedTabPanel = memo(() => {
  const { debouncedSearchTerm } = useSearch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { sortKey, sortDir, onSortChange } = useSortState();
  const { data, isLoading } = useWaitingDownloadsWithCount(LIST_FETCH_LIMIT, debouncedSearchTerm.trim() || undefined, { refetchInterval: 5000, refetchIntervalInBackground: true, staleTime: 2000 });
  const clearDownloads = useClearDownloadsByStatus();
  const removeDownload = useRemoveDownload();
  const downloads = useMemo(() => data?.downloads ?? [], [data?.downloads]);
  const sortedDownloads = useMemo(() => sortDownloads(downloads, sortKey, sortDir), [downloads, sortKey, sortDir]);
  const totalCount = data?.totalCount ?? 0;
  const handleClearAll = useCallback(() => { clearDownloads.mutate(QueueStatus.WAITING, { onSuccess: () => setConfirmOpen(false) }); }, [clearDownloads]);
  const handleRemove = useCallback((id: string) => { removeDownload.mutate(id); }, [removeDownload]);
  const queueItemData = useMemo<QueueRowData>(
    () => ({ items: sortedDownloads, onRemove: handleRemove, isRemovePending: removeDownload.isPending }),
    [sortedDownloads, handleRemove, removeDownload.isPending],
  );

  return (
    <div>
      <TabHeader title="Queued Downloads" count={downloads.length} totalCount={totalCount}>
        {downloads.length > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive"
            onClick={() => setConfirmOpen(true)} disabled={clearDownloads.isPending}>
            <Trash2 className="h-3 w-3" /> Clear All Queued
          </Button>
        )}
      </TabHeader>
      {isLoading ? (
        <LoadingState />
      ) : downloads.length === 0 ? (
        <EmptyState icon={<Clock className="h-12 w-12" />} message="No downloads in queue" />
      ) : (
        <QueueListView
          itemData={queueItemData}
          itemCount={sortedDownloads.length}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={onSortChange}
          rowComponent={QueueRow}
        />
      )}
      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Clear All Queued Downloads?"
        description={`This will permanently remove all ${totalCount || downloads.length} queued download${(totalCount || downloads.length) !== 1 ? 's' : ''}. This action cannot be undone.`}
        confirmLabel="Clear All" onConfirm={handleClearAll} isPending={clearDownloads.isPending} />
    </div>
  );
});
QueuedTabPanel.displayName = 'QueuedTabPanel';

const CompletedTabPanel = memo(() => {
  const { debouncedSearchTerm } = useSearch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { sortKey, sortDir, onSortChange } = useSortState();
  const { data, isLoading } = useCompletedDownloadsWithCount(LIST_FETCH_LIMIT, debouncedSearchTerm.trim() || undefined, { refetchInterval: 5000, refetchIntervalInBackground: true, staleTime: 2000 });
  const clearDownloads = useClearDownloadsByStatus();
  const removeDownload = useRemoveDownload();
  const downloads = useMemo(() => data?.downloads ?? [], [data?.downloads]);
  const sortedDownloads = useMemo(() => sortDownloads(downloads, sortKey, sortDir), [downloads, sortKey, sortDir]);
  const totalCount = data?.totalCount ?? 0;
  const handleClearHistory = useCallback(() => { clearDownloads.mutate(QueueStatus.COMPLETED, { onSuccess: () => setConfirmOpen(false) }); }, [clearDownloads]);
  const handleRemove = useCallback((id: string) => { removeDownload.mutate(id); }, [removeDownload]);
  const queueItemData = useMemo<QueueRowData>(
    () => ({ items: sortedDownloads, onRemove: handleRemove, isRemovePending: removeDownload.isPending }),
    [sortedDownloads, handleRemove, removeDownload.isPending],
  );

  return (
    <div>
      <TabHeader title="Completed Downloads" count={downloads.length} totalCount={totalCount}>
        {downloads.length > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive"
            onClick={() => setConfirmOpen(true)} disabled={clearDownloads.isPending}>
            <Trash2 className="h-3 w-3" /> Clear History
          </Button>
        )}
      </TabHeader>
      {isLoading ? (
        <LoadingState />
      ) : downloads.length === 0 ? (
        <EmptyState icon={<CheckCircle className="h-12 w-12" />} message="No completed downloads" />
      ) : (
        <QueueListView
          itemData={queueItemData}
          itemCount={sortedDownloads.length}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={onSortChange}
          rowComponent={QueueRow}
        />
      )}
      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Clear Download History?"
        description={`This will permanently remove all ${totalCount || downloads.length} completed download record${(totalCount || downloads.length) !== 1 ? 's' : ''}. This action cannot be undone.`}
        confirmLabel="Clear History" onConfirm={handleClearHistory} isPending={clearDownloads.isPending} />
    </div>
  );
});
CompletedTabPanel.displayName = 'CompletedTabPanel';

const ErrorsTabPanel = memo(() => {
  const { debouncedSearchTerm } = useSearch();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmRetryAllOpen, setConfirmRetryAllOpen] = useState(false);
  const { sortKey, sortDir, onSortChange } = useSortState();
  const { data, isLoading } = useFailedDownloadsWithCount(LIST_FETCH_LIMIT, debouncedSearchTerm.trim() || undefined, { refetchInterval: 30000, refetchIntervalInBackground: true, staleTime: 15000 });
  const clearDownloads = useClearDownloadsByStatus();
  const retryAllFailed = useRetryAllFailedDownloads();
  const manageErrorDownload = useManageErrorDownload();
  const downloads = useMemo(() => data?.downloads ?? [], [data?.downloads]);
  const sortedDownloads = useMemo(() => sortDownloads(downloads, sortKey, sortDir), [downloads, sortKey, sortDir]);
  const totalCount = data?.totalCount ?? 0;
  const handleClearAll = useCallback(() => { clearDownloads.mutate(QueueStatus.FAILED, { onSuccess: () => setConfirmClearOpen(false) }); }, [clearDownloads]);
  const handleRetryAll = useCallback(() => { retryAllFailed.mutate(undefined, { onSuccess: () => setConfirmRetryAllOpen(false) }); }, [retryAllFailed]);
  const isBulkPending = clearDownloads.isPending || retryAllFailed.isPending;
  const handleRetry = useCallback((id: string) => { manageErrorDownload.mutate({ id, action: ErrorDownloadAction.Retry }); }, [manageErrorDownload]);
  const handleDelete = useCallback((id: string) => { manageErrorDownload.mutate({ id, action: ErrorDownloadAction.Delete }); }, [manageErrorDownload]);
  const errorItemData = useMemo<ErrorRowData>(
    () => ({ items: sortedDownloads, onRetry: handleRetry, onDelete: handleDelete, isPending: manageErrorDownload.isPending }),
    [sortedDownloads, handleRetry, handleDelete, manageErrorDownload.isPending],
  );

  return (
    <div>
      <TabHeader title="Failed Downloads" count={downloads.length} totalCount={totalCount}>
        {downloads.length > 0 && (
          <>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:border-blue-700"
              onClick={() => setConfirmRetryAllOpen(true)} disabled={isBulkPending}>
              <RotateCcw className="h-3 w-3" /> Retry All
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive"
              onClick={() => setConfirmClearOpen(true)} disabled={isBulkPending}>
              <Trash2 className="h-3 w-3" /> Clear All Errors
            </Button>
          </>
        )}
      </TabHeader>
      {isLoading ? (
        <LoadingState />
      ) : downloads.length === 0 ? (
        <EmptyState icon={<Smile className="h-12 w-12" />} message="No failed downloads — great work!" />
      ) : (
        <QueueListView
          itemData={errorItemData}
          itemCount={sortedDownloads.length}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={onSortChange}
          rowComponent={ErrorRow}
        />
      )}
      <ConfirmDialog open={confirmRetryAllOpen} onOpenChange={setConfirmRetryAllOpen} title="Retry All Failed Downloads?"
        description={`This will re-queue all ${totalCount || downloads.length} failed download${(totalCount || downloads.length) !== 1 ? 's' : ''} for another attempt.`}
        confirmLabel="Retry All" confirmVariant="default" onConfirm={handleRetryAll} isPending={retryAllFailed.isPending} />
      <ConfirmDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen} title="Clear All Failed Downloads?"
        description={`This will permanently delete all ${totalCount || downloads.length} failed download record${(totalCount || downloads.length) !== 1 ? 's' : ''}. This action cannot be undone.`}
        confirmLabel="Clear All" onConfirm={handleClearAll} isPending={clearDownloads.isPending} />
    </div>
  );
});
ErrorsTabPanel.displayName = 'ErrorsTabPanel';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Queue() {
  const { downloadCount } = useDownloadProgress();
  const { data: metrics } = useDownloadsMetrics();
  const queuedCount = metrics?.queued ?? 0;
  const failedCount = metrics?.failed ?? 0;

  return (
    <div className="flex flex-col p-2 gap-3">
      <MetricsSummary />
      <Tabs defaultValue="active" className="w-full">
        <div className="flex justify-center">
        <TabsList className="mb-1 flex-wrap h-auto gap-1 w-full sm:w-auto">
          <TabsTrigger value="active" className="gap-1.5 text-xs sm:text-sm">
            <Activity className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Active</span>
            {downloadCount > 0 && <Badge variant="secondary" className="text-xs px-1 py-0 h-4 min-w-[18px]">{downloadCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="queued" className="gap-1.5 text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Queued</span>
            {queuedCount > 0 && <Badge variant="secondary" className="text-xs px-1 py-0 h-4 min-w-[18px]">{queuedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5 text-xs sm:text-sm">
            <CheckCircle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Completed</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5 text-xs sm:text-sm">
            <AlertTriangle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Errors</span>
            {failedCount > 0 && <Badge variant="destructive" className="text-xs px-1 py-0 h-4 min-w-[18px]">{failedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5 text-xs sm:text-sm">
            <Layers className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Jobs</span>
          </TabsTrigger>
        </TabsList>
        </div>
        <TabsContent value="active"><ActiveTabPanel /></TabsContent>
        <TabsContent value="queued"><QueuedTabPanel /></TabsContent>
        <TabsContent value="completed"><CompletedTabPanel /></TabsContent>
        <TabsContent value="errors"><ErrorsTabPanel /></TabsContent>
        <TabsContent value="jobs"><JobsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
