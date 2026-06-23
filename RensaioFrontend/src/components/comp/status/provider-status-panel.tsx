"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, CheckCircle2, ExternalLink, Database } from 'lucide-react';
import { HealthStatusLevel, type ProviderHealth, type SeriesHealth } from '@/lib/api/types';
import { AlertBadge } from '@/components/comp/status/alert-badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';

interface ProviderStatusPanelProps {
  providers: ProviderHealth[];
  onClearAlert: (targetType: number, targetId: string) => void;
  canAdmin: boolean;
}

/** Accent border/glow for a card based on its health level. */
function levelAccent(level: HealthStatusLevel) {
  return level === HealthStatusLevel.Red
    ? "border-red-500/25 hover:border-red-500/40"
    : "border-amber-500/25 hover:border-amber-500/40";
}

/** Small translucent meta pill (counts, language, "User Provider", days). */
function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** Glass dismiss action — replaces the old shadcn outline Button. */
function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground"
    >
      Dismiss
    </button>
  );
}

function SeriesRow({ series, onClearAlert, canAdmin }: { series: SeriesHealth; onClearAlert: (targetType: number, targetId: string) => void; canAdmin: boolean }) {
  const router = useRouter();

  const handleSeriesClick = (seriesId: string) => {
    router.push(`/library/series?id=${seriesId}`);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.03]">
      <div className="flex min-w-0 items-center gap-3">
        {/* Thumbnail on the left */}
        <div className="relative flex-shrink-0">
          <Image
            src={formatThumbnailUrl(series.thumbnailUrl)}
            alt={series.title}
            width={36}
            height={48}
            className="rounded object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/rensaio.png';
            }}
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AlertBadge level={series.level} />
            <span
              className="flex items-center gap-1 truncate text-sm font-medium transition-colors cursor-pointer hover:text-primary"
              onClick={() => handleSeriesClick(series.id)}
              title={`View ${series.title} details`}
            >
              {series.title}
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground hover:text-primary" />
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{series.message}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {series.daysWithoutRelease != null && <MetaPill>{series.daysWithoutRelease}d</MetaPill>}
        {canAdmin && <DismissButton onClick={() => onClearAlert(0, series.id)} />}
      </div>
    </div>
  );
}

function ProviderCard({ provider, onClearAlert, canAdmin }: { provider: ProviderHealth; onClearAlert: (targetType: number, targetId: string) => void; canAdmin: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`overflow-hidden rounded-xl border bg-white/[0.02] transition-colors ${levelAccent(provider.level)}`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                {/* Source icon as thumbnail */}
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
                  <Database className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertBadge level={provider.level} />
                    <p className="truncate text-sm font-medium">{provider.providerName}</p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {provider.language}{provider.scanlator ? ` · ${provider.scanlator}` : ""}
                    {provider.consecutiveErrors > 0 && ` · ${provider.consecutiveErrors} errors`}
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            <div className="flex shrink-0 items-center gap-2">
              {!provider.isMihonInstalled && <MetaPill>User Provider</MetaPill>}
              {provider.affectedSeries.length > 0 && (
                <MetaPill>{provider.affectedSeries.length} series</MetaPill>
              )}
              {canAdmin && <DismissButton onClick={() => onClearAlert(1, provider.providerId)} />}
            </div>
          </div>
          <p className="ml-9 mt-1 text-xs text-muted-foreground">{provider.message}</p>
        </div>
        {provider.affectedSeries.length > 0 && (
          <CollapsibleContent>
            <div className="border-t border-white/[0.06] px-2 py-2">
              <div className="space-y-1">
                {provider.affectedSeries.map((series) => (
                  <SeriesRow key={series.id} series={series} onClearAlert={onClearAlert} canAdmin={canAdmin} />
                ))}
              </div>
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

export function ProviderStatusPanel({ providers, onClearAlert, canAdmin }: ProviderStatusPanelProps) {
  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] py-12 text-muted-foreground">
        <CheckCircle2 className="mb-4 h-12 w-12 text-green-500" />
        <p className="text-lg font-medium text-foreground">All sources are healthy</p>
        <p className="text-sm">No source alerts at this time</p>
      </div>
    );
  }

  // Sort: Red first, then Yellow
  const sorted = [...providers].sort((a, b) => a.level - b.level);

  return (
    <div className="space-y-3">
      {sorted.map((provider) => (
        <ProviderCard key={provider.providerId} provider={provider} onClearAlert={onClearAlert} canAdmin={canAdmin} />
      ))}
    </div>
  );
}
