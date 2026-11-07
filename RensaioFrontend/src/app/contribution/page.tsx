"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { LazyImage } from "@/components/ui/lazy-image";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ExternalLink, Search, Ban, RotateCcw, EyeOff, RefreshCw, Clock, Check, AlertCircle, Layers, ShieldAlert, CloudUpload,
  ChevronLeft, ChevronRight, CircleDashed, Sparkles, UserCheck, type LucideIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getProgressHub } from '@/lib/api/signalr/progressHub';
import { JobType, ProgressStatus } from '@/lib/api/types';
import { useContributionUpload } from '@/lib/api/hooks/useContributionUpload';
import { useToast } from '@/hooks/use-toast';
import {
  useContributionMappings,
  useContributionMappingsScanAll,
  useContributionMappingsScanMapping,
  useContributionMappingsLink,
  useContributionMappingsBlock,
  useContributionMappingsUnblock,
  useContributionMappingsIgnore,
  useContributionMappingsIgnoreAll,
  contributionMappingsQueryKey,
} from "@/lib/api/hooks/useContributionMappings";
import { ScrobblerSearchRequester } from '@/components/comp/scrobbler/scrobbler-search-requester';
import { PageHeader } from '@/components/comp/layout/page-header';
import { ScrobblerProvider, SeriesMappingStatus, type ContributionMappingGroup, type ContributionMappingsPage, type ExternalSeriesProviderMapping } from '@/lib/api/types';
import { useContributionEnabled } from '@/hooks/use-contribution-enabled';
import { cn } from '@/lib/utils';

type MappingScanState = 'scanning' | 'done' | 'failed';
type MappingFilter = 'all' | 'unmatched' | 'blocked';

const FILTER_LABEL: Record<MappingFilter, string> = {
  unmatched: 'Unmatched',
  all: 'All',
  blocked: 'Blocked',
};

const fieldLabel = 'font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3';

/** Text with a fallback; empty strings fall back too (same as `||`). */
function textOr(value: string | null | undefined, fallback: string): string {
  return value?.length ? value : fallback;
}

function ThumbnailPopover({ src, alt, className = 'h-10 w-10 rounded object-cover flex-shrink-0', side = 'right' }: {
  src: string;
  alt?: string;
  className?: string;
  side?: 'right' | 'left' | 'top' | 'bottom';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <LazyImage src={src} alt={alt ?? ''} className={className} loading="eager" />
      </TooltipTrigger>
      <TooltipPrimitive.Portal>
        <TooltipContent side={side} className="p-0 bg-transparent border-none shadow-none">
          <div className="relative w-48 aspect-[3/4]">
            <LazyImage
              src={src}
              alt={alt ?? ''}
              className="h-full w-full rounded-md border border-rule object-cover shadow-lift"
            />
          </div>
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}

const STATUS_TAG: Record<SeriesMappingStatus, { label: string; variant: BadgeProps['variant']; icon: LucideIcon }> = {
  [SeriesMappingStatus.Unmatched]: { label: 'Not matched', variant: 'warn', icon: CircleDashed },
  [SeriesMappingStatus.AutoMatched]: { label: 'Auto', variant: 'info', icon: Sparkles },
  [SeriesMappingStatus.UserConfirmed]: { label: 'User', variant: 'ok', icon: UserCheck },
  [SeriesMappingStatus.TemporaryIgnored]: { label: 'Temp. ignored', variant: 'secondary', icon: Clock },
  [SeriesMappingStatus.ForeverIgnored]: { label: 'Disabled', variant: 'secondary', icon: EyeOff },
  [SeriesMappingStatus.Blocked]: { label: 'Blocked', variant: 'bad', icon: Ban },
};

function statusBadge(status: SeriesMappingStatus) {
  const tag = STATUS_TAG[status];
  if (!tag) return <Badge variant="outline">Unknown</Badge>;
  const Icon = tag.icon;
  return (
    <Badge variant={tag.variant} className="gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {tag.label}
    </Badge>
  );
}

/** Provider name for display; falls back to the raw enum value for unknown providers. */
function providerName(provider: ScrobblerProvider): string {
  return ScrobblerProvider[provider] ?? String(provider);
}

export default function ContributionPage() {
  const contributionEnabled = useContributionEnabled();
  const { toast } = useToast();
  const contributionUpload = useContributionUpload();

  const handleExportToCloud = () => {
    contributionUpload.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: 'Contribution export queued',
          description: 'Your contributions are being uploaded to the cloud in the background.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Contribution export failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      },
    });
  };

  const [filter, setFilter] = useState<MappingFilter>('unmatched');
  const [page, setPage] = useState(0);
  const [statusFilter] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [mappingScanStates, setMappingScanStates] = useState<Record<string, MappingScanState>>({});
  const [searchTarget, setSearchTarget] = useState<{
    mappingId: string;
    mappingTitle: string;
    mappingCoverUrl?: string;
    mappingTitles?: string;
    provider: ScrobblerProvider;
  } | null>(null);
  const pageSize = 50;
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useContributionMappings({ filter, page, pageSize, status: statusFilter });
  const scanAll = useContributionMappingsScanAll();
  const scanMapping = useContributionMappingsScanMapping();
  const linkMapping = useContributionMappingsLink();
  const block = useContributionMappingsBlock();
  const unblock = useContributionMappingsUnblock();
  const ignore = useContributionMappingsIgnore();
  const ignoreAll = useContributionMappingsIgnoreAll();

  // Confirm into the contribution DB via the generic search dialog's onConfirm hook.
  const handleSearchConfirmed = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: contributionMappingsQueryKey });
  }, [queryClient]);

  // Live progress for contribution mapping scans via SignalR.
  //  - id = "contribution-link-all"            → global scan aggregate (header badge next to Scan now).
  //  - id = "contribution-link-{mappingId}"    → single-mapping scan (per-row spinner + done/failed badge).
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const listen = async () => {
      try {
        await getProgressHub().startConnection();
        unsubscribe = getProgressHub().onProgress((p) => {
          if (p.jobType !== JobType.MetadataLink) return;

          if (p.id === 'contribution-link-all') {
            if (p.progressStatus === ProgressStatus.Started || p.progressStatus === ProgressStatus.InProgress) {
              setScanProgress(textOr(p.message, `Linking… ${p.percentage ?? 0}%`));
            } else if (p.progressStatus === ProgressStatus.Completed) {
              setScanProgress(textOr(p.message, 'Scan complete'));
              void queryClient.invalidateQueries({ queryKey: contributionMappingsQueryKey });
              setTimeout(() => setScanProgress(null), 3000);
            } else if (p.progressStatus === ProgressStatus.Failed) {
              setScanProgress(textOr(p.errorMessage, 'Scan failed'));
            }
            return;
          }

          const prefix = 'contribution-link-';
          if (p.id?.startsWith(prefix)) {
            const mappingId = p.id.slice(prefix.length);
            if (p.progressStatus === ProgressStatus.Started || p.progressStatus === ProgressStatus.InProgress) {
              setMappingScanStates((prev) => ({ ...prev, [mappingId]: 'scanning' }));
            } else if (p.progressStatus === ProgressStatus.Completed) {
              setMappingScanStates((prev) => ({ ...prev, [mappingId]: 'done' }));
              void queryClient.invalidateQueries({ queryKey: contributionMappingsQueryKey });
              setTimeout(() => {
                setMappingScanStates((prev) => {
                  const next = { ...prev };
                  delete next[mappingId];
                  return next;
                });
              }, 3000);
            } else if (p.progressStatus === ProgressStatus.Failed) {
              setMappingScanStates((prev) => ({ ...prev, [mappingId]: 'failed' }));
            }
          }
        });
      } catch {
        // SignalR unavailable — the per-row spinner still shows via the mutation's isPending.
      }
    };
    void listen();
    return () => { unsubscribe?.(); };
  }, [queryClient]);

  // Page-level gate: the Contribution page is only usable once the Contributor
  // Id has been verified against RensaioContributionDB.CF. Until then, show a
  // notice instead of any mapping/export UI.
  if (!contributionEnabled) {
    return (
      <div className="space-y-6 pb-6 md:space-y-8">
        <PageHeader
          folio="07"
          eyebrow="Manage · Community"
          title={<em>Contribution</em>}
          description="Manage sources and their metadata links in the contribution database."
          tate="寄稿"
        />
        <section
          aria-labelledby="contribution-locked"
          className="mx-auto flex max-w-xl flex-col items-center rounded-lg border border-dashed border-rule-2 bg-paper-1 px-6 py-12 text-center"
        >
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-warn/30 bg-warn-soft text-warn" aria-hidden="true">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h2 id="contribution-locked" className="font-serif text-2xl text-ink">
            Contribution is locked
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">
            This page requires a verified Contributor Id. Enable Contribution in
            Settings, enter your Contributor UUID, and verify it against the
            contribution database to unlock contribution uploads and mapping.
          </p>
        </section>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const hasNext = total > (page + 1) * pageSize;

  const headerActions = (
    <>
      {/* Export to cloud — only when the Contributor Id is verified. */}
      <Button
        variant="outline"
        onClick={handleExportToCloud}
        disabled={contributionUpload.isPending}
      >
        <CloudUpload className={cn('h-4 w-4', contributionUpload.isPending && 'animate-pulse')} aria-hidden="true" />
        {contributionUpload.isPending ? 'Exporting…' : 'Export to cloud'}
      </Button>

      {/* Scan now — primary action. */}
      <Button
        onClick={() => { setScanProgress('Starting scan…'); scanAll.mutate(); }}
        disabled={scanAll.isPending}
      >
        <RefreshCw className={cn('h-4 w-4', scanAll.isPending && 'animate-spin')} aria-hidden="true" />
        {scanAll.isPending ? 'Scanning…' : 'Scan now'}
      </Button>
    </>
  );

  return (
    <div className="space-y-6 pb-6 md:space-y-8">
      <PageHeader
        folio="07"
        eyebrow="Manage · Community"
        title={<em>Contribution</em>}
        description="Manage sources and their metadata links in the contribution database."
        meta={data ? [`${total} mappings`, FILTER_LABEL[filter]] : undefined}
        actions={headerActions}
        tate="寄稿"
      >
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="contribution-filter" className={fieldLabel}>
            Show
          </label>
          {/* Filter combo — default Unmatched. */}
          <Select value={filter} onValueChange={(v) => { setFilter(v as MappingFilter); setPage(0); }}>
            <SelectTrigger id="contribution-filter" className="w-40">
              <SelectValue placeholder="Unmatched" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unmatched">Unmatched</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>

          {scanProgress && (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3 py-1 font-mono text-[11.5px] text-accent-ink md:ml-auto"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-ink motion-safe:animate-pulse" aria-hidden="true" />
              <span className="truncate">{scanProgress}</span>
            </span>
          )}
        </div>
      </PageHeader>

      <MappingTable
        groups={data?.groups ?? []}
        providerMeta={data?.providerMeta ?? {}}
        loading={loading}
        scanMapping={scanMapping}
        block={block}
        unblock={unblock}
        ignore={ignore}
        ignoreAll={ignoreAll}
        mappingScanStates={mappingScanStates}
        onSearch={setSearchTarget}
      />

      {searchTarget && (
        <ScrobblerSearchRequester
          open
          onOpenChange={(open) => {
            if (!open) {
              setSearchTarget(null);
              handleSearchConfirmed();
            }
          }}
          provider={searchTarget.provider}
          seriesId={searchTarget.mappingId}
          seriesTitle={searchTarget.mappingTitle}
          seriesThumbnail={searchTarget.mappingCoverUrl}
          seriesAltTitles={searchTarget.mappingTitles}
          confirmLabel="Confirm Mapping"
          onConfirm={async (externalSeriesId, externalSeriesTitle) => {
            await linkMapping.mutateAsync({
              mappingId: searchTarget.mappingId,
              provider: searchTarget.provider,
              externalSeriesId,
              externalSeriesTitle,
            });
          }}
        />
      )}

      {/* Pagination */}
      <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-rule pt-4">
        <Button variant="outline" size="sm" className="max-sm:min-h-11" disabled={page <= 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Prev
        </Button>
        <span className="font-mono text-xs tabular-nums text-ink-3">
          Page <b className="font-semibold text-ink">{page + 1}</b> · {total} total
        </span>
        <Button
          variant="outline"
          size="sm"
          className="max-sm:min-h-11"
          disabled={!hasNext}
          onClick={() => setPage(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}

interface MappingTableActions {
  scanMapping: ReturnType<typeof useContributionMappingsScanMapping>;
  block: ReturnType<typeof useContributionMappingsBlock>;
  unblock: ReturnType<typeof useContributionMappingsUnblock>;
  ignore: ReturnType<typeof useContributionMappingsIgnore>;
  ignoreAll: ReturnType<typeof useContributionMappingsIgnoreAll>;
  mappingScanStates?: Record<string, MappingScanState>;
  onSearch: (target: {
    mappingId: string;
    mappingTitle: string;
    mappingCoverUrl?: string;
    mappingTitles?: string;
    provider: ScrobblerProvider;
  }) => void;
}

function MappingTable({ groups, providerMeta, loading, scanMapping, block, unblock, ignore, ignoreAll, onSearch, mappingScanStates }: {
  groups: ContributionMappingGroup[];
  providerMeta: ContributionMappingsPage['providerMeta'];
  loading: boolean;
} & MappingTableActions) {
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading mappings">
        {[0, 1].map((i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-rule bg-card shadow-paper">
            <div className="flex items-center gap-3 border-b border-rule bg-paper-1 px-4 py-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="ml-auto h-8 w-24" />
            </div>
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex items-center gap-3 border-b border-rule px-4 py-3 last:border-0">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-14 w-10" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-rule-2 bg-paper-1 px-6 py-14 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-rule bg-paper-2 text-ink-3" aria-hidden="true">
          <Layers className="h-5 w-5" />
        </span>
        <p className="font-serif text-xl text-ink">No mappings yet.</p>
        <p className="mt-1 text-sm text-ink-2">Run a scan.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {groups.map((g) => (
          <MappingGroupRows
            key={g.mappingId}
            group={g}
            providerMeta={providerMeta}
            scanMapping={scanMapping}
            block={block}
            unblock={unblock}
            ignore={ignore}
            ignoreAll={ignoreAll}
            mappingScanStates={mappingScanStates}
            onSearch={onSearch}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

/** One mapping card: title header (member-source summary + group-level Ignore All / Scan), the cover and one row per provider. */
function MappingGroupRows({ group, providerMeta, scanMapping, block, unblock, ignore, ignoreAll, onSearch, mappingScanStates }: {
  group: ContributionMappingGroup;
  providerMeta: ContributionMappingsPage['providerMeta'];
} & MappingTableActions) {
  const providers = group.providers ?? [];
  const scanState = mappingScanStates?.[group.mappingId];
  const isScanning = scanState === 'scanning';
  const sourceSummary = (group.sources ?? []).map(s => textOr(s.sourceName, s.sourceKey)).filter(Boolean);
  const altTitles = group.titles?.filter(t => t !== group.displayTitle).join(' · ') ?? '';
  const displayTitle = textOr(group.displayTitle, group.mappingId);
  const headingId = `contribution-${group.mappingId}`;

  return (
    <article
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border border-rule bg-card shadow-paper"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule bg-paper-1 px-4 py-3">
        {group.coverUrl ? (
          <LazyImage
            src={group.coverUrl}
            alt=""
            className="h-14 w-10 shrink-0 rounded-[3px] border border-rule object-cover md:hidden"
          />
        ) : (
          <Layers className="h-4 w-4 shrink-0 text-ink-3 md:hidden" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="break-words font-serif text-lg leading-tight text-ink">
            {displayTitle}
          </h2>
          {sourceSummary.length > 0 && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
              <Layers className="hidden h-3 w-3 shrink-0 text-ink-3 md:block" aria-hidden="true" />
              <span className="sr-only">Sources: </span>
              <span className="truncate">{sourceSummary.join(' · ')}</span>
            </p>
          )}
          {altTitles && (
            <p className="mt-0.5 truncate text-xs text-ink-3">{altTitles}</p>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 max-sm:min-h-11 sm:flex-none"
            onClick={() => ignoreAll.mutate(group.mappingId)}
            disabled={ignoreAll.isPending}
            title="Mark every Not matched provider for this mapping as Ignore always"
          >
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            {ignoreAll.isPending ? 'Ignoring…' : 'Ignore All'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'flex-1 max-sm:min-h-11 sm:flex-none',
              scanState === 'done' && 'border-ok/40 text-ok',
              scanState === 'failed' && 'border-bad/40 text-bad',
            )}
            onClick={() => scanMapping.mutate(group.mappingId)}
            disabled={isScanning}
            title={
              scanState === 'done'
                ? 'Scan complete'
                : scanState === 'failed'
                  ? 'Scan failed'
                  : isScanning
                    ? `Scanning ${textOr(group.displayTitle, 'mapping')}…`
                    : `Scan ${textOr(group.displayTitle, 'mapping')} against providers`
            }
          >
            {scanState === 'done' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : scanState === 'failed' ? (
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <RotateCcw className={cn('h-3.5 w-3.5', isScanning && 'animate-spin')} aria-hidden="true" />
            )}
            {scanState === 'done'
              ? 'Done'
              : scanState === 'failed'
                ? 'Failed'
                : isScanning
                  ? 'Scanning…'
                  : 'Scan'}
          </Button>
        </div>
      </header>

      <div className="md:grid md:grid-cols-[112px_minmax(0,1fr)]">
        <div className="hidden border-r border-rule bg-paper-1/60 p-3 md:block">
          {group.coverUrl ? (
            <ThumbnailPopover
              src={group.coverUrl}
              alt={group.displayTitle}
              className="aspect-[3/4] w-full rounded-[3px] border border-rule object-cover shadow-paper"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-[3px] border border-dashed border-rule-2 font-mono text-[10px] uppercase tracking-wide text-ink-3">
              No cover
            </div>
          )}
        </div>
        <ul className="divide-y divide-rule">
          {providers.map((m) => (
            <ProviderRow
              key={`${group.mappingId}-${m.provider}`}
              group={group}
              mapping={m}
              providerMeta={providerMeta}
              block={block}
              unblock={unblock}
              ignore={ignore}
              onSearch={onSearch}
            />
          ))}
        </ul>
      </div>
    </article>
  );
}

function ProviderRow({ group, mapping: m, providerMeta, block, unblock, ignore, onSearch }: {
  group: ContributionMappingGroup;
  mapping: ExternalSeriesProviderMapping;
  providerMeta: ContributionMappingsPage['providerMeta'];
} & Pick<MappingTableActions, 'block' | 'unblock' | 'ignore' | 'onSearch'>) {
  const name = providerName(m.provider);
  const meta = providerMeta?.[ScrobblerProvider[m.provider]];
  const alt = m.alternativeTitles ?? [];
  const id = m.externalSeriesId;
  const urlTemplate = meta?.seriesUrlTemplate;
  const actionClass = 'max-sm:min-h-11';

  return (
    <li className="grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-hover/50 sm:grid-cols-[132px_minmax(0,1fr)] xl:grid-cols-[132px_minmax(0,1fr)_auto] xl:items-start">
      {/* Provider + status */}
      <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
        <div className="flex min-w-0 items-center gap-2">
          {meta?.icon ? (
            <img src={meta.icon} alt="" className="h-6 w-6 shrink-0 rounded-full border border-rule" />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-2 font-mono text-[9.5px] font-bold text-ink-2"
            >
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="truncate text-[13px] font-semibold text-ink">{name}</span>
        </div>
        {statusBadge(m.mappingStatus)}
      </div>

      {/* External match */}
      <div className="flex min-w-0 items-start gap-3">
        {m.providerCoverUrl ? (
          <ThumbnailPopover
            src={m.providerCoverUrl}
            alt={m.externalSeriesTitle}
            className="h-14 w-10 shrink-0 rounded-[3px] border border-rule object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-14 w-10 shrink-0 items-center justify-center rounded-[3px] border border-dashed border-rule-2 text-xs text-ink-3"
          >
            —
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-ink">{textOr(m.externalSeriesTitle, '—')}</p>
          {!id || !urlTemplate ? (
            <p className="font-mono text-xs text-ink-3">{textOr(id, '—')}</p>
          ) : (
            <a
              href={urlTemplate.replace('{0}', encodeURIComponent(id))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm font-mono text-xs text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3.5 max-sm:py-3.5 max-sm:pr-4"
              title={`Open ${name} page`}
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              {id}
            </a>
          )}
          {alt.length > 0 && (
            <p className="mt-1 break-words text-xs leading-relaxed text-ink-3">{alt.join(' · ')}</p>
          )}
        </div>
      </div>

      {/* Row actions */}
      <div className="flex flex-wrap gap-1.5 sm:col-start-2 xl:col-start-auto xl:w-[236px] xl:justify-end">
        <Button
          variant="outline"
          size="sm"
          className={actionClass}
          onClick={() => onSearch({
            mappingId: group.mappingId,
            mappingTitle: textOr(group.displayTitle, group.mappingId),
            mappingCoverUrl: group.coverUrl,
            mappingTitles: group.titles?.join(' · ') ?? undefined,
            provider: m.provider,
          })}
          title={`Search ${name} for a match`}
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Search
        </Button>
        {m.mappingStatus === SeriesMappingStatus.Blocked ? (
          <Button
            variant="outline"
            size="sm"
            className={actionClass}
            onClick={() => unblock.mutate({ mappingId: group.mappingId, provider: m.provider.toString() })}
            title="Unblock this provider"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Unblock
          </Button>
        ) : (
          (m.mappingStatus === SeriesMappingStatus.AutoMatched || m.mappingStatus === SeriesMappingStatus.UserConfirmed) && (
            <Button
              variant="outline"
              size="sm"
              className={cn(actionClass, 'hover:border-bad/40 hover:text-bad')}
              onClick={() => block.mutate({ mappingId: group.mappingId, provider: m.provider.toString() })}
              title="Block this provider link"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              Block
            </Button>
          )
        )}
        {/* Temporary ignore (re-evaluated after 1 month) */}
        {m.mappingStatus !== SeriesMappingStatus.TemporaryIgnored && (
          <Button
            variant="outline"
            size="sm"
            className={actionClass}
            onClick={() => ignore.mutate({ mappingId: group.mappingId, provider: m.provider.toString(), forever: false })}
            title="Ignore this provider for 1 month (re-evaluated afterward)"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Ignore 1m
          </Button>
        )}

        {/* Permanent ignore */}
        {m.mappingStatus !== SeriesMappingStatus.ForeverIgnored && (
          <Button
            variant="outline"
            size="sm"
            className={actionClass}
            onClick={() => ignore.mutate({ mappingId: group.mappingId, provider: m.provider.toString(), forever: true })}
            title="Ignore this provider forever"
          >
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            Ignore always
          </Button>
        )}

        {/* Un-ignore: only when the row is currently ignored (temp or forever). */}
        {(m.mappingStatus === SeriesMappingStatus.TemporaryIgnored || m.mappingStatus === SeriesMappingStatus.ForeverIgnored) && (
          <Button
            variant="outline"
            size="sm"
            className={actionClass}
            onClick={() => unblock.mutate({ mappingId: group.mappingId, provider: m.provider.toString() })}
            title="Stop ignoring this provider"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Un-ignore
          </Button>
        )}
      </div>
    </li>
  );
}
