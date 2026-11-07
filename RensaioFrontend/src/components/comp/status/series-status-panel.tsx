"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, CalendarClock, Loader2 } from 'lucide-react';
import { HealthStatusLevel, type SeriesHealth } from '@/lib/api/types';
import { AlertBadgeWithLabel } from '@/components/comp/status/alert-badge';
import { StatusNotice } from '@/components/comp/status/status-notice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';
import { seriesService } from '@/lib/api/services/seriesService';
import { cn } from '@/lib/utils';

interface SeriesStatusPanelProps {
  series: SeriesHealth[];
  onClearAlert: (targetType: number, targetId: string) => void;
  canAdmin: boolean;
}

/** Mono "code" chip for provider tags. */
export function SourceChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] max-w-full items-center truncate rounded-[4px] border border-rule bg-paper-2 px-1.5 font-mono text-[11px] font-medium text-ink-2">
      {children}
    </span>
  );
}

/** Days without a release, spelled out for assistive tech. */
export function DaysPill({ days }: { days: number }) {
  return (
    <span
      className="inline-flex h-[22px] flex-none items-center gap-1 rounded-[4px] border border-rule px-1.5 font-mono text-[11px] font-semibold tabular-nums text-ink-2"
      title={`${days} days without a release`}
    >
      <CalendarClock className="h-3 w-3 text-ink-3" aria-hidden="true" />
      {days}d
      <span className="sr-only"> without a release</span>
    </span>
  );
}

/** Left-edge level stripe: a printer's mark, paired with the label tag. */
export function LevelStripe({ level }: { level: HealthStatusLevel }) {
  return (
    <span
      aria-hidden="true"
      className={cn('absolute inset-y-0 left-0 w-[3px]', level === HealthStatusLevel.Red ? 'bg-bad' : 'bg-warn')}
    />
  );
}

export function SeriesStatusPanel({ series, onClearAlert, canAdmin }: SeriesStatusPanelProps) {
  const router = useRouter();
  // Track local cadence input values per series id
  const [cadenceInputs, setCadenceInputs] = useState<Record<string, string>>({});
  // Track saving state per series id
  const [savingCadence, setSavingCadence] = useState<Record<string, boolean>>({});

  if (series.length === 0) {
    return <StatusNotice title="All series are healthy" body="No series alerts at this time" />;
  }

  // Sort: Red first, then Yellow
  const sorted = [...series].sort((a, b) => a.level - b.level);

  const handleSeriesClick = (seriesId: string) => {
    router.push(`/library/series?id=${seriesId}`);
  };

  const handleSaveCadence = async (seriesId: string) => {
    const input = cadenceInputs[seriesId]?.trim() ?? '';
    const parsed = input ? parseInt(input, 10) : null;

    if (parsed !== null && (isNaN(parsed) || parsed <= 0)) return;

    setSavingCadence(prev => ({ ...prev, [seriesId]: true }));
    try {
      await seriesService.setCadence(seriesId, parsed);
      // Clear the input after successful save
      setCadenceInputs(prev => ({ ...prev, [seriesId]: '' }));
      window.location.reload();
    } catch {
      // Error handled silently
    } finally {
      setSavingCadence(prev => ({ ...prev, [seriesId]: false }));
    }
  };

  return (
    <ul className="overflow-hidden rounded-lg border border-rule bg-paper-1 shadow-paper">
      {sorted.map((s) => {
        const input = cadenceInputs[s.id] ?? '';
        const parsed = parseInt(input, 10);
        const hasValidInput = input !== '' && !isNaN(parsed) && parsed > 0;
        const isSaving = savingCadence[s.id] ?? false;
        const cadenceId = `cadence-${s.id}`;

        return (
          <li
            key={s.id}
            className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3.5 gap-y-3 border-t border-rule py-3.5 pl-4 pr-3 first:border-t-0 sm:pr-4 md:grid-cols-[40px_minmax(0,1fr)_auto]"
          >
            <LevelStripe level={s.level} />

            <div className="relative h-[54px] w-10 overflow-hidden rounded-[3px] bg-paper-3">
              <Image
                src={formatThumbnailUrl(s.thumbnailUrl)}
                alt=""
                width={80}
                height={108}
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/rensaio.png';
                }}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[3px] shadow-[inset_0_0_0_1px_var(--rule)]" />
            </div>

            {/* Content */}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => handleSeriesClick(s.id)}
                  title={`View ${s.title} details`}
                  className="group/title inline-flex min-w-0 max-w-full items-center gap-1 rounded-[3px] text-left text-[14.5px] font-semibold leading-snug text-ink outline-none transition-colors hover:text-accent-ink focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 truncate">{s.title}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-3 group-hover/title:text-accent-ink" aria-hidden="true" />
                </button>
                <AlertBadgeWithLabel level={s.level} />
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{s.message}</p>
              {(s.providers.length > 0 || s.daysWithoutRelease != null) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {s.daysWithoutRelease != null && <DaysPill days={s.daysWithoutRelease} />}
                  {s.providers.map((p) => (
                    <SourceChip key={p.providerId}>
                      {p.providerName} ({p.language})
                    </SourceChip>
                  ))}
                </div>
              )}
            </div>

            {/* Actions — cadence edit (admin) + dismiss */}
            {canAdmin && (
              <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1 md:flex-col md:items-end md:justify-center">
                <div className="flex items-center gap-1.5">
                  <label htmlFor={cadenceId} className="whitespace-nowrap text-[11.5px] font-medium text-ink-3">
                    Cadence:
                  </label>
                  <Input
                    id={cadenceId}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder={s.releaseCadenceDays?.toString() ?? 'auto'}
                    value={cadenceInputs[s.id] ?? ''}
                    onChange={(e) => setCadenceInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveCadence(s.id);
                    }}
                    aria-describedby={`${cadenceId}-unit`}
                    className="h-8 w-[68px] text-right font-mono text-xs max-sm:h-11"
                  />
                  <span id={`${cadenceId}-unit`} className="text-[11.5px] text-ink-3">days</span>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={!hasValidInput || isSaving}
                    onClick={() => void handleSaveCadence(s.id)}
                    className="max-sm:min-h-11 max-sm:px-3"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-label="Saving" /> : 'Save'}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onClearAlert(0, s.id)}
                  className="ml-auto text-ink-3 max-sm:min-h-11 max-sm:px-3 md:ml-0"
                >
                  Dismiss
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
