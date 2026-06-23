import { memo, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { useDownloadsForSeries } from "@/lib/api/hooks/useDownloads";
import { QueueStatus, type DownloadInfo } from "@/lib/api/types";
import { DownloadItem } from "./download-item";

/**
 * Downloads Panel Component - Fully disconnected from ProviderExtendedInfo
 *
 * Features:
 * - Uses new getDownloadsForSeries API endpoint
 * - Live polling every 10 seconds for real-time updates
 * - Memoized component to prevent unnecessary re-renders
 * - Memoized sorted downloads array for performance
 * - Loading indicator during data fetch
 * - Error handling with fallback UI
 * - Only re-renders when downloads data actually changes
 * - Auto-refreshes series and providers when downloads complete
 * - Properly handles series deletion to prevent infinite loops
 */
export const DownloadsPanel = memo(({ seriesId, isDeleting }: { seriesId: string; isDeleting: boolean }) => {
  const queryClient = useQueryClient();

  // Track previous downloads state to detect completion
  const previousDownloadsRef = useRef<DownloadInfo[] | null>(null);

  // Fetch downloads with live polling every 10 seconds, but disable when deleting
  const {
    data: downloads,
    isLoading: downloadsLoading,
    isFetching: downloadsFetching,
    error: downloadsError,
  } = useDownloadsForSeries(seriesId, {
    refetchInterval: isDeleting ? false : 10000, // Stop polling when deleting
    refetchIntervalInBackground: !isDeleting, // Stop background polling when deleting
    staleTime: 5000, // Consider data stale after 5 seconds
    enabled: !isDeleting, // Disable query entirely when deleting
  });

  // Detect when active downloads (waiting/running) complete and trigger series refresh
  useEffect(() => {
    // Skip all logic if we're in the process of deleting
    if (isDeleting) {
      return;
    }

    if (!downloads || !previousDownloadsRef.current) {
      // First load or no previous data - just store current state
      previousDownloadsRef.current = downloads ?? null;
      return;
    }

    const previousDownloads = previousDownloadsRef.current;
    const currentDownloads = downloads;

    // Check if previous downloads had waiting or running items
    const previousActiveDownloads = previousDownloads.filter(
      (download) =>
        download.status === QueueStatus.WAITING || download.status === QueueStatus.RUNNING,
    );

    // Check if current downloads have waiting or running items
    const currentActiveDownloads = currentDownloads.filter(
      (download) =>
        download.status === QueueStatus.WAITING || download.status === QueueStatus.RUNNING,
    );

    const hadActiveDownloads = previousActiveDownloads.length > 0;
    const hasActiveDownloads = currentActiveDownloads.length > 0;

    // If we had active downloads before but don't now, trigger series refresh
    if (hadActiveDownloads && !hasActiveDownloads) {
      // Small delay to ensure backend has processed the completion and updated series data
      setTimeout(() => {
        // Only refresh if we're not deleting the series
        if (!isDeleting) {
          // Refresh both series data and providers data
          queryClient.invalidateQueries({
            queryKey: ['series', 'detail', seriesId],
          });

          // Also refresh sources/providers to get updated chapter counts and metadata
          queryClient.invalidateQueries({
            queryKey: ['series', 'sources'],
          });
        }
      }, 1000);
    }

    // Update the previous state
    previousDownloadsRef.current = downloads;
  }, [downloads, seriesId, queryClient, isDeleting]);

  // Memoize sorted downloads to prevent unnecessary re-renders
  const sortedDownloads = useMemo(() => {
    if (!downloads?.length) return [];

    return [...downloads].sort((a, b) => {
      const dateA = new Date(a.scheduledDateUTC);
      const dateB = new Date(b.scheduledDateUTC);
      return dateB.getTime() - dateA.getTime();
    });
  }, [downloads]);

  // Cap visible rows to 5
  const visibleDownloads = useMemo(
    () => sortedDownloads.slice(0, 5),
    [sortedDownloads],
  );

  // Aggregate counts from the FULL downloads array
  const { activeCount, queuedCount, failedCount } = useMemo(() => {
    let active = 0;
    let queued = 0;
    let failed = 0;
    for (const d of sortedDownloads) {
      if (d.status === QueueStatus.RUNNING) active++;
      else if (d.status === QueueStatus.WAITING) queued++;
      else if (d.status === QueueStatus.FAILED) failed++;
    }
    return { activeCount: active, queuedCount: queued, failedCount: failed };
  }, [sortedDownloads]);

  if (downloadsError) {
    return (
      <section className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
          <h2 className="text-sm font-semibold tracking-tight">Latest Downloads</h2>
        </header>
        <div className="px-4 py-10 text-center">
          <Download className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">Failed to load downloads.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Latest Downloads</h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/10 px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            {sortedDownloads.length}
          </span>
        </div>
        {downloadsFetching && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </header>

      {downloadsLoading ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Loading downloads…
        </div>
      ) : visibleDownloads.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Download className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            No downloads yet for this series.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {visibleDownloads.map((download, index) => (
            <DownloadItem
              key={`${download.id ?? download.title}-${download.chapter ?? ''}-${download.provider}-${download.scheduledDateUTC}-${index}`}
              download={download}
            />
          ))}
        </div>
      )}

      {sortedDownloads.length > 0 && (
        <footer className="flex items-center justify-between gap-2 border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {activeCount > 0 && (
              <span className="text-primary">{activeCount} active</span>
            )}
            {activeCount > 0 && (queuedCount > 0 || failedCount > 0) && (
              <span className="mx-1.5">·</span>
            )}
            {queuedCount > 0 && (
              <span className="text-amber-500">{queuedCount} queued</span>
            )}
            {queuedCount > 0 && failedCount > 0 && (
              <span className="mx-1.5">·</span>
            )}
            {failedCount > 0 && (
              <span className="text-destructive">{failedCount} failed</span>
            )}
            {activeCount === 0 && queuedCount === 0 && failedCount === 0 && (
              <span>All caught up</span>
            )}
          </span>
          <Link
            href="/queue"
            className="font-medium text-primary hover:underline"
          >
            View full queue →
          </Link>
        </footer>
      )}
    </section>
  );
});

DownloadsPanel.displayName = 'DownloadsPanel';
