'use client';

import React, { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';
import type { ListChildComponentProps } from 'react-window';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  type DownloadInfo,
  QueueStatus,
} from '@/lib/api/types';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';
import { COLUMN_WIDTHS, normalizeUtcString } from './queue-list-columns';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ActiveDownloadItem {
  id: string;
  seriesTitle: string;
  chapterTitle: string;
  thumbnailUrl?: string;
  status: 'downloading' | 'completed' | 'error' | 'queued';
  progress: number;
  provider?: string;
  scanlator?: string;
  language?: string;
  chapterNumber?: number;
  pageCount?: number;
  message?: string;
  errorMessage?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function getStatusIcon(status: string, isScheduledForFuture: boolean) {
  if (isScheduledForFuture) {
    return <Calendar className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  }
  switch (status) {
    case 'downloading':
      return <Download className="h-4 w-4 text-blue-500 animate-pulse flex-shrink-0" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />;
    case 'error':
      return <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />;
    case 'waiting':
      return <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
  }
}

function formatHm(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Sub-components — shared cells
// ---------------------------------------------------------------------------

function SourceCell({
  provider,
  scanlator,
  url,
}: {
  provider?: string;
  scanlator?: string;
  url?: string;
}) {
  const label = useMemo(() => {
    if (!provider && !scanlator) return '';
    if (provider && scanlator && provider !== scanlator) {
      return `${provider} · ${scanlator}`;
    }
    return provider || scanlator || '';
  }, [provider, scanlator]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    },
    [url],
  );

  if (!label) {
    return (
      <div
        className="px-2 text-xs text-muted-foreground truncate flex items-center"
        style={{ width: COLUMN_WIDTHS.source, flex: `0 0 ${COLUMN_WIDTHS.source}px` }}
      />
    );
  }

  return (
    <div
      className="px-2 text-xs text-muted-foreground truncate flex items-center"
      style={{ width: COLUMN_WIDTHS.source, flex: `0 0 ${COLUMN_WIDTHS.source}px` }}
      title={label}
    >
      {url ? (
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-1 hover:text-foreground transition-colors max-w-full"
          title="Open chapter source"
        >
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ) : (
        <span className="truncate block">{label}</span>
      )}
    </div>
  );
}

function ThumbnailCell({ src, alt }: { src?: string; alt: string }) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{ width: COLUMN_WIDTHS.thumbnail, flex: `0 0 ${COLUMN_WIDTHS.thumbnail}px` }}
    >
      <Image
        src={formatThumbnailUrl(src)}
        alt={alt}
        width={36}
        height={48}
        className="rounded-sm object-cover h-[48px] w-[36px]"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/kaizoku.net.png';
        }}
      />
    </div>
  );
}

function TitleCell({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex-1 min-w-0 px-2 overflow-hidden">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className="text-sm font-semibold truncate leading-tight"
          title={title}
        >
          {title}
        </span>
        {subtitle && (
          <span
            className="text-xs text-muted-foreground truncate flex-shrink min-w-0"
            title={subtitle}
          >
            · {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

function TimeCell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-2 text-xs text-muted-foreground font-medium flex items-center gap-1 justify-start truncate"
      style={{ width: COLUMN_WIDTHS.time, flex: `0 0 ${COLUMN_WIDTHS.time}px` }}
    >
      {children}
    </div>
  );
}

function RetriesCell({ retries }: { retries: number }) {
  return (
    <div
      className="px-2 text-xs font-medium flex items-center"
      style={{ width: COLUMN_WIDTHS.retries, flex: `0 0 ${COLUMN_WIDTHS.retries}px` }}
    >
      {retries > 0 ? (
        <span className="text-orange-600">Retries: {retries}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active Row
// ---------------------------------------------------------------------------

interface ActiveRowData {
  items: ActiveDownloadItem[];
}

const ActiveRowInner = ({
  index,
  style,
  data,
}: ListChildComponentProps<ActiveRowData>) => {
  const item = data.items[index];
  if (!item) return <div style={style} />;

  const isDownloading = item.status === 'downloading';
  const subtitle = item.chapterTitle;

  return (
    <div
      style={style}
      className="flex items-stretch border-b border-border/40 hover:bg-muted/40 transition-colors group"
    >
      <ThumbnailCell src={item.thumbnailUrl} alt={item.seriesTitle} />

      <div className="flex-1 min-w-0 flex items-center">
        <TitleCell title={item.seriesTitle} subtitle={subtitle} />
        {item.errorMessage && (
          <div className="hidden md:flex items-center gap-1 text-xs text-red-600 truncate px-2 max-w-[40%]" title={item.errorMessage}>
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{item.errorMessage}</span>
          </div>
        )}
      </div>

      <SourceCell
        provider={item.provider}
        scanlator={item.scanlator}
        url={item.url}
      />

      <div
        className="px-2 flex items-center justify-start"
        style={{ width: COLUMN_WIDTHS.time, flex: `0 0 ${COLUMN_WIDTHS.time}px` }}
      >
        {getStatusIcon(item.status, false)}
      </div>

      {/* Combined progress + percentage column (replaces retries) */}
      <div
        className="px-2 flex items-center gap-2"
        style={{
          width: COLUMN_WIDTHS.retries + COLUMN_WIDTHS.actions,
          flex: `0 0 ${COLUMN_WIDTHS.retries + COLUMN_WIDTHS.actions}px`,
        }}
      >
        {isDownloading && item.progress > 0 ? (
          <>
            <Progress value={item.progress} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground font-medium tabular-nums w-8 text-right">
              {item.progress}%
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
};
ActiveRowInner.displayName = 'ActiveRow';
export const ActiveRow = memo(ActiveRowInner);

// ---------------------------------------------------------------------------
// Queue Row (WAITING / COMPLETED)
// ---------------------------------------------------------------------------

export interface QueueRowData {
  items: DownloadInfo[];
  onRemove: (id: string) => void;
  isRemovePending: boolean;
}

const QueueRowInner = ({
  index,
  style,
  data,
}: ListChildComponentProps<QueueRowData>) => {
  const item = data.items[index];

  const isScheduledForFuture = useMemo(() => {
    if (!item) return false;
    const scheduledDate = new Date(normalizeUtcString(item.scheduledDateUTC));
    return !item.downloadDateUTC && scheduledDate > new Date();
  }, [item]);

  const scheduledDate = useMemo(
    () =>
      item && isScheduledForFuture
        ? new Date(normalizeUtcString(item.scheduledDateUTC))
        : null,
    [item, isScheduledForFuture],
  );
  const downloadDate = useMemo(
    () =>
      item?.downloadDateUTC
        ? new Date(normalizeUtcString(item.downloadDateUTC))
        : null,
    [item?.downloadDateUTC],
  );

  const { onRemove } = data;
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (item) onRemove(item.id);
    },
    [item, onRemove],
  );

  if (!item) return <div style={style} />;

  const statusString =
    item.status === QueueStatus.WAITING
      ? 'waiting'
      : item.status === QueueStatus.COMPLETED
        ? 'completed'
        : 'unknown';

  const subtitle =
    item.chapterTitle ||
    (item.chapter !== undefined ? `Chapter ${item.chapter}` : undefined);

  const timeLabel = isScheduledForFuture
    ? formatHm(scheduledDate)
    : statusString === 'completed'
      ? formatHm(downloadDate)
      : '';

  return (
    <div
      style={style}
      className="flex items-stretch border-b border-border/40 hover:bg-muted/40 transition-colors group"
    >
      <ThumbnailCell src={item.thumbnailUrl} alt={item.title} />

      <div className="flex-1 min-w-0 flex items-center">
        <TitleCell title={item.title} subtitle={subtitle} />
      </div>

      <SourceCell
        provider={item.provider}
        scanlator={item.scanlator}
        url={item.url}
      />

      <TimeCell>
        {getStatusIcon(statusString, isScheduledForFuture)}
        {timeLabel && <span>{timeLabel}</span>}
      </TimeCell>

      <RetriesCell retries={item.retries} />

      <div
        className="px-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        style={{ width: COLUMN_WIDTHS.actions, flex: `0 0 ${COLUMN_WIDTHS.actions}px` }}
      >
        <button
          type="button"
          onClick={handleRemove}
          disabled={data.isRemovePending}
          title="Remove from queue"
          className="h-7 w-7 rounded-sm flex items-center justify-center border border-border bg-background/80 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
QueueRowInner.displayName = 'QueueRow';
export const QueueRow = memo(QueueRowInner);

// ---------------------------------------------------------------------------
// Error Row (FAILED)
// ---------------------------------------------------------------------------

export interface ErrorRowData {
  items: DownloadInfo[];
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}

const ErrorRowInner = ({
  index,
  style,
  data,
}: ListChildComponentProps<ErrorRowData>) => {
  const item = data.items[index];

  const downloadDate = useMemo(
    () =>
      item?.downloadDateUTC
        ? new Date(normalizeUtcString(item.downloadDateUTC))
        : null,
    [item?.downloadDateUTC],
  );

  const { onRetry, onDelete } = data;
  const handleRetry = useCallback(() => {
    if (item) onRetry(item.id);
  }, [item, onRetry]);

  const handleDelete = useCallback(() => {
    if (item) onDelete(item.id);
  }, [item, onDelete]);

  if (!item) return <div style={style} />;

  const subtitle =
    item.chapterTitle ||
    (item.chapter !== undefined ? `Chapter ${item.chapter}` : undefined);

  return (
    <div
      style={style}
      className="flex items-stretch border-b border-border/40 hover:bg-muted/40 transition-colors group"
    >
      <ThumbnailCell src={item.thumbnailUrl} alt={item.title} />

      <div className="flex-1 min-w-0 flex items-center">
        <TitleCell title={item.title} subtitle={subtitle} />
      </div>

      <SourceCell
        provider={item.provider}
        scanlator={item.scanlator}
        url={item.url}
      />

      <TimeCell>
        <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
        {downloadDate && <span>{formatHm(downloadDate)}</span>}
      </TimeCell>

      <RetriesCell retries={item.retries} />

      <div
        className="px-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        style={{ width: COLUMN_WIDTHS.actions, flex: `0 0 ${COLUMN_WIDTHS.actions}px` }}
      >
        <button
          type="button"
          onClick={handleRetry}
          disabled={data.isPending}
          title="Retry download"
          className="h-7 w-7 rounded-sm flex items-center justify-center border border-border bg-background/80 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:border-blue-700 transition-colors disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={data.isPending}
          title="Delete download"
          className="h-7 w-7 rounded-sm flex items-center justify-center border border-border bg-background/80 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
ErrorRowInner.displayName = 'ErrorRow';
export const ErrorRow = memo(ErrorRowInner);
