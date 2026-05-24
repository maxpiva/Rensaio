'use client';

import React, { memo, useCallback } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Trash2, RotateCcw, X } from 'lucide-react';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';

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
// Status dot
// ---------------------------------------------------------------------------

const DOT_STYLES: Record<RowStatus, { bg: string; shadow: string }> = {
  completed: {
    bg: 'bg-[hsl(142_60%_48%)]',
    shadow: '0 0 0 2px hsla(142,60%,48%,0.10)',
  },
  failed: {
    bg: 'bg-[hsl(0_68%_55%)]',
    shadow: '0 0 0 2px hsla(0,68%,55%,0.10)',
  },
  downloading: {
    bg: 'bg-[hsl(210_85%_58%)]',
    shadow: '0 0 0 2px hsla(210,85%,58%,0.10)',
  },
  queued: {
    bg: 'bg-[hsl(38_88%_55%)]',
    shadow: '0 0 0 2px hsla(38,88%,55%,0.10)',
  },
};

const STATUS_LABELS: Record<RowStatus, string> = {
  completed: 'Completed',
  failed: 'Failed',
  downloading: 'Downloading',
  queued: 'Queued',
};

interface StatusDotProps {
  status: RowStatus;
}

const StatusDot = memo(function StatusDot({ status }: StatusDotProps) {
  const { bg, shadow } = DOT_STYLES[status];
  return (
    <span
      className={`inline-block w-[7px] h-[7px] rounded-full flex-none ${bg}`}
      style={{ boxShadow: shadow }}
      aria-label={STATUS_LABELS[status]}
    />
  );
});

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

interface ThumbnailProps {
  src?: string;
  alt: string;
}

const Thumbnail = memo(function Thumbnail({ src, alt }: ThumbnailProps) {
  return (
    <div className="relative w-9 h-9 rounded-md overflow-hidden flex-none">
      <Image
        src={formatThumbnailUrl(src)}
        alt={alt}
        width={36}
        height={36}
        className="object-cover w-full h-full"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/kaizoku.net.png';
        }}
      />
      {/* subtle inset shadow to show image boundary */}
      <span
        className="absolute inset-0 rounded-md pointer-events-none"
        style={{ boxShadow: 'inset 0 0 0 1px hsla(0 0% 100% / 0.05)' }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Icon button
// ---------------------------------------------------------------------------

interface IconBtnProps {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const IconBtn = memo(function IconBtn({ title, onClick, disabled, children }: IconBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors duration-[120ms] disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Action icons per status
// ---------------------------------------------------------------------------

interface ActionIconsProps {
  item: QueueRowItem;
  callbacks: QueueRowCallbacks;
}

const ActionIcons = memo(function ActionIcons({ item, callbacks }: ActionIconsProps) {
  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      callbacks.onRetry?.(item.id);
    },
    [item.id, callbacks],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      callbacks.onRemove?.(item.id);
    },
    [item.id, callbacks],
  );

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      callbacks.onCancel?.(item.id);
    },
    [item.id, callbacks],
  );

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (item.url) callbacks.onOpen?.(item.url);
    },
    [item.url, callbacks],
  );

  if (item.status === 'queued') {
    return (
      <IconBtn title="Cancel" onClick={handleCancel}>
        <X size={14} />
      </IconBtn>
    );
  }

  // completed or failed
  return (
    <>
      {item.url && (
        <IconBtn title="Open source" onClick={handleOpen}>
          <ArrowUpRight size={14} />
        </IconBtn>
      )}
      {item.status === 'failed' && (
        <IconBtn title="Retry download" onClick={handleRetry}>
          <RotateCcw size={14} />
        </IconBtn>
      )}
      <IconBtn title="Remove from history" onClick={handleRemove}>
        <Trash2 size={14} />
      </IconBtn>
    </>
  );
});

// ---------------------------------------------------------------------------
// QueueRow
// ---------------------------------------------------------------------------

interface QueueRowProps {
  item: QueueRowItem;
  callbacks: QueueRowCallbacks;
}

// Returns true when the row has hover-reveal action icons.
// Downloading rows are read-only (SignalR only) — no actions shown.
function hasHoverActions(status: RowStatus): boolean {
  return status !== 'downloading';
}

const QueueRowInner = function QueueRow({ item, callbacks }: QueueRowProps) {
  const showActions = hasHoverActions(item.status);
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

  const providerScanlator = [item.provider, item.scanlator]
    .filter(Boolean)
    .join(' · ');

  // Downloading rows show "42%" instead of the "downloading" text label
  const rightLabel = hasProgress
    ? `${Math.round(progressPct)}%`
    : item.displayTime;

  return (
    <div
      className="group flex items-center gap-4 px-3 py-3.5 transition-colors duration-[120ms] relative border-t border-white/[0.04] first:border-t-0 hover:bg-white/[0.018]"
    >
      {/* Status dot */}
      <StatusDot status={item.status} />

      {/* Thumbnail */}
      <Thumbnail src={item.thumbnailUrl} alt={item.seriesTitle} />

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[14px] font-semibold truncate leading-snug">
            {item.seriesTitle}
          </span>
          <span className="text-[13px] text-muted-foreground truncate flex-shrink-0">
            {item.chapterLabel}
          </span>
          {typeof item.retries === 'number' && item.retries > 0 && (
            <span
              className="ml-0.5 flex-none text-[12px] text-muted-foreground/70 tabular-nums"
              title={`Retried ${item.retries} time${item.retries === 1 ? '' : 's'}`}
            >
              ×{item.retries}
            </span>
          )}
          {item.hasRetry && (
            <a
              href="#"
              onClick={handleRetryInline}
              className="ml-1 flex-none text-[12px] font-medium text-destructive/80 hover:text-destructive hover:underline underline-offset-2 transition-colors duration-[120ms]"
            >
              Retry
            </a>
          )}
        </div>
        {providerScanlator && (
          <div className="mt-0.5 text-[12px] text-muted-foreground truncate">
            {providerScanlator}
          </div>
        )}
      </div>

      {/* Right-edge slot: time/percentage (default) vs action icons (hover) */}
      <div className="flex items-center gap-1 flex-none relative">
        {/* Time / percentage label — hidden on hover when there are action icons to show */}
        <span
          className={`text-[12px] whitespace-nowrap transition-opacity duration-[120ms] ${
            isDownloading ? 'tabular-nums text-[hsl(210_85%_70%)]' : 'text-muted-foreground'
          }${showActions ? ' group-hover:opacity-0' : ''}`}
        >
          {rightLabel}
        </span>

        {/* Action icons — shown on hover, overlaid on same position */}
        {showActions && (
          <div className="absolute right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-[120ms]">
            <ActionIcons item={item} callbacks={callbacks} />
          </div>
        )}
      </div>

      {/* Thin progress bar across the very bottom of downloading rows */}
      {isDownloading && (
        <div
          className="absolute left-0 right-0 bottom-0 h-[1.5px] overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
          <div
            className="h-full bg-[hsl(210_85%_58%)] transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
};
QueueRowInner.displayName = 'QueueRow';
export const QueueRow = memo(QueueRowInner);
