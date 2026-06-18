"use client";

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LazyImage } from "@/components/ui/lazy-image";
import { useScrobblerMatches, useAutoMatchSeries, useSearchExternal, useConfirmMatch, useDisableLink, useRemoveMapping } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, SeriesMappingStatus, type SeriesMatchStatus, type ConfirmMatchRequest, type DisableLinkRequest, type ScrobblerSearchResult } from '@/lib/api/types';
import { Search, Check, X, Ban, RefreshCw } from 'lucide-react';

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

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScrobblerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const currentMatch = matches?.find(
    m => m.seriesId === seriesId && m.provider === provider
  );

  const handleAutoMatch = useCallback(async () => {
    await autoMatchSeries.mutateAsync(seriesId);
  }, [autoMatchSeries, seriesId]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const result = await searchExternal.mutateAsync({ provider, query: searchQuery });
      setSearchResults(result.results);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, provider, searchExternal]);

  const handleConfirm = useCallback(async (externalId: string, externalTitle?: string) => {
    const request: ConfirmMatchRequest = {
      seriesId,
      provider,
      externalSeriesId: externalId,
      externalSeriesTitle: externalTitle,
    };
    await confirmMatch.mutateAsync(request);
  }, [seriesId, provider, confirmMatch]);

  const handleDisable = useCallback(async () => {
    const request: DisableLinkRequest = { seriesId, provider };
    await disableLink.mutateAsync(request);
  }, [seriesId, provider, disableLink]);

  const handleRemove = useCallback(async () => {
    await removeMapping.mutateAsync({ seriesId, provider });
  }, [seriesId, provider, removeMapping]);

  const statusBadge = (status: SeriesMappingStatus, score?: number) => {
    switch (status) {
      case SeriesMappingStatus.Unmatched:
        return <Badge variant="secondary">Not matched</Badge>;
      case SeriesMappingStatus.AutoMatched:
        return <Badge variant="default">Auto-matched ({Math.round((score ?? 0) * 100)}%)</Badge>;
      case SeriesMappingStatus.UserConfirmed:
        return <Badge variant="default">Matched</Badge>;
      case SeriesMappingStatus.Ignored:
        return <Badge variant="secondary">Disabled</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Series Match</DialogTitle>
          <DialogDescription>
            {ScrobblerProvider[provider]} — {currentMatch?.seriesTitle ?? seriesId}
          </DialogDescription>
        </DialogHeader>

        {/* Current Match Status */}
        {currentMatch && (
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Current status:</span>
              {statusBadge(currentMatch.mappingStatus, currentMatch.matchScore)}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoMatch}
                disabled={autoMatchSeries.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${autoMatchSeries.isPending ? 'animate-spin' : ''}`} />
                Auto-Match
              </Button>
              {currentMatch.mappingStatus !== SeriesMappingStatus.Ignored && (
                <Button variant="outline" size="sm" onClick={handleDisable}>
                  <Ban className="h-4 w-4 mr-1" />
                  Disable Link
                </Button>
              )}
              {currentMatch.mappingStatus !== SeriesMappingStatus.Unmatched && (
                <Button variant="destructive" size="sm" onClick={handleRemove}>
                  <X className="h-4 w-4 mr-1" />
                  Remove Mapping
                </Button>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Search */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Search external service</h4>
          <div className="flex gap-2">
            <Input
              placeholder={`Search ${ScrobblerProvider[provider]}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
              <Search className="h-4 w-4 mr-1" />
              Search
            </Button>
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Search Results</h4>
            <div className="grid gap-2">
              {searchResults.map((result) => (
                <div
                  key={result.externalId}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  {result.coverUrl && (
                    <LazyImage
                      src={result.coverUrl}
                      alt={result.title}
                      className="h-16 w-12 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{result.title}</p>
                    {result.alternateTitles.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {result.alternateTitles.slice(0, 3).join(', ')}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {result.type && (
                        <span className="text-xs text-muted-foreground">{result.type}</span>
                      )}
                      {result.chapterCount && (
                        <span className="text-xs text-muted-foreground">{result.chapterCount} ch.</span>
                      )}
                      {result.score && (
                        <span className="text-xs text-muted-foreground">Score: {result.score}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleConfirm(result.externalId, result.title)}
                    disabled={confirmMatch.isPending}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Match
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {isSearching && searchResults.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
        )}
        {!isSearching && searchResults.length === 0 && searchQuery && (
          <p className="text-sm text-muted-foreground text-center py-4">No results found for "{searchQuery}"</p>
        )}
      </DialogContent>
    </Dialog>
  );
}