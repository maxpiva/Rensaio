'use client';

import React, { memo } from 'react';
import { QueueCover, StatusTag, type QueueRowItem } from '@/components/comp/queue/queue-row';

/**
 * "Now printing" card for an in-flight download (SignalR progress).
 * Read-only, like the downloading row it replaces. The series title wraps
 * instead of truncating so long titles stay legible at every width.
 */
export const ActiveDownloadCard = memo(function ActiveDownloadCard({ item }: { item: QueueRowItem }) {
  const hasProgress = typeof item.progress === 'number' && item.progress > 0;
  const pct = hasProgress ? Math.max(0, Math.min(100, item.progress!)) : 0;
  const providerScanlator = [item.provider, item.scanlator].filter(Boolean).join(' · ');
  const label = [item.seriesTitle, item.chapterLabel].filter(Boolean).join(' ');

  return (
    <li className="flex min-w-0 gap-3.5 rounded-lg border border-rule bg-paper-1 p-3.5 shadow-paper">
      <QueueCover src={item.thumbnailUrl} alt="" width={44} height={62} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="min-w-0 break-words font-serif text-[16.5px] leading-[1.2] tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
          {item.seriesTitle}
        </h3>
        <p className="mt-1 min-w-0 text-[12px] text-ink-3">
          {item.chapterLabel && (
            <span className="font-mono font-medium text-ink-2">{item.chapterLabel}</span>
          )}
          {item.chapterLabel && providerScanlator && <span aria-hidden="true"> · </span>}
          {providerScanlator}
        </p>
        <div className="mt-auto pt-3">
          <div
            role="progressbar"
            aria-label={`Download progress for ${label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={hasProgress ? Math.round(pct) : undefined}
            className="h-[3px] overflow-hidden rounded-full bg-paper-3"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <StatusTag status="downloading" />
            <span className="font-mono text-[11.5px] font-semibold tabular-nums text-ink-2">
              {hasProgress ? `${Math.round(pct)}%` : 'Waiting…'}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
});
