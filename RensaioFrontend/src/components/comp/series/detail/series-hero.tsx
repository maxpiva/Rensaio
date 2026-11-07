"use client";

import { useState } from "react";
import { Pause, Play, CheckCircle2, Check, Trash2, FolderOpen, Copy, RefreshCw, FolderSync, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeriesStatus, type SeriesExtendedInfo } from "@/lib/api/types";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { getStatusTone } from "./status-tone";

// Tiny relative-time helper — no external dependency
function formatRelative(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const normalized = dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)
    ? dateString
    : dateString + 'Z';
  const diff = Date.now() - new Date(normalized).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function getStatusLabel(status: SeriesStatus): string {
  switch (status) {
    case SeriesStatus.ONGOING: return 'Ongoing';
    case SeriesStatus.COMPLETED: return 'Completed';
    case SeriesStatus.LICENSED: return 'Licensed';
    case SeriesStatus.PUBLISHING_FINISHED: return 'Finished';
    case SeriesStatus.CANCELLED: return 'Cancelled';
    case SeriesStatus.ON_HIATUS: return 'On Hiatus';
    case SeriesStatus.DISABLED: return 'Disabled';
    default: return 'Unknown';
  }
}

export interface SeriesHeroProps {
  series: SeriesExtendedInfo;
  displayTitle: string;
  displayThumbnail: string;
  effectiveStatus: SeriesStatus;
  pausedDownloads: boolean;
  canEditSeries: boolean;
  canDeleteSeries: boolean;
  canManageDownloads: boolean;
  verifyPending: boolean;
  refreshPending: boolean;
  renamePending: boolean;
  onPauseToggle: () => void;
  onVerify: () => void;
  onRefresh: () => void;
  onRename: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function SeriesHero({
  series,
  displayTitle,
  displayThumbnail,
  effectiveStatus,
  pausedDownloads,
  canEditSeries,
  canDeleteSeries,
  canManageDownloads,
  verifyPending,
  refreshPending,
  renamePending,
  onPauseToggle,
  onVerify,
  onRefresh,
  onRename,
  onEdit,
  onDelete,
}: SeriesHeroProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const tone = getStatusTone(effectiveStatus);
  const statusLabel = getStatusLabel(effectiveStatus);

  // Toolbar button: labelled tile on phone (icon over a short caption, 44px+
  // tall), regular outlined button from `sm` up.
  const tool =
    "h-auto min-h-[52px] flex-col gap-1 px-1 py-1.5 text-[10.5px] font-semibold leading-tight sm:min-h-0 sm:h-9 sm:flex-row sm:gap-[7px] sm:px-3.5 sm:py-0 sm:text-[13px]";

  return (
    <section className="relative isolate border-b-[3px] border-double border-rule-3">
      <div className="relative mx-auto max-w-6xl px-4 pb-7 pt-5 sm:px-8 sm:pb-9 sm:pt-8">
        <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-4 gap-y-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-x-9 lg:grid-cols-[224px_minmax(0,1fr)]">

          {/* Cover */}
          <div className="relative self-start sm:row-span-2 motion-safe:animate-paper-rise">
            <img
              src={formatThumbnailUrl(displayThumbnail)}
              alt={displayTitle}
              loading="eager"
              style={{ aspectRatio: '2/3' }}
              className="relative z-[1] w-full rounded-[3px] bg-paper-2 object-cover shadow-print ring-1 ring-ink/10"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== window.location.origin + '/rensaio.png') {
                  target.src = '/rensaio.png';
                }
              }}
            />
          </div>

          {/* Title block */}
          <div className="min-w-0 self-end sm:self-start motion-safe:animate-paper-rise [animation-delay:40ms]">
            {/* Status pill + Type chip */}
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5 sm:mb-3.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${tone.chip}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${tone.fill} ${effectiveStatus === SeriesStatus.ONGOING ? 'motion-safe:animate-pulse' : ''}`}
                />
                {statusLabel}
              </span>
              {series.type && (
                <span className="inline-flex items-center rounded-[3px] border border-rule-2 bg-paper-1 px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-2">
                  {series.type}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="line-clamp-4 font-serif text-[28px] font-normal leading-[1.02] tracking-[-0.025em] text-ink text-balance sm:line-clamp-3 sm:text-[44px] lg:text-[52px]">
              {displayTitle}
            </h1>

            {/* Author / Artist row */}
            {(series.author || series.artist) && (
              <p className="mt-2 text-[13px] text-ink-2 sm:mt-3 sm:text-sm">
                by <span className="font-semibold text-ink">{series.author}</span>
                {series.artist && series.artist !== series.author && (
                  <> <span className="text-ink-3">·</span> illust. <span className="font-semibold text-ink">{series.artist}</span></>
                )}
              </p>
            )}
          </div>

          {/* Body */}
          <div className="col-span-2 min-w-0 space-y-4 sm:col-span-1 sm:col-start-2 motion-safe:animate-paper-rise [animation-delay:80ms]">

            {/* Inline meta row */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11.5px] tabular-nums text-ink-3 sm:text-xs">
              <span>Ch. {series.chapterList || '—'}</span>
              <span aria-hidden="true" className="text-rule-2">·</span>
              <span>{series.chapterCount} chapter{series.chapterCount === 1 ? '' : 's'}</span>
              {series.lastChangeUTC && (
                <>
                  <span aria-hidden="true" className="text-rule-2">·</span>
                  <span>Updated {formatRelative(series.lastChangeUTC)}</span>
                </>
              )}
            </div>

            {/* Genre pills */}
            {series.genre && series.genre.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {series.genre.map(g => (
                  <span
                    key={g}
                    className="inline-flex items-center rounded-full border border-rule-2 bg-paper-1 px-2.5 py-0.5 text-[12px] text-ink-2"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Description with Read more */}
            {series.description && (
              <div className="max-w-[68ch]">
                <p
                  className={`whitespace-pre-line text-[14px] leading-[1.65] text-ink-2 sm:text-[14.5px] ${expanded ? '' : 'line-clamp-3'}`}
                >
                  {series.description}
                </p>
                {series.description.length > 240 && (
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="mt-1 inline-flex min-h-9 items-center rounded-sm text-[13px] font-semibold text-accent-ink underline-offset-4 outline-none hover:underline focus-visible:underline sm:min-h-0"
                  >
                    {expanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}

            {/* Resume callout — when downloads are paused, the resume action
                gets its own separated, beacon-pulsing area so the user's eye
                lands here first and they're nudged to take action. */}
            {canManageDownloads && pausedDownloads && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-warn/40 bg-warn-soft px-3.5 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-warn">
                  <Pause className="h-4 w-4 shrink-0 fill-current" />
                  Downloads are paused for this series.
                </span>
                <Button
                  onClick={onPauseToggle}
                  className="resume-beacon ml-auto border-warn bg-warn text-paper shadow-none hover:bg-warn hover:brightness-110 focus-visible:ring-warn/40 max-sm:w-full"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Resume Downloads
                </Button>
              </div>
            )}

            {/* Action toolbar */}
            <div className="grid auto-cols-fr grid-flow-col gap-1.5 pt-1 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
              {canManageDownloads && !pausedDownloads && (
                <Button variant="default" onClick={onPauseToggle} className={tool} aria-label="Pause Downloads">
                  <Pause className="h-4 w-4" />
                  <span className="sm:hidden">Pause</span>
                  <span className="hidden sm:inline">Pause Downloads</span>
                </Button>
              )}

              {canEditSeries && (
                <Button variant="outline" onClick={onVerify} disabled={verifyPending} className={tool}>
                  {verifyPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>Verify</span>
                </Button>
              )}

              {canEditSeries && (
                <Button
                  variant="outline"
                  onClick={onRefresh}
                  disabled={refreshPending}
                  title="Refresh metadata & check for new chapters"
                  className={tool}
                >
                  <RefreshCw className={`h-4 w-4 ${refreshPending ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </Button>
              )}

              {canEditSeries && (
                <Button
                  variant="outline"
                  onClick={onRename}
                  disabled={renamePending}
                  title="Rename the series folder & all .cbz files to the correct naming scheme"
                  className={tool}
                >
                  <FolderSync className={`h-4 w-4 ${renamePending ? 'animate-spin' : ''}`} />
                  <span>Rename</span>
                </Button>
              )}

              {canEditSeries && (
                <Button
                  variant="outline"
                  onClick={onEdit}
                  title="Edit series title, type, or storage path"
                  className={tool}
                >
                  <Pencil className="h-4 w-4" />
                  <span>Edit</span>
                </Button>
              )}

              {canDeleteSeries && (
                <Button variant="danger" onClick={onDelete} className={tool}>
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </Button>
              )}
            </div>

            {/* Storage path */}
            {series.path && (
              <div className="inline-flex max-w-full items-center gap-2 rounded-[4px] border border-dashed border-rule-2 bg-paper-1/60 py-1 pl-2.5 pr-1 font-mono text-[11.5px] text-ink-3">
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate" title={series.path}>{series.path}</span>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(series.path!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink active:bg-paper-3 focus-visible:ring-[3px] focus-visible:ring-accent-soft max-sm:-my-2.5 max-sm:h-11 max-sm:w-11"
                  aria-label="Copy storage path"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </section>
  );
}
