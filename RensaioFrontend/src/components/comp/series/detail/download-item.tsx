import { QueueStatus, type DownloadInfo } from "@/lib/api/types";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { getStatusIcon } from "./status-icon";

// Helper function to normalize UTC date strings
const normalizeUtcString = (dateString: string) => {
  return dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)
    ? dateString
    : dateString + 'Z';
};

// Compact relative time formatter ("2h ago", "in 5m", "just now")
const relativeTime = (date: Date): string => {
  const now = Date.now();
  const diffSec = Math.round((date.getTime() - now) / 1000);
  const absSec = Math.abs(diffSec);
  const future = diffSec > 0;

  const units: Array<[number, string]> = [
    [60, 's'],
    [60, 'm'],
    [24, 'h'],
    [7, 'd'],
    [4.345, 'w'],
    [12, 'mo'],
    [Number.POSITIVE_INFINITY, 'y'],
  ];

  let value = absSec;
  let unit = units[0]![1];
  for (let i = 0; i < units.length; i++) {
    const [step, label] = units[i]!;
    if (value < step) {
      unit = label;
      break;
    }
    value = value / step;
    unit = units[i + 1]?.[1] ?? label;
  }

  const rounded = Math.max(1, Math.round(value));
  if (absSec < 30) return 'just now';
  return future ? `in ${rounded}${unit}` : `${rounded}${unit} ago`;
};

// Status disc color/background mapping
function statusDiscClass(status: QueueStatus): string {
  switch (status) {
    case QueueStatus.COMPLETED:
      return 'bg-emerald-500/15 text-emerald-400';
    case QueueStatus.RUNNING:
      return 'bg-primary/15 text-primary';
    case QueueStatus.FAILED:
      return 'bg-destructive/15 text-destructive';
    case QueueStatus.WAITING:
      return 'bg-amber-500/15 text-amber-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

// Download Item Component
export const DownloadItem = ({ download }: { download: DownloadInfo }) => {
  const utcDateString = download.downloadDateUTC ?? download.scheduledDateUTC;
  const displayDate = new Date(normalizeUtcString(utcDateString));
  const now = new Date();

  const isFutureScheduled =
    download.status === QueueStatus.WAITING && displayDate > now;

  const handleOpenSource = () => {
    if (download.url) {
      window.open(download.url, '_blank', 'noopener,noreferrer');
    }
  };

  const chapterLabel =
    download.chapter !== undefined && download.chapter !== null
      ? `Ch. ${download.chapter}`
      : 'Chapter';

  return (
    <div
      role={download.url ? 'button' : undefined}
      tabIndex={download.url ? 0 : -1}
      onClick={download.url ? handleOpenSource : undefined}
      onKeyDown={
        download.url
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenSource();
              }
            }
          : undefined
      }
      title={download.url ? 'Open chapter in source' : undefined}
      className={`group relative flex items-center gap-3 px-3 py-2.5 transition-colors focus-visible:outline-none ${
        download.url
          ? 'cursor-pointer hover:bg-foreground/[0.04] active:bg-foreground/[0.08] focus-visible:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
          : ''
      }`}
    >
      {/* Thumbnail */}
      <div className="relative shrink-0 w-7 h-[42px] rounded overflow-hidden ring-1 ring-white/[0.06] bg-muted">
        {download.thumbnailUrl && (
          <img
            src={formatThumbnailUrl(download.thumbnailUrl)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const target = e.currentTarget;
              target.style.visibility = 'hidden';
            }}
          />
        )}
      </div>

      {/* Two-line text */}
      <div className="flex-1 min-w-0">
        <div className="truncate text-[13px] font-medium text-foreground leading-tight">
          {chapterLabel}
          {download.chapterTitle ? ` · ${download.chapterTitle}` : ''}
        </div>
        <div className="truncate text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <span className="truncate">{download.provider}</span>
          {download.scanlator && download.scanlator !== download.provider && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{download.scanlator}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="tabular-nums whitespace-nowrap">
            {relativeTime(displayDate)}
          </span>
          {download.retries > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="text-amber-500 whitespace-nowrap">
                retry {download.retries}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status disc */}
      <div
        className={`shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full ${statusDiscClass(
          download.status,
        )}`}
      >
        {getStatusIcon(download.status, isFutureScheduled)}
      </div>

      {/* Inline progress bar for RUNNING — pinned to bottom edge of row */}
      {download.status === QueueStatus.RUNNING && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] bg-primary/70 animate-pulse"
        />
      )}
    </div>
  );
};
