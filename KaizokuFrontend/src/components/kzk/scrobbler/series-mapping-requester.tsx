"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useScrobblerMatches, useDisableLink, useRemoveMapping } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, SeriesMappingStatus, type SeriesMatchStatus } from '@/lib/api/types';
import { ScrobblerSearchRequester } from '@/components/kzk/scrobbler/scrobbler-search-requester';
import { ChevronDown, ChevronRight, Ban, X, ExternalLink, Search } from 'lucide-react';

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
      m.mappingStatus === SeriesMappingStatus.Ignored
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
        return <Badge variant="secondary">Not matched</Badge>;
      case SeriesMappingStatus.AutoMatched:
        const pct = score != null ? Math.round(score * 100) : null;
        return <Badge variant="default">Auto{pct != null ? ` (${pct}%)` : ''}</Badge>;
      case SeriesMappingStatus.UserConfirmed:
        return <Badge variant="default">User</Badge>;
      case SeriesMappingStatus.Ignored:
        return <Badge variant="secondary">Disabled</Badge>;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Series Mappings — {ScrobblerProvider[provider]}</DialogTitle>
            <DialogDescription>
              All library series and their mapping status for this provider
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="p-4 text-muted-foreground text-center">Loading mappings...</div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {/* Needs Attention - Only Unmatched */}
              {needsAttention.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-500 dark:text-amber-400 mb-2">
                    ⚠ Needs Attention ({needsAttention.length})
                  </h3>
                  <div className="rounded-md border">
                    {needsAttention.map((match) => (
                      <div
                        key={`${match.seriesId}-${match.provider}`}
                        className="flex items-center justify-between p-3 border-b last:border-0"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-sm font-medium truncate">{match.seriesTitle}</span>
                          {statusBadge(match.mappingStatus, match.matchScore)}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSearchSeries({
                              seriesId: match.seriesId,
                              seriesTitle: match.seriesTitle,
                              seriesThumbnail: match.seriesCoverUrl,
                              seriesAltTitles: match.alternativeTitles,
                            })}
                          >
                            <Search className="h-4 w-4 mr-1" />
                            Map
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisable(match)}
                            disabled={disableLink.isPending}
                          >
                            <Ban className="h-4 w-4 mr-1" />
                            Disable
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Mappings (UserConfirmed + AutoMatched) — no separate label */}
              {otherItems.length > 0 && (
                <div className="rounded-md border">
                  {otherItems.map((match) => (
                    <div
                      key={`${match.seriesId}-${match.provider}`}
                      className="flex items-center justify-between p-3 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm font-medium truncate">{match.seriesTitle}</span>
                        {statusBadge(match.mappingStatus, match.matchScore)}
                        {match.externalSeriesTitle && (
                          <>
                            <span className="text-xs text-muted-foreground">→</span>
                            {match.externalSeriesUrl ? (
                              <a
                                href={match.externalSeriesUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline truncate inline-flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                {match.externalSeriesTitle}
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground truncate">{match.externalSeriesTitle}</span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSearchSeries({
                            seriesId: match.seriesId,
                            seriesTitle: match.seriesTitle,
                            seriesThumbnail: match.seriesCoverUrl,
                            seriesAltTitles: match.alternativeTitles,
                          })}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisable(match)}
                          disabled={disableLink.isPending}
                        >
                          <Ban className="h-4 w-4 mr-1" />
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
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                    {disabledOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Disabled ({disabled.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="rounded-md border">
                      {disabled.map((match) => (
                        <div
                          key={`${match.seriesId}-${match.provider}`}
                          className="flex items-center justify-between p-3 border-b last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-sm font-medium truncate text-muted-foreground">{match.seriesTitle}</span>
                            <Badge variant="secondary">Disabled</Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveDisable(match)}
                            disabled={removeMapping.isPending}
                          >
                            <X className="h-4 w-4 mr-1" />
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
                <div className="p-4 text-muted-foreground text-center">
                  No series found for this provider.
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