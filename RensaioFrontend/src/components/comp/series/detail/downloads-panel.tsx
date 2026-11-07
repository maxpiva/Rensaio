import { memo, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { SectionHeading } from "@/components/comp/layout/page-header";
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
          void queryClient.invalidateQueries({
            queryKey: ['series', 'detail', seriesId],
          });

          // Also refresh sources/providers to get updated chapter counts and metadata
          void queryClient.invalidateQueries({
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
      <section>
        <SectionHeading title="Latest Downloads" />
        <div role="alert" className="flex items-center justify-center gap-2 rounded-lg border border-bad/30 bg-bad-soft px-4 py-8 text-center text-sm font-medium text-bad">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load downloads.
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeading
        title="Latest Downloads"
        count={sortedDownloads.length}
        actions={
          downloadsFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" aria-label="Refreshing downloads" />
          ) : undefined
        }
      />

      <div className="overflow-hidden rounded-lg border border-rule-2 bg-paper-1 shadow-paper">
      {downloadsLoading ? (
        <div role="status" className="flex items-center justify-center gap-2 px-4 py-10 text-center text-sm text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading downloads…
        </div>
      ) : visibleDownloads.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Download className="mx-auto mb-2 h-5 w-5 text-ink-3" strokeWidth={1.5} />
          <p className="font-serif text-[16px] italic text-ink-2">
            No downloads yet for this series.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-rule">
          {visibleDownloads.map((download, index) => (
            <DownloadItem
              key={`${download.id ?? download.title}-${download.chapter ?? ''}-${download.provider}-${download.scheduledDateUTC}-${index}`}
              download={download}
            />
          ))}
        </div>
      )}

      {sortedDownloads.length > 0 && (
        <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-rule bg-paper px-3.5 py-2 font-mono text-[11px] text-ink-3 sm:px-4">
          <span className="tabular-nums">
            {activeCount > 0 && (
              <span className="font-semibold text-info">{activeCount} active</span>
            )}
            {activeCount > 0 && (queuedCount > 0 || failedCount > 0) && (
              <span className="mx-1.5">·</span>
            )}
            {queuedCount > 0 && (
              <span className="font-semibold text-warn">{queuedCount} queued</span>
            )}
            {queuedCount > 0 && failedCount > 0 && (
              <span className="mx-1.5">·</span>
            )}
            {failedCount > 0 && (
              <span className="font-semibold text-bad">{failedCount} failed</span>
            )}
            {activeCount === 0 && queuedCount === 0 && failedCount === 0 && (
              <span>All caught up</span>
            )}
          </span>
          <Link
            href="/queue"
            className="inline-flex min-h-9 items-center rounded-sm font-sans text-[12.5px] font-semibold text-accent-ink underline-offset-4 outline-none hover:underline focus-visible:underline max-sm:min-h-11"
          >
            View full queue →
          </Link>
        </footer>
      )}
      </div>
    </section>
  );
});

DownloadsPanel.displayName = 'DownloadsPanel';
