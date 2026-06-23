"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { type SeriesHealth } from '@/lib/api/types';
import { AlertBadge } from '@/components/comp/status/alert-badge';
import { Input } from '@/components/ui/input';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';
import { seriesService } from '@/lib/api/services/seriesService';

interface SeriesStatusPanelProps {
  series: SeriesHealth[];
  onClearAlert: (targetType: number, targetId: string) => void;
  canAdmin: boolean;
}

/** Small translucent meta pill (provider tags, days-without-release). */
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

export function SeriesStatusPanel({ series, onClearAlert, canAdmin }: SeriesStatusPanelProps) {
  const router = useRouter();
  // Track local cadence input values per series id
  const [cadenceInputs, setCadenceInputs] = useState<Record<string, string>>({});
  // Track saving state per series id
  const [savingCadence, setSavingCadence] = useState<Record<string, boolean>>({});

  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] py-12 text-muted-foreground">
        <CheckCircle2 className="mb-4 h-12 w-12 text-green-500" />
        <p className="text-lg font-medium text-foreground">All series are healthy</p>
        <p className="text-sm">No series alerts at this time</p>
      </div>
    );
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

  const levelAccent = (level: number) =>
    level === 2
      ? "border-red-500/25 hover:border-red-500/40"
      : "border-amber-500/25 hover:border-amber-500/40";

  return (
    <div className="space-y-2">
      {sorted.map((s) => {
        const input = cadenceInputs[s.id] ?? '';
        const parsed = parseInt(input, 10);
        const hasValidInput = input !== '' && !isNaN(parsed) && parsed > 0;
        const isSaving = savingCadence[s.id] ?? false;

        return (
        <div
          key={s.id}
          className={`rounded-xl border bg-white/[0.02] px-4 py-3 transition-colors ${levelAccent(s.level)}`}
        >
          <div className="flex items-center gap-3">
            {/* Thumbnail on the left */}
            <div className="relative flex-shrink-0">
              <Image
                src={formatThumbnailUrl(s.thumbnailUrl)}
                alt={s.title}
                width={48}
                height={64}
                className="rounded-md object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/rensaio.png';
                }}
              />
            </div>

            {/* Content area */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {/* Status icon in front of title */}
                <AlertBadge level={s.level} />
                {/* Title with link icon at the end */}
                <span
                  className="flex items-center gap-1 truncate text-sm font-medium transition-colors cursor-pointer hover:text-primary"
                  onClick={() => handleSeriesClick(s.id)}
                  title={`View ${s.title} details`}
                >
                  {s.title}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground hover:text-primary" />
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.message}</p>
              {s.providers.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.providers.map((p) => (
                    <MetaPill key={p.providerId}>
                      {p.providerName} ({p.language})
                    </MetaPill>
                  ))}
                </div>
              )}
            </div>

            {/* Actions on the right — cadence edit (admin) + dismiss */}
            <div className="flex shrink-0 flex-col items-end gap-2">
              {/* Cadence edit: label + input + save (admin only) */}
              {canAdmin && (
                <div className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">Cadence:</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder={s.releaseCadenceDays?.toString() ?? 'auto'}
                    value={cadenceInputs[s.id] ?? ''}
                    onChange={(e) => setCadenceInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveCadence(s.id);
                    }}
                    className="h-7 w-16 text-right font-mono text-xs"
                  />
                  <button
                    type="button"
                    disabled={!hasValidInput || isSaving}
                    onClick={() => void handleSaveCadence(s.id)}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSaving ? '…' : 'Save'}
                  </button>
                </div>
              )}
              {/* Days badge + dismiss */}
              <div className="flex items-center gap-2">
                {s.daysWithoutRelease != null && <MetaPill>{s.daysWithoutRelease}d</MetaPill>}
                {canAdmin && <DismissButton onClick={() => onClearAlert(0, s.id)} />}
              </div>
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}
