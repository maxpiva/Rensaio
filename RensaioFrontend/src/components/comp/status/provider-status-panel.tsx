"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronRight, ArrowUpRight, Database, User } from 'lucide-react';
import { type ProviderHealth, type SeriesHealth } from '@/lib/api/types';
import { AlertBadge, AlertBadgeWithLabel } from '@/components/comp/status/alert-badge';
import { StatusNotice } from '@/components/comp/status/status-notice';
import { DaysPill, LevelStripe } from '@/components/comp/status/series-status-panel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';
import { cn } from '@/lib/utils';

interface ProviderStatusPanelProps {
  providers: ProviderHealth[];
  onClearAlert: (targetType: number, targetId: string) => void;
  canAdmin: boolean;
}

/** Small meta pill (counts, "User Provider"). */
function MetaPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] flex-none items-center gap-1 whitespace-nowrap rounded-[4px] border border-rule bg-paper-2 px-1.5 text-[11px] font-semibold text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  );
}

function SeriesRow({ series, onClearAlert, canAdmin }: { series: SeriesHealth; onClearAlert: (targetType: number, targetId: string) => void; canAdmin: boolean }) {
  const router = useRouter();

  const handleSeriesClick = (seriesId: string) => {
    router.push(`/library/series?id=${seriesId}`);
  };

  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-hover/60">
      <div className="relative h-12 w-9 flex-none overflow-hidden rounded-[3px] bg-paper-3">
        <Image
          src={formatThumbnailUrl(series.thumbnailUrl)}
          alt=""
          width={72}
          height={96}
          className="h-full w-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/rensaio.png';
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <AlertBadge level={series.level} />
          <button
            type="button"
            className="group/title inline-flex min-w-0 items-center gap-1 rounded-[3px] text-left text-[13.5px] font-semibold text-ink outline-none transition-colors hover:text-accent-ink focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => handleSeriesClick(series.id)}
            title={`View ${series.title} details`}
          >
            <span className="min-w-0 truncate">{series.title}</span>
            <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-3 group-hover/title:text-accent-ink" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-3">{series.message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {series.daysWithoutRelease != null && <DaysPill days={series.daysWithoutRelease} />}
        {canAdmin && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onClearAlert(0, series.id)}
            className="text-ink-3 max-sm:min-h-11 max-sm:px-2.5"
          >
            Dismiss
          </Button>
        )}
      </div>
    </li>
  );
}

function ProviderCard({ provider, onClearAlert, canAdmin }: { provider: ProviderHealth; onClearAlert: (targetType: number, targetId: string) => void; canAdmin: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasSeries = provider.affectedSeries.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <li className="relative border-t border-rule first:border-t-0">
        <LevelStripe level={provider.level} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-y-2.5 py-3.5 pl-4 pr-3 sm:pr-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-4">
          <CollapsibleTrigger asChild disabled={!hasSeries}>
            <button
              type="button"
              className="flex min-w-0 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-pointer disabled:cursor-default"
            >
              <ChevronRight
                className={cn(
                  'mt-2.5 h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200',
                  isOpen && 'rotate-90',
                  !hasSeries && 'opacity-0',
                )}
                aria-hidden="true"
              />
              <span className="grid h-9 w-9 flex-none place-items-center rounded-md border border-rule bg-paper-2 text-ink-3">
                <Database className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 truncate text-[14.5px] font-semibold text-ink">{provider.providerName}</span>
                  <AlertBadgeWithLabel level={provider.level} />
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11.5px] text-ink-3">
                  {provider.language}{provider.scanlator ? ` · ${provider.scanlator}` : ""}
                  {provider.consecutiveErrors > 0 && ` · ${provider.consecutiveErrors} errors`}
                </span>
                <span className="mt-1.5 block text-[12.5px] leading-snug text-ink-2">{provider.message}</span>
              </span>
            </button>
          </CollapsibleTrigger>

          <div className="flex flex-wrap items-center gap-1.5 pl-[60px] md:justify-end md:pl-0">
            {!provider.isMihonInstalled && (
              <MetaPill>
                <User className="h-3 w-3 text-ink-3" aria-hidden="true" />
                User Provider
              </MetaPill>
            )}
            {hasSeries && <MetaPill>{provider.affectedSeries.length} series</MetaPill>}
            {canAdmin && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onClearAlert(1, provider.providerId)}
                className="ml-auto text-ink-3 max-sm:min-h-11 max-sm:px-3 md:ml-0"
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
        {hasSeries && (
          <CollapsibleContent>
            <ul className="mx-3 mb-3 rounded-md border border-rule bg-paper/60 p-1 sm:ml-[60px] sm:mr-4">
              {provider.affectedSeries.map((series) => (
                <SeriesRow key={series.id} series={series} onClearAlert={onClearAlert} canAdmin={canAdmin} />
              ))}
            </ul>
          </CollapsibleContent>
        )}
      </li>
    </Collapsible>
  );
}

export function ProviderStatusPanel({ providers, onClearAlert, canAdmin }: ProviderStatusPanelProps) {
  if (providers.length === 0) {
    return <StatusNotice title="All sources are healthy" body="No source alerts at this time" />;
  }

  // Sort: Red first, then Yellow
  const sorted = [...providers].sort((a, b) => a.level - b.level);

  return (
    <ul className="overflow-hidden rounded-lg border border-rule bg-paper-1 shadow-paper">
      {sorted.map((provider) => (
        <ProviderCard key={provider.providerId} provider={provider} onClearAlert={onClearAlert} canAdmin={canAdmin} />
      ))}
    </ul>
  );
}
