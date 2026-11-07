"use client";

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LazyImage } from "@/components/ui/lazy-image";
import { useScrobblerMatches, useAutoMatchSeries, useSearchExternal, useConfirmMatch, useDisableLink, useRemoveMapping } from '@/lib/api/hooks/useScrobbler';
import { useToast } from '@/hooks/use-toast';
import { ScrobblerProvider, SeriesMappingStatus, type ConfirmMatchRequest, type DisableLinkRequest, type ScrobblerSearchResult } from '@/lib/api/types';
import { Search, Check, X, Ban, RefreshCw, Link2, Loader2, BookOpen, CircleDashed, Sparkles, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SeriesMatchDialogProps {
  seriesId: string;
  provider: ScrobblerProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SeriesMatchDialog({ seriesId, provider, open, onOpenChange }: SeriesMatchDialogProps) {
  const { data: matches, isLoading: matchesLoading } = useScrobblerMatches();
  const autoMatchSeries = useAutoMatchSeries();
  const searchExternal = useSearchExternal();
  const confirmMatch = useConfirmMatch();
  const disableLink = useDisableLink();
  const removeMapping = useRemoveMapping();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScrobblerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const currentMatch = matches?.find(
    m => m.seriesId === seriesId && m.provider === provider
  );

  const handleAutoMatch = useCallback(async () => {
    try {
      await autoMatchSeries.mutateAsync(seriesId);
    } catch (error) {
      console.error('Failed to auto-match series:', error);
      toast({
        title: 'Auto-match failed',
        description: error instanceof Error ? error.message : 'Could not auto-match. Please try again.',
        variant: 'destructive',
      });
    }
  }, [autoMatchSeries, seriesId, toast]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const result = await searchExternal.mutateAsync({ provider, query: searchQuery });
      setSearchResults(result.results);
    } catch (error) {
      console.error('Failed to search:', error);
      toast({
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Could not reach the provider. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, provider, searchExternal, toast]);

  const handleConfirm = useCallback(async (externalId: string, externalTitle?: string) => {
    const request: ConfirmMatchRequest = {
      seriesId,
      provider,
      externalSeriesId: externalId,
      externalSeriesTitle: externalTitle,
    };
    try {
      await confirmMatch.mutateAsync(request);
    } catch (error) {
      console.error('Failed to confirm match:', error);
      toast({
        title: 'Failed to confirm mapping',
        description: error instanceof Error ? error.message : 'The mapping could not be saved. Please try again.',
        variant: 'destructive',
      });
    }
  }, [seriesId, provider, confirmMatch, toast]);

  const handleDisable = useCallback(async () => {
    const request: DisableLinkRequest = { seriesId, provider };
    try {
      await disableLink.mutateAsync(request);
    } catch (error) {
      console.error('Failed to disable link:', error);
      toast({
        title: 'Failed to disable mapping',
        description: error instanceof Error ? error.message : 'Could not disable the mapping. Please try again.',
        variant: 'destructive',
      });
    }
  }, [seriesId, provider, disableLink, toast]);

  const handleRemove = useCallback(async () => {
    try {
      await removeMapping.mutateAsync({ seriesId, provider });
    } catch (error) {
      console.error('Failed to remove mapping:', error);
      toast({
        title: 'Failed to remove mapping',
        description: error instanceof Error ? error.message : 'Could not remove the mapping. Please try again.',
        variant: 'destructive',
      });
    }
  }, [seriesId, provider, removeMapping, toast]);

  const statusBadge = (status: SeriesMappingStatus, score?: number) => {
    switch (status) {
      case SeriesMappingStatus.Unmatched:
        return <Badge variant="warn"><CircleDashed />Not matched</Badge>;
      case SeriesMappingStatus.AutoMatched:
        return <Badge variant="info"><Sparkles />Auto-matched ({Math.round((score ?? 0) * 100)}%)</Badge>;
      case SeriesMappingStatus.UserConfirmed:
        return <Badge variant="ok"><Check />Matched</Badge>;
      case SeriesMappingStatus.TemporaryIgnored:
        return <Badge variant="secondary"><Clock />Temp. ignored</Badge>;
      case SeriesMappingStatus.ForeverIgnored:
        return <Badge variant="secondary"><Ban />Disabled</Badge>;
      case SeriesMappingStatus.Blocked:
        return <Badge variant="secondary"><Ban />Blocked</Badge>;
    }
  };

  const providerName = ScrobblerProvider[provider];
  const actionBtn = "max-sm:min-h-11 max-sm:flex-1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-h-[90vh] sm:max-w-2xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-ink">
              <Link2 className="h-4 w-4" />
            </span>
            Series Match
          </DialogTitle>
          <DialogDescription className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="paper-eyebrow text-[10px] text-accent-ink">{providerName}</span>
            <span className="min-w-0 font-serif text-[15px] italic text-ink-2 [overflow-wrap:anywhere]">
              {currentMatch?.seriesTitle ?? seriesId}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Current Match Status */}
        {matchesLoading && !currentMatch ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-3 rounded-lg border border-rule-2 bg-paper-1 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="sr-only">Loading current status…</span>
            <div aria-hidden className="flex items-center gap-2">
              <div className="skeleton-shimmer h-3 w-24 rounded-[2px]" />
              <div className="skeleton-shimmer h-[22px] w-20 rounded-[4px]" />
            </div>
            <div aria-hidden className="flex gap-2">
              <div className="skeleton-shimmer h-[30px] w-28 rounded-md max-sm:h-10 max-sm:flex-1" />
              <div className="skeleton-shimmer h-[30px] w-28 rounded-md max-sm:h-10 max-sm:flex-1" />
            </div>
          </div>
        ) : currentMatch && (
          <div className="flex flex-col gap-3 rounded-lg border border-rule-2 bg-paper-1 p-3.5 shadow-paper sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="paper-eyebrow text-[10px]">Current status:</span>
              {statusBadge(currentMatch.mappingStatus, currentMatch.matchScore)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoMatch}
                disabled={autoMatchSeries.isPending}
                className={actionBtn}
              >
                <RefreshCw className={`h-4 w-4 ${autoMatchSeries.isPending ? 'motion-safe:animate-spin' : ''}`} />
                Auto-Match
              </Button>
              {currentMatch.mappingStatus !== SeriesMappingStatus.ForeverIgnored &&
                currentMatch.mappingStatus !== SeriesMappingStatus.TemporaryIgnored &&
                currentMatch.mappingStatus !== SeriesMappingStatus.Blocked && (
                <Button variant="outline" size="sm" onClick={handleDisable} className={actionBtn}>
                  <Ban className="h-4 w-4" />
                  Disable Link
                </Button>
              )}
              {currentMatch.mappingStatus !== SeriesMappingStatus.Unmatched && (
                <Button variant="destructive" size="sm" onClick={handleRemove} className={cn(actionBtn, "max-sm:basis-full")}>
                  <X className="h-4 w-4" />
                  Remove Mapping
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="space-y-2.5 border-t border-rule pt-4">
          <Label htmlFor="smd-search" className="paper-eyebrow text-[10px]">Search external service</Label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <Input
                id="smd-search"
                placeholder={`Search ${providerName}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} className="shrink-0">
              {isSearching ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-baseline gap-3">
              <h4 className="font-serif text-[17px] text-ink">Search Results</h4>
              <span className="font-mono text-[11px] tabular-nums text-ink-3">{searchResults.length}</span>
              <span aria-hidden className="h-px flex-1 bg-rule" />
            </div>
            <ul className="overflow-hidden rounded-lg border border-rule-2 bg-paper-1 divide-y divide-rule">
              {searchResults.map((result) => (
                <li
                  key={result.externalId}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-hover"
                >
                  {result.coverUrl ? (
                    <LazyImage
                      src={result.coverUrl}
                      alt={result.title}
                      className="h-16 w-12 shrink-0 rounded-[3px] object-cover shadow-print"
                    />
                  ) : (
                    <div aria-hidden className="grid h-16 w-12 shrink-0 place-items-center rounded-[3px] border border-dashed border-rule-3 bg-paper-2 text-ink-3">
                      <BookOpen className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-[15.5px] leading-snug text-ink">{result.title}</p>
                    {result.alternateTitles.length > 0 && (
                      <p className="truncate text-xs text-ink-3">
                        {result.alternateTitles.slice(0, 3).join(', ')}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-ink-3">
                      {result.type && (
                        <span className="uppercase tracking-wide">{result.type}</span>
                      )}
                      {result.chapterCount && (
                        <span className="tabular-nums">{result.chapterCount} ch.</span>
                      )}
                      {result.score && (
                        <span className="tabular-nums">Score: {result.score}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleConfirm(result.externalId, result.title)}
                    disabled={confirmMatch.isPending}
                    className="shrink-0 max-sm:min-h-11"
                  >
                    <Check className="h-4 w-4" />
                    Match
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* No results */}
        {isSearching && searchResults.length === 0 && (
          <div role="status" aria-busy="true" className="overflow-hidden rounded-lg border border-rule-2 bg-paper-1">
            <p className="flex items-center justify-center gap-2 border-b border-rule py-3 text-sm text-ink-3">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
              Searching...
            </p>
            <div aria-hidden className="divide-y divide-rule">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <div className="skeleton-shimmer h-16 w-12 shrink-0 rounded-[3px]" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton-shimmer h-3.5 w-3/5 rounded-[2px]" />
                    <div className="skeleton-shimmer h-2.5 w-2/5 rounded-[2px]" />
                  </div>
                  <div className="skeleton-shimmer h-[30px] w-20 rounded-md max-sm:h-11" />
                </div>
              ))}
            </div>
          </div>
        )}
        {!isSearching && searchResults.length === 0 && searchQuery && (
          <div className="rounded-lg border border-dashed border-rule-3 px-4 py-6 text-center">
            <Search aria-hidden className="mx-auto mb-2 h-5 w-5 text-ink-3" strokeWidth={1.5} />
            <p className="font-serif text-[16px] italic text-ink-2 [overflow-wrap:anywhere]">
              No results found for &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
