"use client";

import React, { useState, useEffect, useRef } from 'react';
import { MultiSelectSources } from "@/components/ui/multi-select-sources";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "use-debounce";
import { useSearchSeries, useAvailableSearchSources } from "@/lib/api/hooks/useSearch";
import { setupWizardService } from '@/lib/api/services/setupWizardService';
import { type LinkedSeries, type ImportInfo } from "@/lib/api/types";
import Image from "next/image";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { Search, AlertTriangle, Check, Loader2, X } from "lucide-react";

const getSeriesId = (series: LinkedSeries): string => series.mihonId ?? series.providerId;

const hintClass = "px-6 py-10 text-center font-serif text-[18px] italic text-ink-3";

interface SearchSeriesRequesterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importTitle: string;
  importPath: string;
  onResult: (updatedImportInfo: ImportInfo) => void;
}

export function SearchSeriesRequester({
  open,
  onOpenChange,
  importTitle,
  importPath,
  onResult,
}: SearchSeriesRequesterProps) {
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearchValue] = useDebounce(searchValue, 300);
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch available search sources
  const { data: availableSources = [] } = useAvailableSearchSources();

  // State for selected search sources
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  // Initialize selected sources when available sources are loaded
  useEffect(() => {
    if (availableSources.length > 0 && selectedSources.length === 0) {
      setSelectedSources(availableSources.map(source => source.mihonProviderId));
    }
  }, [availableSources, selectedSources.length]);

  const shouldSearch = debouncedSearchValue.length >= 3 && selectedSources.length > 0;

  const { data: searchResults = [], isLoading, error: searchError, isFetching } = useSearchSeries(
    {
      keyword: debouncedSearchValue,
      searchSources: selectedSources.length > 0 ? selectedSources : undefined
    },
    { enabled: shouldSearch }
  );

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSearchValue(importTitle);
      setSelectedSeries([]);
      setError(null);
      setIsSubmitting(false);

      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          const length = searchInputRef.current.value.length;
          searchInputRef.current.setSelectionRange(length, length);
        }
      }, 100);
    } else {
      setSearchValue("");
      setSelectedSeries([]);
    }
  }, [open, importTitle]);

  // Handle error from search
  useEffect(() => {
    if (searchError) {
      setError(searchError.message);
    } else {
      setError(null);
    }
  }, [searchError]);

  const handleSeriesToggle = (seriesId: string) => {
    setSelectedSeries(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(seriesId)) {
        newSelection.delete(seriesId);
      } else {
        newSelection.add(seriesId);
      }
      return Array.from(newSelection);
    });
  };

  const canSubmit = selectedSeries.length > 0 && !isSubmitting;

  const handleSearchChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  }, []);

  const handleSearchFocus = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const length = e.target.value.length;
    e.target.setSelectionRange(length, length);
  }, []);

  const handleOk = async () => {
    if (selectedSeries.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const selectedLinkedSeries = searchResults.filter((series: LinkedSeries) =>
        selectedSeries.includes(getSeriesId(series))
      );
      const updatedImportInfo = await setupWizardService.augmentSeries(importPath, selectedLinkedSeries);
      onResult(updatedImportInfo);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to augment series');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const isSearching = (isLoading || isFetching) && debouncedSearchValue.length >= 3;
  const hasQuery = searchValue.length > 0;
  const hasResults = searchResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={[
          /* phone: full-screen sheet; sm+: centred 620px dialog */
          "flex flex-col gap-0 overflow-hidden bg-paper p-0 outline-none focus-visible:outline-none sm:p-0",
          "h-[100dvh] max-h-none w-screen max-w-none rounded-none border-0 left-0 top-0 translate-x-0 translate-y-0",
          "sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[min(720px,calc(100dvh-48px))] sm:w-[min(620px,calc(100vw-48px))] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:border-rule-2",
          "[&>button:last-child]:hidden",
        ].join(" ")}
        overlayClassName="bg-scrim backdrop-blur-[3px]"
        onInteractOutside={(e) => {
          if (!window.matchMedia("(max-width: 640px)").matches) {
            e.preventDefault();
          }
        }}
      >
        {/* ── Header ── */}
        <div className="relative shrink-0 px-5 pb-4 pt-[max(20px,env(safe-area-inset-top,0px))] sm:px-6 sm:pt-6">
          <div className="paper-eyebrow pr-12">Re-match series</div>
          <DialogTitle asChild>
            <h2 className="paper-display mt-1.5 pr-12 text-[28px] sm:text-[32px]">
              Search for a <em>match</em>
            </h2>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px] text-ink-2">
              <span className="min-w-0 font-mono text-[11.5px] text-ink-3 [overflow-wrap:anywhere]">{importPath}</span>
              <span className="text-ink-3" aria-hidden>·</span>
              <span className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">{importTitle}</span>
            </div>
          </DialogDescription>
          <DialogClose
            className="absolute right-3 top-[max(12px,env(safe-area-inset-top,0px))] grid h-11 w-11 place-items-center rounded-md text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring sm:right-4 sm:top-4 sm:h-9 sm:w-9"
            aria-label="Close"
            disabled={isSubmitting}
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </DialogClose>
        </div>

        {/* ── Search input + source filter ── */}
        <div className="shrink-0 space-y-2.5 border-b border-rule px-5 pb-4 sm:px-6" onPointerDown={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              ref={searchInputRef}
              type="search"
              placeholder="Search for a series…"
              aria-label="Search title"
              autoFocus
              value={searchValue}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              className="h-11 pl-9 pr-10 text-[14.5px]"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden={!isSearching}>
              {isSearching && <Loader2 className="h-4 w-4 animate-spin text-accent-ink" />}
            </span>
          </div>

          {availableSources.length > 0 && (
            <MultiSelectSources
              sources={availableSources}
              selectedSources={selectedSources}
              onSelectionChange={setSelectedSources}
              triggerClassName="h-11 bg-paper-1 sm:h-9"
              itemClassName="min-h-10"
            />
          )}

          {/* ── Inline error ── */}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-[12.5px] text-ink">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-bad" aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
            </div>
          )}
        </div>

        {/* ── Results list ── */}
        <div
          className="min-h-[160px] flex-1 overflow-y-auto overscroll-contain bg-paper-1 sm:max-h-[400px]"
          data-vaul-no-drag
          role={hasResults && !isSearching ? "listbox" : undefined}
          aria-multiselectable={hasResults && !isSearching ? true : undefined}
          aria-label="Results"
        >
          {!hasQuery ? (
            <p className={hintClass}>Start typing to search…</p>
          ) : isSearching ? (
            <p className={hintClass} role="status">Searching…</p>
          ) : !hasResults ? (
            <p className={hintClass}>
              {debouncedSearchValue.length < 3
                ? "Keep typing — search starts at 3 characters"
                : "No results found"}
            </p>
          ) : (
            searchResults.map((series) => {
              const seriesId = getSeriesId(series);
              const isSelected = selectedSeries.includes(seriesId);
              return (
                <div
                  key={seriesId}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  className={cn(
                    "relative grid min-h-[64px] cursor-pointer grid-cols-[22px_40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule px-5 py-2.5 outline-none transition-colors last:border-b-0 sm:px-6",
                    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isSelected ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                  onClick={() => handleSeriesToggle(seriesId)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      handleSeriesToggle(seriesId);
                    }
                  }}
                >
                  {/* Crimson rule on selected rows */}
                  <span
                    className={cn("absolute inset-y-0 left-0 w-[3px]", isSelected ? "bg-primary" : "bg-transparent")}
                    aria-hidden
                  />

                  {/* Check box */}
                  <span
                    className={cn(
                      "grid h-[18px] w-[18px] place-items-center rounded-[4px] border-[1.5px] transition-colors",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-rule-3/50 bg-paper",
                    )}
                    aria-hidden
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </span>

                  {/* Cover thumbnail */}
                  <div className="relative h-[60px] w-10 overflow-hidden rounded-[2px] bg-paper-3 shadow-print ring-1 ring-rule-2">
                    <Image
                      src={formatThumbnailUrl(series.thumbnailUrl) ?? '/placeholder.jpg'}
                      alt={series.title || 'Series thumbnail'}
                      fill
                      sizes="40px"
                      className="object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Body */}
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{series.title}</div>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-[11px] font-medium text-ink-3">{series.provider}</span>
                      <ReactCountryFlag
                        countryCode={getCountryCodeForLanguage(series.lang)}
                        svg
                        style={{ width: 16, height: 12, flexShrink: 0, borderRadius: 1 }}
                        title={`${series.lang.toUpperCase()} (${getCountryCodeForLanguage(series.lang)})`}
                      />
                    </div>
                  </div>

                  {/* Trailing indicator */}
                  <span className="min-w-[52px] text-right">
                    {isSelected && (
                      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
                        ✓ added
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-rule bg-paper px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom,0px))] sm:px-6">
          <div className="mr-auto font-mono text-[11.5px] font-medium text-ink-3 tabular-nums max-sm:basis-full">
            <b className="font-semibold text-ink">{selectedSeries.length}</b> selected · {searchResults.length} results
          </div>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            type="button"
            className="max-sm:flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleOk}
            disabled={!canSubmit}
            type="button"
            className="max-sm:flex-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Applying…
              </>
            ) : (
              <>
                <Check aria-hidden />
                Apply Match
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
