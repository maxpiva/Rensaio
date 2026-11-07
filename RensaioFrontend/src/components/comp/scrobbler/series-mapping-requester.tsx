"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useScrobblerMatches, useDisableLink, useRemoveMapping } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, SeriesMappingStatus, type SeriesMatchStatus } from '@/lib/api/types';
import { ScrobblerSearchRequester } from '@/components/comp/scrobbler/scrobbler-search-requester';
import { ChevronDown, ChevronRight, Ban, X, ExternalLink, Search, Link2, Loader2, AlertTriangle, CircleDashed, Sparkles, Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SeriesMappingRequesterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ScrobblerProvider;
}

export function SeriesMappingRequester({ open, onOpenChange, provider }: SeriesMappingRequesterProps) {
  const { data: allMatches, isLoading } = useScrobblerMatches();
  const disableLink = useDisableLink();
  const removeMapping = useRemoveMapping();

  const [disabledOpen, setDisabledOpen] = useState(false);
  const [searchSeries, setSearchSeries] = useState<{ seriesId: string; seriesTitle: string; seriesThumbnail?: string; seriesAltTitles?: string } | null>(null);

  // Filter matches for this provider, with Needs Attention at top, then ordered by status
  const { needsAttention, otherItems, disabled } = useMemo(() => {
    const filtered = allMatches?.filter(m => m.provider === provider) ?? [];

    const needsAttention = filtered.filter(m =>
      m.mappingStatus === SeriesMappingStatus.Unmatched
    );

    const otherItems = filtered
      .filter(m =>
        m.mappingStatus === SeriesMappingStatus.UserConfirmed ||
        m.mappingStatus === SeriesMappingStatus.AutoMatched
      )
      .sort((a, b) => {
        // UserConfirmed first, then AutoMatched
        if (a.mappingStatus === SeriesMappingStatus.UserConfirmed &&
            b.mappingStatus === SeriesMappingStatus.AutoMatched) return -1;
        if (a.mappingStatus === SeriesMappingStatus.AutoMatched &&
            b.mappingStatus === SeriesMappingStatus.UserConfirmed) return 1;
        return 0;
      });

    const disabled = filtered.filter(m =>
      m.mappingStatus === SeriesMappingStatus.ForeverIgnored ||
      m.mappingStatus === SeriesMappingStatus.TemporaryIgnored ||
      m.mappingStatus === SeriesMappingStatus.Blocked
    );

    return { needsAttention, otherItems, disabled };
  }, [allMatches, provider]);

  const handleDisable = useCallback((match: SeriesMatchStatus) => {
    disableLink.mutate({ seriesId: match.seriesId, provider: match.provider });
  }, [disableLink]);

  const handleRemoveDisable = useCallback((match: SeriesMatchStatus) => {
    removeMapping.mutate({ seriesId: match.seriesId, provider: match.provider });
  }, [removeMapping]);

  const statusBadge = (status: SeriesMappingStatus, score?: number) => {
    switch (status) {
      case SeriesMappingStatus.Unmatched:
        return <Badge variant="warn"><CircleDashed />Not matched</Badge>;
      case SeriesMappingStatus.AutoMatched: {
        const pct = score != null ? Math.round(score * 100) : null;
        return <Badge variant="info"><Sparkles />Auto{pct != null ? ` (${pct}%)` : ''}</Badge>;
      }
      case SeriesMappingStatus.UserConfirmed:
        return <Badge variant="ok"><Check />User</Badge>;
      case SeriesMappingStatus.TemporaryIgnored:
        return <Badge variant="secondary"><Clock />Temp. ignored</Badge>;
      case SeriesMappingStatus.ForeverIgnored:
        return <Badge variant="secondary"><Ban />Disabled</Badge>;
      case SeriesMappingStatus.Blocked:
        return <Badge variant="secondary"><Ban />Blocked</Badge>;
    }
  };

  const rowClass = "flex flex-col gap-2.5 px-3.5 py-3 transition-colors hover:bg-hover sm:flex-row sm:items-center sm:justify-between sm:gap-4";
  const listClass = "overflow-hidden rounded-lg border border-rule-2 bg-paper-1 shadow-paper divide-y divide-rule";
  const rowBtn = "max-sm:min-h-11 max-sm:flex-1";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92dvh] flex-col sm:max-h-[85vh] sm:max-w-3xl">
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-ink">
                <Link2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 break-words">Series Mappings — {ScrobblerProvider[provider]}</span>
            </DialogTitle>
            <DialogDescription>
              All library series and their mapping status for this provider
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div role="status" aria-busy="true" className={listClass}>
              <p className="flex items-center justify-center gap-2 py-3 text-sm text-ink-3">
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                Loading mappings...
              </p>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} aria-hidden className="flex items-center gap-3 px-3.5 py-3">
                  <div className="skeleton-shimmer h-3.5 flex-1 rounded-[2px]" />
                  <div className="skeleton-shimmer h-[22px] w-16 rounded-[4px]" />
                  <div className="skeleton-shimmer hidden h-[30px] w-20 rounded-md sm:block" />
                </div>
              ))}
            </div>
          ) : (
            <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1">
              {/* Needs Attention - Only Unmatched */}
              {needsAttention.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warn">
                    <AlertTriangle aria-hidden className="h-4 w-4" />
                    Needs Attention
                    <span className="font-mono text-[11px] tabular-nums">({needsAttention.length})</span>
                    <span aria-hidden className="h-px flex-1 bg-warn/25" />
                  </h3>
                  <div className={cn(listClass, "border-warn/30")}>
                    {needsAttention.map((match) => (
                      <div key={`${match.seriesId}-${match.provider}`} className={rowClass}>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate font-serif text-[15px] text-ink">{match.seriesTitle}</span>
                          {statusBadge(match.mappingStatus, match.matchScore)}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className={rowBtn}
                            onClick={() => setSearchSeries({
                              seriesId: match.seriesId,
                              seriesTitle: match.seriesTitle,
                              seriesThumbnail: match.seriesCoverUrl,
                              seriesAltTitles: match.alternativeTitles,
                            })}
                          >
                            <Search className="h-4 w-4" />
                            Map
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={rowBtn}
                            onClick={() => handleDisable(match)}
                            disabled={disableLink.isPending}
                          >
                            <Ban className="h-4 w-4" />
                            Disable
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Other Mappings (UserConfirmed + AutoMatched) — no separate label */}
              {otherItems.length > 0 && (
                <div className={listClass}>
                  {otherItems.map((match) => (
                    <div key={`${match.seriesId}-${match.provider}`} className={rowClass}>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 max-w-full truncate font-serif text-[15px] text-ink">{match.seriesTitle}</span>
                        {statusBadge(match.mappingStatus, match.matchScore)}
                        {match.externalSeriesTitle && (
                          <span className="flex min-w-0 max-w-full items-center gap-1.5">
                            <span aria-hidden className="text-xs text-ink-3">→</span>
                            {match.externalSeriesUrl ? (
                              <a
                                href={match.externalSeriesUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-w-0 items-center gap-1 rounded-sm text-xs font-medium text-accent-ink underline-offset-4 outline-none hover:underline focus-visible:underline"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="truncate">{match.externalSeriesTitle}</span>
                              </a>
                            ) : (
                              <span className="truncate text-xs text-ink-3">{match.externalSeriesTitle}</span>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className={rowBtn}
                          onClick={() => setSearchSeries({
                            seriesId: match.seriesId,
                            seriesTitle: match.seriesTitle,
                            seriesThumbnail: match.seriesCoverUrl,
                            seriesAltTitles: match.alternativeTitles,
                          })}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={rowBtn}
                          onClick={() => handleDisable(match)}
                          disabled={disableLink.isPending}
                        >
                          <Ban className="h-4 w-4" />
                          Disable
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Disabled (collapsible) */}
              {disabled.length > 0 && (
                <Collapsible open={disabledOpen} onOpenChange={setDisabledOpen}>
                  <CollapsibleTrigger className="flex min-h-9 items-center gap-2 rounded-sm text-sm font-semibold text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-[3px] focus-visible:ring-accent-soft max-sm:min-h-11">
                    {disabledOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Disabled
                    <span className="font-mono text-[11px] tabular-nums">({disabled.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className={cn(listClass, "shadow-none")}>
                      {disabled.map((match) => (
                        <div key={`${match.seriesId}-${match.provider}`} className={rowClass}>
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate font-serif text-[15px] text-ink-3">{match.seriesTitle}</span>
                            <Badge variant="secondary"><Ban />Disabled</Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 max-sm:min-h-11 max-sm:w-full"
                            onClick={() => handleRemoveDisable(match)}
                            disabled={removeMapping.isPending}
                          >
                            <X className="h-4 w-4" />
                            Remove Disable
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Empty state */}
              {needsAttention.length === 0 && otherItems.length === 0 && disabled.length === 0 && (
                <div className="rounded-lg border border-dashed border-rule-3 px-4 py-10 text-center">
                  <Link2 aria-hidden className="mx-auto mb-2 h-5 w-5 text-ink-3" strokeWidth={1.5} />
                  <p className="font-serif text-[16px] italic text-ink-2">
                    No series found for this provider.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Scrobbler Search Requester */}
      {searchSeries && (
        <ScrobblerSearchRequester
          open={true}
          onOpenChange={(open: boolean) => {
            if (!open) setSearchSeries(null);
          }}
          provider={provider}
          seriesId={searchSeries.seriesId}
          seriesTitle={searchSeries.seriesTitle}
          seriesThumbnail={searchSeries.seriesThumbnail}
          seriesAltTitles={searchSeries.seriesAltTitles}
        />
      )}
    </>
  );
}
