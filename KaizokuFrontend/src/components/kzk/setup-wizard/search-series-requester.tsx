"use client";

import React, { useState, useEffect, useRef } from 'react';
import { MultiSelectSources } from "@/components/ui/multi-select-sources";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useDebounce } from "use-debounce";
import { useSearchSeries, useAvailableSearchSources } from "@/lib/api/hooks/useSearch";
import { setupWizardService } from '@/lib/api/services/setupWizardService';
import { type LinkedSeries, type ImportInfo } from "@/lib/api/types";
import Image from "next/image";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { Search, AlertTriangle, Loader2, Check } from "lucide-react";

const getSeriesId = (series: LinkedSeries): string => series.mihonId ?? series.providerId;

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
          /* mobile-first fullscreen, then desktop-constrained */
          "iw-search-modal",
          "bg-transparent border-0 shadow-none p-0 max-h-none overflow-visible",
          "w-screen h-[100dvh] max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0",
          "sm:w-[560px] sm:h-auto sm:max-h-[680px] sm:rounded-2xl sm:top-[50%] sm:left-[50%] sm:-translate-x-1/2 sm:-translate-y-1/2",
          "[&>button]:hidden",
        ].join(" ")}
        overlayClassName="bg-[hsl(240_10%_4%/0.85)] backdrop-blur-xl"
        onInteractOutside={(e) => {
          if (!window.matchMedia("(max-width: 640px)").matches) {
            e.preventDefault();
          }
        }}
      >
        {/* Glass card */}
        <div className="cmd-card iw-search-shell">

          {/* Radial glow behind header */}
          <div className="iw-search-glow" aria-hidden="true" />

          {/* ── Header ── */}
          <div className="iw-search-header">
            <div className="iw-eyebrow">RE-MATCH SERIES</div>
            <h2 className="iw-title iw-search-title">
              Search for a <em>match</em>
            </h2>
            <div className="iw-search-subtitle">
              <span className="iw-search-path">{importPath}</span>
              <span className="iw-search-arrow">·</span>
              <span className="iw-search-name">{importTitle}</span>
            </div>
          </div>

          {/* ── Search input ── */}
          <div className="cmd-input-wrap iw-search-input-wrap" onPointerDown={(e) => e.stopPropagation()}>
            <Search className="icon" style={{ width: 20, height: 20 }} />
            <input
              ref={searchInputRef}
              className="cmd-input"
              type="search"
              placeholder="Search for a series…"
              autoFocus
              value={searchValue}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
            />
            <div className="cmd-spinner-slot" aria-hidden={!isSearching}>
              {isSearching && (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  style={{ color: "hsl(var(--as-fg-muted))" }}
                />
              )}
            </div>
          </div>

          {/* ── Source filter row ── */}
          {availableSources.length > 0 && (
            <div className="cmd-sources-row iw-search-sources-row" onPointerDown={(e) => e.stopPropagation()}>
              <div className="src-dropdown-slot">
                <MultiSelectSources
                  sources={availableSources}
                  selectedSources={selectedSources}
                  onSelectionChange={setSelectedSources}
                  triggerClassName="as-sources-trigger"
                  contentClassName="as-sources-panel"
                  itemClassName="as-sources-item"
                  separatorClassName="as-sources-separator"
                />
              </div>
            </div>
          )}

          {/* ── Inline error ── */}
          {error && (
            <div className="iw-search-error">
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ── Results list ── */}
          <div className="res-list iw-search-results" data-vaul-no-drag>
            {!hasQuery ? (
              <p className="iw-search-hint">Start typing to search…</p>
            ) : isSearching ? (
              <p className="iw-search-hint">Searching…</p>
            ) : !hasResults ? (
              <p className="iw-search-hint">
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
                    className={`res-row${isSelected ? " selected" : ""}`}
                    onClick={() => handleSeriesToggle(seriesId)}
                  >
                    {/* Accent bar */}
                    <div
                      className="accent"
                      style={isSelected ? { background: "hsl(var(--primary))" } : undefined}
                    />

                    {/* Cover thumbnail */}
                    <div className="res-cv">
                      <Image
                        src={formatThumbnailUrl(series.thumbnailUrl) ?? '/placeholder.jpg'}
                        alt={series.title || 'Series thumbnail'}
                        fill
                        sizes="(max-width: 640px) 44px, 48px"
                        className="object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Body */}
                    <div className="res-body">
                      <div className="res-title">{series.title}</div>
                      <div className="res-meta">
                        <span className="src-badge">{series.provider}</span>
                        <ReactCountryFlag
                          countryCode={getCountryCodeForLanguage(series.lang)}
                          svg
                          style={{ width: 16, height: 12 }}
                          title={`${series.lang.toUpperCase()} (${getCountryCodeForLanguage(series.lang)})`}
                        />
                      </div>
                    </div>

                    {/* Trailing indicator */}
                    <div className="res-tail">
                      {isSelected && (
                        <span className="sel-added font-mono">
                          <Check style={{ width: 10, height: 10 }} />
                          added
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Footer ── */}
          <div className="cta-row iw-search-footer">
            <div className="left-meta">
              <span className="num">{selectedSeries.length}</span> selected · {searchResults.length} results
            </div>
            <button
              className="btn-ghost"
              onClick={handleCancel}
              disabled={isSubmitting}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleOk}
              disabled={!canSubmit}
              type="button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <Check style={{ width: 13, height: 13 }} />
                  Apply Match
                </>
              )}
            </button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
