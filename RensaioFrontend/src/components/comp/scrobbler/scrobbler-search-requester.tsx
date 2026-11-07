"use client";

import React, { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchExternal, useConfirmMatch, useScrobblerConfigs } from '@/lib/api/hooks/useScrobbler';
import { useToast } from '@/hooks/use-toast';
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
  /**
   * Optional confirm callback. When provided it replaces the default Rensaio series-scoped
   * confirm (`useConfirmMatch`), letting other pages (e.g. Contribution Mappings) confirm into
   * their own persistence layer while reusing the exact same search dialog UI.
   */
  onConfirm?: (externalSeriesId: string, externalSeriesTitle?: string) => Promise<void> | void;
  confirmLabel?: string;
}

export function ScrobblerSearchRequester({
  open,
  onOpenChange,
  provider,
  seriesId,
  seriesTitle,
  seriesThumbnail,
  seriesAltTitles,
  onConfirm,
  confirmLabel = 'Confirm Selection',
}: ScrobblerSearchRequesterProps) {
  const searchExternal = useSearchExternal();
  const confirmMatch = useConfirmMatch();
  const { toast } = useToast();
  const { data: configs } = useScrobblerConfigs();
  const imageTemplateUrl = configs?.find(c => c.provider === provider)?.imageTemplateUrl;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScrobblerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
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

  const handleConfirm = useCallback(async () => {
    if (selectedId == null) return;
    const index = parseInt(selectedId, 10);
    const selected = searchResults[index];
    if (!selected) return;

    setIsConfirming(true);
    try {
      if (onConfirm) {
        await onConfirm(selected.externalId, selected.title);
      } else {
        await confirmMatch.mutateAsync({
          seriesId,
          provider,
          externalSeriesId: selected.externalId,
          externalSeriesTitle: selected.title,
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to confirm match:', error);
      toast({
        title: 'Failed to confirm mapping',
        description: error instanceof Error ? error.message : 'The mapping could not be saved. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsConfirming(false);
    }
  }, [selectedId, searchResults, seriesId, provider, confirmMatch, onConfirm, onOpenChange, toast]);

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
      const timer = setTimeout(() => {
        void (async () => {
          setIsSearching(true);
          try {
            const result = await searchExternal.mutateAsync({ provider, query: seriesTitle });
            setSearchResults(result.results);
            setHasSearched(true);
          } finally {
            setIsSearching(false);
          }
        })();
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

  const providerLabel = ScrobblerProvider[provider];

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[88vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-4 sm:h-[78vh] sm:w-[88vw] lg:w-[70vw]">
          <DialogHeader>
            <p className="paper-eyebrow">Find a match</p>
            <DialogTitle>
              Search <em className="font-serif italic text-accent-ink">{providerLabel}</em>
            </DialogTitle>
            <DialogDescription>
              Find a matching series on {providerLabel}
            </DialogDescription>
          </DialogHeader>

          {/* Original series info — Rensaio cover, title, alternative titles */}
          <div className="flex items-center gap-3 rounded-lg border border-rule bg-paper-1 p-3">
            {seriesThumbnail && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <LazyImage
                    src={formatThumbnailUrl(seriesThumbnail)}
                    alt={seriesTitle}
                    className="h-16 w-11 flex-shrink-0 cursor-pointer rounded-[3px] border border-rule object-cover sm:h-20 sm:w-14"
                  />
                </TooltipTrigger>
                <TooltipPrimitive.Portal>
                  <TooltipContent side="right" className="p-0 bg-transparent border-none shadow-none">
                    <div className="relative w-48 aspect-[3/4]">
                      <img
                        src={formatThumbnailUrl(seriesThumbnail)}
                        alt={seriesTitle}
                        className="h-full w-full rounded-md border border-rule object-cover shadow-lift"
                      />
                    </div>
                  </TooltipContent>
                </TooltipPrimitive.Portal>
              </Tooltip>
            )}
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">Your series</p>
              <p className="mt-0.5 break-words font-serif text-base leading-snug text-ink">{seriesTitle}</p>
              {seriesAltTitles && (
                <p className="mt-1 line-clamp-2 text-xs text-ink-3">{seriesAltTitles}</p>
              )}
            </div>
          </div>

          {/* Search input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <Input
                ref={searchInputRef}
                placeholder={`Search ${providerLabel}...`}
                aria-label={`Search ${providerLabel}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
              <Search className={`h-4 w-4 ${isSearching ? 'animate-pulse' : ''}`} aria-hidden="true" />
              Search
            </Button>
          </div>

          {/* Results area — fills the dialog so the footer stays at the bottom. */}
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1" style={{ scrollbarGutter: 'stable' }}>
            {searchResults.length > 0 && (
              <div
                role="listbox"
                aria-label={`${providerLabel} results`}
                className="grid grid-cols-2 gap-2.5 p-0.5 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              >
                {searchResults.map((result, idx) => {
                  const coverUrl = getCoverUrl(result);
                  const altLines = result.alternateTitles?.length
                    ? result.alternateTitles.join('\n')
                    : '';
                  // Use the row index as identity: externalId may be empty/duplicated across
                  // providers (MangaBaka/MangaUpdates), which caused all rows to highlight together.
                  const rowKey = `${idx}`;
                  const isSelected = selectedId === rowKey;
                  const toggle = () => setSelectedId(isSelected ? null : rowKey);
                  return (
                    <div
                      key={rowKey}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                      className={`group relative cursor-pointer overflow-hidden rounded-md border bg-card transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isSelected
                          ? 'border-accent-ink shadow-lift ring-2 ring-accent-ink'
                          : 'border-rule hover:-translate-y-0.5 hover:border-rule-2 hover:shadow-paper'
                      }`}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                    >
                      {isSelected && (
                        <span className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-paper" aria-hidden="true">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {coverUrl ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="relative aspect-[3/4] bg-paper-2">
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
                                  className="h-full w-full rounded-md border border-rule object-cover shadow-lift"
                                />
                              </div>
                            </TooltipContent>
                          </TooltipPrimitive.Portal>
                        </Tooltip>
                      ) : (
                        <div className="relative flex aspect-[3/4] items-center justify-center bg-paper-2 font-mono text-[11px] uppercase tracking-wide text-ink-3">
                          No cover
                        </div>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`border-t px-2 py-1.5 text-left ${
                            isSelected
                              ? 'border-accent-line bg-accent-soft'
                              : 'border-rule bg-card'
                          }`}>
                            <p className={`truncate text-xs font-semibold ${isSelected ? 'text-accent-ink' : 'text-ink'}`}>{result.title}</p>
                            <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-3">
                              {result.alternateTitles && result.alternateTitles.length > 0
                                ? result.alternateTitles.join(', ')
                                : '\u00A0'}
                            </p>
                            {result.type && (
                              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-3">
                                {result.year ? `${result.type} (${result.year})` : result.type}
                              </p>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipPrimitive.Portal>
                          <TooltipContent align="start" collisionPadding={20} className="max-w-[200px]">
                            <p className="text-xs font-medium">{result.title}</p>
                            {altLines && (
                              <>
                                <hr className="my-1 border-t border-rule" />
                                <div className="text-[11px] text-ink-3 whitespace-pre-line">
                                  {altLines}
                                </div>
                              </>
                            )}
                            {result.type && (
                              <>
                                <hr className="my-1 border-t border-rule" />
                                <p className="text-[11px] text-ink-3">{result.type}</p>
                              </>
                            )}
                          </TooltipContent>
                        </TooltipPrimitive.Portal>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty / loading states */}
            {isSearching && searchResults.length === 0 && (
              <div className="grid grid-cols-2 gap-2.5 p-0.5 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" aria-busy="true">
                <span className="sr-only" role="status">Searching...</span>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-md border border-rule">
                    <Skeleton className="aspect-[3/4] w-full rounded-none" />
                    <div className="space-y-1.5 p-2">
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hasSearched && !isSearching && searchResults.length === 0 && searchQuery && (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-rule-2 bg-paper-1 px-6 py-10 text-center">
                <Search className="mb-3 h-5 w-5 text-ink-3" aria-hidden="true" />
                <p className="text-sm text-ink-2">
                  No results found for &quot;{searchQuery}&quot;
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedId || confirmMatch.isPending || isConfirming}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {confirmMatch.isPending || isConfirming ? 'Confirming...' : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
