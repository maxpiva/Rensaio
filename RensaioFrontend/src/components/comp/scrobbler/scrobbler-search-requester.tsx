"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchExternal, useConfirmMatch, useScrobblerConfigs } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, type ScrobblerSearchResult } from '@/lib/api/types';
import { Search, Check } from 'lucide-react';
import { LazyImage } from "@/components/ui/lazy-image";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScrobblerSearchRequesterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ScrobblerProvider;
  seriesId: string;
  seriesTitle: string;
  seriesThumbnail?: string;
  seriesAltTitles?: string;
}

export function ScrobblerSearchRequester({
  open,
  onOpenChange,
  provider,
  seriesId,
  seriesTitle,
  seriesThumbnail,
  seriesAltTitles,
}: ScrobblerSearchRequesterProps) {
  const searchExternal = useSearchExternal();
  const confirmMatch = useConfirmMatch();
  const { data: configs } = useScrobblerConfigs();
  const imageTemplateUrl = configs?.find(c => c.provider === provider)?.imageTemplateUrl;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScrobblerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSelectedId(null);
    setHasSearched(false);
    try {
      const result = await searchExternal.mutateAsync({ provider, query: searchQuery });
      setSearchResults(result.results);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, provider, searchExternal]);

  const handleConfirm = useCallback(async () => {
    if (!selectedId) return;
    const selected = searchResults.find(r => r.externalId === selectedId);
    await confirmMatch.mutateAsync({
      seriesId,
      provider,
      externalSeriesId: selectedId,
      externalSeriesTitle: selected?.title,
    });
    onOpenChange(false);
  }, [selectedId, searchResults, seriesId, provider, confirmMatch, onOpenChange]);

  // Reset state when dialog opens and prefill search with series title
  const hasAutoSearched = useRef(false);
  React.useEffect(() => {
    if (open) {
      setSearchQuery(seriesTitle);
      setSearchResults([]);
      setSelectedId(null);
      setHasSearched(false);
      hasAutoSearched.current = false;
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open, seriesTitle]);

  // Auto-search on mount with the pre-filled series title
  React.useEffect(() => {
    if (open && seriesTitle.trim() && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      // Small delay to let state settle before auto-searching
      const timer = setTimeout(async () => {
        setIsSearching(true);
        try {
          const result = await searchExternal.mutateAsync({ provider, query: seriesTitle });
          setSearchResults(result.results);
          setHasSearched(true);
        } finally {
          setIsSearching(false);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open, seriesTitle, provider, searchExternal]);

  // Compute cover URL with fallback to imageTemplateUrl
  const getCoverUrl = useCallback((result: ScrobblerSearchResult): string | undefined => {
    if (result.coverUrl) return result.coverUrl;
    if (imageTemplateUrl && result.externalId) {
      return imageTemplateUrl.replace('{0}', result.externalId);
    }
    return undefined;
  }, [imageTemplateUrl]);

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[65vw] max-w-4xl h-[70vh] max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Search {ScrobblerProvider[provider]}</DialogTitle>
            <DialogDescription>
              Find a matching series on {ScrobblerProvider[provider]}
            </DialogDescription>
          </DialogHeader>

          {/* Original series info — Rensaio cover, title, alternative titles */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            {seriesThumbnail && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <LazyImage
                    src={formatThumbnailUrl(seriesThumbnail)}
                    alt={seriesTitle}
                    className="h-20 w-14 rounded object-cover flex-shrink-0 cursor-pointer"
                  />
                </TooltipTrigger>
                <TooltipPrimitive.Portal>
                  <TooltipContent side="right" className="p-0 bg-transparent border-none shadow-none">
                    <div className="relative w-48 aspect-[3/4]">
                      <img
                        src={formatThumbnailUrl(seriesThumbnail)}
                        alt={seriesTitle}
                        className="w-full h-full object-cover rounded-md border border-secondary"
                      />
                    </div>
                  </TooltipContent>
                </TooltipPrimitive.Portal>
              </Tooltip>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{seriesTitle}</p>
              {seriesAltTitles && (
                <p className="text-xs text-muted-foreground mt-1">{seriesAltTitles}</p>
              )}
            </div>
          </div>

          {/* Search input */}
          <div className="flex gap-2">
            <Input
              ref={searchInputRef}
              placeholder={`Search ${ScrobblerProvider[provider]}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
              <Search className="h-4 w-4 mr-1" />
              Search
            </Button>
          </div>

          {/* Search results grid — with scrollbar-gutter for right gap */}
          {searchResults.length > 0 && (
            <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 p-0.5">
                {searchResults.map((result) => {
                  const coverUrl = getCoverUrl(result);
                  const altLines = result.alternateTitles?.length
                    ? result.alternateTitles.join('\n')
                    : '';
                  return (
                    <div
                      key={result.externalId}
                      className={`cursor-pointer rounded-lg border transition-all duration-200 hover:shadow-md ${
                        selectedId === result.externalId
                          ? 'ring-2 ring-primary shadow-md'
                          : 'hover:ring-1 hover:ring-gray-300'
                      }`}
                      onClick={() => setSelectedId(
                        selectedId === result.externalId ? null : result.externalId
                      )}
                    >
                      {coverUrl ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="aspect-[3/4] relative bg-muted">
                              <LazyImage
                                src={coverUrl}
                                alt={result.title}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipPrimitive.Portal>
                            <TooltipContent side="right" className="p-0 bg-transparent border-none shadow-none">
                              <div className="relative w-48 aspect-[3/4]">
                                <img
                                  src={coverUrl}
                                  alt={result.title}
                                  className="w-full h-full object-cover rounded-md border border-secondary"
                                />
                              </div>
                            </TooltipContent>
                          </TooltipPrimitive.Portal>
                        </Tooltip>
                      ) : (
                        <div className="aspect-[3/4] relative bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          No cover
                        </div>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`p-1.5 text-center ${
                            selectedId === result.externalId
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-card'
                          }`}>
                            <p className="text-xs font-medium truncate">{result.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                              {result.alternateTitles && result.alternateTitles.length > 0
                                ? result.alternateTitles.join(', ')
                                : '\u00A0'}
                            </p>
                            {result.type && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{result.type}</p>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipPrimitive.Portal>
                          <TooltipContent align="start" collisionPadding={20} className="max-w-[200px]">
                            <p className="text-xs font-medium">{result.title}</p>
                            {altLines && (
                              <>
                                <hr className="my-1 border-t border-border" />
                                <div className="text-[11px] text-muted-foreground whitespace-pre-line">
                                  {altLines}
                                </div>
                              </>
                            )}
                            {result.type && (
                              <>
                                <hr className="my-1 border-t border-border" />
                                <p className="text-[11px] text-muted-foreground">{result.type}</p>
                              </>
                            )}
                          </TooltipContent>
                        </TooltipPrimitive.Portal>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty / loading states */}
          {isSearching && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
          )}
          {hasSearched && !isSearching && searchResults.length === 0 && searchQuery && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No results found for "{searchQuery}"
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedId || confirmMatch.isPending}
            >
              <Check className="h-4 w-4 mr-1" />
              {confirmMatch.isPending ? 'Confirming...' : 'Confirm Selection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}