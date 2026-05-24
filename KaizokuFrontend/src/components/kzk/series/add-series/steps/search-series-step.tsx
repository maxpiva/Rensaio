"use client";

import { type AddSeriesState } from "@/components/kzk/series/add-series";
import { AlertTriangle, Search } from "lucide-react";
import { type LinkedSeries, type ExistingSource } from "@/lib/api/types";
import { useSearchSeries, useAvailableSearchSources } from "@/lib/api/hooks/useSearch";
import React from "react";
import { useDebounce } from "use-debounce";
import Image from "next/image";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { usePermission } from "@/hooks/use-permission";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";

// ---------------------------------------------------------------------------
// Deterministic swatch color — hashes provider id into one of 12 palette slots
// ---------------------------------------------------------------------------
const SRC_PALETTE = [
  "linear-gradient(135deg,#7c2d12,#ea580c)",
  "linear-gradient(135deg,#164e63,#0891b2)",
  "linear-gradient(135deg,#831843,#db2777)",
  "linear-gradient(135deg,#78350f,#f59e0b)",
  "linear-gradient(135deg,#365314,#65a30d)",
  "linear-gradient(135deg,#312e81,#4f46e5)",
  "linear-gradient(135deg,#064e3b,#059669)",
  "linear-gradient(135deg,#0c4a6e,#0e7490)",
  "linear-gradient(135deg,#4a044e,#86198f)",
  "linear-gradient(135deg,#1e3a8a,#6366f1)",
  "linear-gradient(135deg,#7f1d1d,#b91c1c)",
  "linear-gradient(135deg,#134e4a,#0d9488)",
];

function hashSourceId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function swatchForSource(id: string): string {
  return SRC_PALETTE[hashSourceId(id) % SRC_PALETTE.length]!;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SearchSeriesStep({
  setError,
  setIsLoading,
  setCanProgress,
  formState,
  setFormState,
  existingSources = [],
}: {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCanProgress: React.Dispatch<React.SetStateAction<boolean>>;
  formState: AddSeriesState;
  setFormState: React.Dispatch<React.SetStateAction<AddSeriesState>>;
  existingSources?: ExistingSource[];
}) {
  const canBrowseSources = usePermission('canBrowseSources');

  const [searchValue, setSearchValue] = React.useState(formState.searchKeyword || "");
  const [debouncedSearchValue] = useDebounce(searchValue, 800);

  // Only fetch available search sources if user has permission to browse/select them
  const { data: allAvailableSources = [] } = useAvailableSearchSources(canBrowseSources);

  const availableSources = allAvailableSources;

  // State for selected search sources
  const [selectedSources, setSelectedSources] = React.useState<string[]>([]);
  // Debounce the selected sources to prevent too frequent searches when changing sources
  const [debouncedSelectedSources] = useDebounce(selectedSources, 3000);

  // Key for localStorage - make it unique for different modes
  const LOCAL_STORAGE_KEY = existingSources && existingSources.length > 0
    ? 'kaizoku.selectedSources.addSources'
    : 'kaizoku.selectedSources.addSeries';

  // Refs to track state and prevent race conditions
  const initializationState = React.useRef<{
    isInitialized: boolean;
    lastAvailableSourceIds: string[];
    hasRestoredFromStorage: boolean;
  }>({
    isInitialized: false,
    lastAvailableSourceIds: [],
    hasRestoredFromStorage: false
  });

  // Single effect to handle all initialization and updates
  React.useEffect(() => {
    if (availableSources.length === 0) return;

    const currentSourceIds = availableSources.map(s => s.mihonProviderId).sort();
    const state = initializationState.current;

    // Check if this is the first initialization
    if (!state.isInitialized) {// Try to restore from localStorage
      let restoredSources: string[] = [];
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            // Validate restored sources against current available sources
            restoredSources = parsed.filter((id): id is string =>
              typeof id === 'string' && currentSourceIds.includes(id)
            );
          }
        }
      } catch (error) {
        console.warn('[SearchSeriesStep] Failed to parse stored sources:', error);
      }

      // Determine what sources to select
      const sourcesToSelect = restoredSources.length > 0 ? restoredSources : currentSourceIds;// Update state
      setSelectedSources(sourcesToSelect);
      state.isInitialized = true;
      state.lastAvailableSourceIds = currentSourceIds;
      state.hasRestoredFromStorage = restoredSources.length > 0;return;
    }

    // Check if available sources changed (after initialization)
    const sourcesChanged =
      currentSourceIds.length !== state.lastAvailableSourceIds.length ||
      !currentSourceIds.every((id, i) => id === state.lastAvailableSourceIds[i]);

    if (sourcesChanged) {// When sources change, reset to all sources
      setSelectedSources(currentSourceIds);
      state.lastAvailableSourceIds = currentSourceIds;
      state.hasRestoredFromStorage = false;
    }
  }, [availableSources]);

  // Save selection to localStorage whenever it changes (after initialization)
  React.useEffect(() => {
    if (initializationState.current.isInitialized && selectedSources.length > 0) {localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(selectedSources));
    }
  }, [selectedSources]);

  // When user has CanBrowseSources: search with their selected sources
  // When user does NOT have CanBrowseSources: search all sources (don't pass searchSources, backend defaults to all)
  const searchSourcesParam = canBrowseSources
    ? (debouncedSelectedSources.length > 0 ? debouncedSelectedSources : undefined)
    : undefined;

  const isSearchReady = canBrowseSources
    ? debouncedSearchValue.length >= 3 && debouncedSelectedSources.length > 0
    : debouncedSearchValue.length >= 3;

  const { data: searchResults, isLoading, error, isFetching } = useSearchSeries(
    {
      keyword: debouncedSearchValue,
      searchSources: searchSourcesParam
    },
    { enabled: isSearchReady }
  );

  React.useEffect(() => {
    if (searchResults) {
      setFormState(prev => {
        // Validate existing selections against new search results
        const newSearchResultIds = searchResults.map(series => series.mihonId ?? series.providerId);
        const validatedSelections = prev.selectedLinkedSeries.filter(selectedId =>
          newSearchResultIds.includes(selectedId)
        );

        return {
          ...prev,
          allLinkedSeries: searchResults,
          searchKeyword: debouncedSearchValue,
          selectedLinkedSeries: validatedSelections,
        };
      });
    }
  }, [searchResults, debouncedSearchValue, setFormState]);

  React.useEffect(() => {
    // Only set loading when we're fetching and don't have any search results yet
    // Don't keep loading state active if user has already made selections
    const shouldBeLoading = (isLoading || isFetching) && !searchResults;
    setIsLoading(shouldBeLoading);
  }, [isLoading, isFetching, searchResults, setIsLoading]);

  React.useEffect(() => {
    if (error) {
      setError(error.message);
    } else {
      setError(null);
    }
  }, [error, setError]);

  React.useEffect(() => {
    // Enable progress immediately when user has made selections, regardless of loading state
    const hasSelections = formState.selectedLinkedSeries.length > 0;
    setCanProgress(hasSelections);
  }, [formState.selectedLinkedSeries, setCanProgress]);

  const getSeriesId = (series: LinkedSeries): string => series.mihonId ?? series.providerId;

  const handleSeriesToggle = (seriesId: string, checked: boolean) => {
    setFormState(prev => {
      let newSelection = [...prev.selectedLinkedSeries];
      const allSeries = prev.allLinkedSeries;

      if (checked) {
        // Add the clicked series
        newSelection.push(seriesId);

        // Only auto-select linked series if this is the first selection
        if (prev.selectedLinkedSeries.length === 0) {
          const series = allSeries.find((s: LinkedSeries) => getSeriesId(s) === seriesId);
          if (series) {
            // Add linked series automatically only on first selection
            series.linkedIds.forEach((linkedId: string) => {
              if (!newSelection.includes(linkedId)) {
                newSelection.push(linkedId);
              }
            });
          }
        }
      } else {
        // Remove only the clicked series (normal multi-select behavior)
        newSelection = newSelection.filter(id => id !== seriesId);
      }
      return {
        ...prev,
        selectedLinkedSeries: newSelection,
      };
    });
  };

  const isSeriesSelected = (seriesId: string) => {
    return formState.selectedLinkedSeries.includes(seriesId);
  };

  const allSeries = formState.allLinkedSeries;

  // Local-only focused row tracking — purely visual, not in AddSeriesState
  const [lastFocusedId, setLastFocusedId] = React.useState<string | null>(null);

  const activeSourceCount = canBrowseSources ? selectedSources.length : availableSources.length;
  const isSearching = (isLoading || isFetching) && debouncedSearchValue.length >= 3;
  const hasQuery = searchValue.length > 0;
  const hasResults = allSeries.length > 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Source filter pills */}
      {canBrowseSources && (
        <div className="src-pill-row">
          {availableSources.map((source) => {
            const isActive = selectedSources.includes(source.mihonProviderId);
            return (
              <button
                key={source.mihonProviderId}
                type="button"
                className={`src-pill${isActive ? " active" : ""}`}
                data-active={isActive}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setSelectedSources(prev => {
                    if (prev.includes(source.mihonProviderId)) {
                      // Keep at least one source selected
                      if (prev.length === 1) return prev;
                      return prev.filter(id => id !== source.mihonProviderId);
                    } else {
                      return [...prev, source.mihonProviderId];
                    }
                  });
                }}
              >
                <span
                  className="swatch"
                  style={{ background: swatchForSource(source.mihonProviderId) }}
                />
                {source.provider}
              </button>
            );
          })}
        </div>
      )}

      {/* Command card */}
      <div className="cmd-card">
        {/* Search input row */}
        <div className="cmd-input-wrap">
          <Search className="icon" style={{ width: 22, height: 22 }} />
          <input
            className="cmd-input"
            type="search"
            placeholder="Search for a series…"
            autoFocus
            value={searchValue}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setSearchValue(e.target.value)}
          />
          {isSearching ? (
            <span className="cmd-tag font-mono">
              <span className="dot" />
              Searching…
            </span>
          ) : (
            <span className="cmd-tag font-mono">
              <span className="dot" />
              Searching{" "}
              <b style={{ color: "hsl(var(--as-fg))", marginLeft: 2 }}>
                {activeSourceCount} source{activeSourceCount !== 1 ? "s" : ""}
              </b>
            </span>
          )}
        </div>

        {/* Results area */}
        {error ? (
          <div
            className="flex items-center gap-2 px-5 py-3"
            style={{ color: "hsl(0 72% 51%)", fontSize: 12 }}
          >
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span>{error.message}</span>
          </div>
        ) : !hasQuery ? (
          <div className="res-list">
            <p
              className="stage-label"
              style={{ justifyContent: "center", opacity: 0.45, fontSize: 13, padding: "24px 22px" }}
            >
              Start typing to search…
            </p>
          </div>
        ) : !hasResults && !isSearching ? (
          <div className="res-list">
            <p
              style={{
                color: "hsl(var(--as-fg-muted))",
                fontSize: 13,
                padding: "24px 22px",
                textAlign: "center",
              }}
            >
              {debouncedSearchValue.length < 3
                ? "Keep typing — search starts at 3 characters"
                : "No results found"}
            </p>
          </div>
        ) : (
          <div className="res-list" data-vaul-no-drag>
            {allSeries.map((series) => {
              const seriesId = getSeriesId(series);
              const isSelected = isSeriesSelected(seriesId);
              const isFocused = lastFocusedId === seriesId;

              return (
                <div
                  key={seriesId}
                  className={`res-row${isSelected ? " selected" : ""}${isFocused ? " focused" : ""}`}
                  onClick={() => {
                    handleSeriesToggle(seriesId, !isSelected);
                    setLastFocusedId(seriesId);
                  }}
                >
                  {/* Slot 1: accent bar */}
                  <div
                    className="accent"
                    style={isSelected ? { background: "hsl(var(--primary))" } : undefined}
                  />

                  {/* Slot 2: cover thumbnail */}
                  <div className="res-cv">
                    <Image
                      src={formatThumbnailUrl(series.thumbnailUrl)}
                      alt={series.title}
                      fill
                      sizes="(max-width: 640px) 44px, 48px"
                      className="object-cover"
                    />
                  </div>

                  {/* Slot 3: body */}
                  <div className="res-body">
                    <div className="res-title">{series.title}</div>
                    <div className="res-meta">
                      <span className="src-badge">
                        <span
                          className="sw"
                          style={{ background: swatchForSource(series.provider ?? "") }}
                        />
                        {series.provider}
                      </span>
                      <ReactCountryFlag
                        countryCode={getCountryCodeForLanguage(series.lang)}
                        svg
                        style={{ width: 16, height: 12 }}
                        title={`${series.lang.toUpperCase()} (${getCountryCodeForLanguage(series.lang)})`}
                      />
                      <span className="sep">·</span>
                      <span className="num-wrap">
                        {"—"}
                      </span>
                    </div>
                  </div>

                  {/* Slot 4: selected indicator */}
                  <div className="res-tail">
                    {isSelected && (
                      <span
                        className="return-hint"
                        style={{ opacity: 1, fontFamily: "var(--font-mono, monospace)", fontSize: 10 }}
                      >
                        ✓ added
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
