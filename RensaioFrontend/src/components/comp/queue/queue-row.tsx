'use client';

import React, { memo, useCallback } from 'react';
import Image from 'next/image';
import {
  ArrowUpRight,
  Trash2,
  RotateCcw,
  X,
  MoreHorizontal,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowDownToLine,
} from 'lucide-react';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RowStatus = 'downloading' | 'queued' | 'completed' | 'failed';

export interface QueueRowItem {
  id: string;
  status: RowStatus;
  seriesTitle: string;
  chapterLabel: string;
  thumbnailUrl?: string;
  provider?: string;
  scanlator?: string;
  url?: string;
  sortTime: number;
  displayTime: string;
  hasRetry: boolean;
  /** Number of times this entry has been retried. Only rendered when > 0. */
  retries?: number;
  /** 0-100, only meaningful for status === 'downloading' */
  progress?: number;
}

export interface QueueRowCallbacks {
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onCancel?: (id: string) => void;
  onOpen?: (url: string) => void;
}

// ---------------------------------------------------------------------------
// Status tag — always icon + label, never colour alone
// ---------------------------------------------------------------------------

const STATUS_META: Record<
  RowStatus,
  { label: string; Icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  completed: { label: 'Completed', Icon: CheckCircle2, cls: 'bg-ok-soft text-ok' },
  failed: { label: 'Failed', Icon: AlertTriangle, cls: 'bg-bad-soft text-bad' },
  downloading: { label: 'Downloading', Icon: ArrowDownToLine, cls: 'bg-info-soft text-info' },
  queued: { label: 'Queued', Icon: Clock, cls: 'bg-warn-soft text-warn' },
};

export const StatusTag = memo(function StatusTag({
  status,
  className,
}: {
  status: RowStatus;
  className?: string;
}) {
  const { label, Icon, cls } = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 text-[11.5px] font-semibold leading-none',
        cls,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Cover thumbnail (portrait, like a printed spine)
// ---------------------------------------------------------------------------

export const QueueCover = memo(function QueueCover({
  src,
  alt,
  width = 30,
  height = 42,
  className,
}: {
  src?: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex-none overflow-hidden rounded-[3px] bg-paper-3 shadow-[0_1px_0_hsl(0_0%_0%/.06)]',
        className,
      )}
      style={{ width, height }}
    >
      <Image
        src={formatThumbnailUrl(src)}
        alt={alt}
        width={width * 2}
        height={height * 2}
        className="h-full w-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/rensaio.png';
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[3px] shadow-[inset_0_0_0_1px_var(--rule)]"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Row actions menu — Radix dropdown, anchored to its own trigger
// ---------------------------------------------------------------------------

interface RowMenuProps {
  item: QueueRowItem;
  callbacks: QueueRowCallbacks;
}

const RowMenu = memo(function RowMenu({ item, callbacks }: RowMenuProps) {
  const label = [item.seriesTitle, item.chapterLabel].filter(Boolean).join(' ');

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Actions for ${label}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 outline-none transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-hover data-[state=open]:text-ink max-sm:h-11 max-sm:w-11"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="min-w-[188px]">
        {item.status === 'queued' ? (
          <DropdownMenuItem onSelect={() => callbacks.onCancel?.(item.id)}>
            <X className="h-4 w-4" aria-hidden="true" />
            Cancel
          </DropdownMenuItem>
        ) : (
          <>
            {item.url && (
              <DropdownMenuItem onSelect={() => item.url && callbacks.onOpen?.(item.url)}>
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                Open source
              </DropdownMenuItem>
            )}
            {item.status === 'failed' && (
              <DropdownMenuItem onSelect={() => callbacks.onRetry?.(item.id)}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry download
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => callbacks.onRemove?.(item.id)}
              className="text-bad focus:bg-bad-soft focus:text-bad"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove from history
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

// ---------------------------------------------------------------------------
// QueueRow — one line of the history ledger
// ---------------------------------------------------------------------------

interface QueueRowProps {
  item: QueueRowItem;
  callbacks: QueueRowCallbacks;
}

const QueueRowInner = function QueueRow({ item, callbacks }: QueueRowProps) {
  // Downloading rows are read-only (SignalR only) — no actions shown.
  const showActions = item.status !== 'downloading';
  const isDownloading = item.status === 'downloading';
  const hasProgress =
    isDownloading && typeof item.progress === 'number' && item.progress > 0;
  const progressPct = hasProgress ? Math.max(0, Math.min(100, item.progress!)) : 0;

  const handleRetryInline = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onRetry?.(item.id);
    },
    [item.id, callbacks],
  );

  // Skip the scanlator when it just repeats the provider ("Asura Scans · Asura Scans").
  const providerScanlator = [
    item.provider,
    item.scanlator && item.scanlator !== item.provider ? item.scanlator : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  // Downloading rows show "42%". Rows with no real time only carry their
  // status word ("queued"), which the status tag already shows, so leave it out.
  const rightLabel = hasProgress
    ? `${Math.round(progressPct)}%`
    : item.displayTime === item.status
      ? ''
      : item.displayTime;

  return (
    <li
      className={cn(
        'group relative grid items-center gap-x-3 border-t border-rule px-3 py-2.5 transition-colors duration-150 first:border-t-0 hover:bg-hover/60 sm:px-4',
        'grid-cols-[30px_minmax(0,1fr)_auto]',
        'md:grid-cols-[104px_30px_minmax(0,1fr)_auto_32px] md:gap-x-4',
      )}
    >
      {/* Status tag — its own column on desktop */}
      <div className="hidden md:block">
        <StatusTag status={item.status} />
      </div>

      <div>
        <QueueCover src={item.thumbnailUrl} alt="" />
      </div>

      {/* Title + meta */}
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-x-2">
          <span className="min-w-0 truncate text-[14px] font-semibold leading-snug text-ink" title={item.seriesTitle}>
            {item.seriesTitle}
          </span>
          {item.chapterLabel && (
            <span className="hidden flex-none whitespace-nowrap font-mono text-[12px] font-medium text-ink-3 md:inline">
              {item.chapterLabel}
            </span>
          )}
        </div>
        {/* Phone: chapter + time on their own line so the title keeps the width */}
        <div className="mt-0.5 flex min-w-0 items-center gap-x-1.5 font-mono text-[11.5px] tabular-nums text-ink-3 md:hidden">
          {item.chapterLabel && <span className="min-w-0 truncate font-medium text-ink-2">{item.chapterLabel}</span>}
          {item.chapterLabel && rightLabel && <span aria-hidden="true">·</span>}
          {rightLabel && (
            <span className={cn('flex-none whitespace-nowrap', isDownloading && 'text-info')}>{rightLabel}</span>
          )}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
          <StatusTag status={item.status} className="md:hidden" />
          {providerScanlator && <span className="min-w-0 truncate">{providerScanlator}</span>}
          {typeof item.retries === 'number' && item.retries > 0 && (
            <span
              className="inline-flex flex-none items-center gap-1 font-mono tabular-nums"
              title={`Retried ${item.retries} time${item.retries === 1 ? '' : 's'}`}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {item.retries}×
              <span className="sr-only"> retries</span>
            </span>
          )}
          {item.hasRetry && (
            <button
              type="button"
              onClick={handleRetryInline}
              className="flex-none rounded-[3px] font-semibold text-accent-ink underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-2 max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center max-sm:px-1.5"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Desktop: time / percentage column */}
      <span
        className={cn(
          'hidden whitespace-nowrap text-right font-mono text-[11.5px] tabular-nums md:block',
          isDownloading ? 'text-info' : 'text-ink-3',
        )}
      >
        {rightLabel}
      </span>

      {/* Row menu */}
      <div className="flex w-8 justify-end max-sm:w-11">
        {showActions && <RowMenu item={item} callbacks={callbacks} />}
      </div>

      {/* Hairline progress bar across the very bottom of downloading rows */}
      {isDownloading && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden" aria-hidden="true">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </li>
  );
};
QueueRowInner.displayName = 'QueueRow';
export const QueueRow = memo(QueueRowInner);
