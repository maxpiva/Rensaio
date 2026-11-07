"use client";

import { type AddSeriesState } from "@/components/comp/series/add-series";
import { AlertTriangle, Check, Loader2, Search, X } from "lucide-react";
import { type LinkedSeries, type ExistingSource } from "@/lib/api/types";
import { useSearchSeries, useAvailableSearchSources } from "@/lib/api/hooks/useSearch";
import React from "react";
import { useDebounce } from "use-debounce";
import Image from "next/image";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { usePermission } from "@/hooks/use-permission";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { MultiSelectSources } from "@/components/ui/multi-select-sources";
import { cn } from "@/lib/utils";

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
  const { data: allAvailableSources = [] } = useAvailableSearchSources();

  const availableSources = allAvailableSources;

  // State for selected search sources
  const [selectedSources, setSelectedSources] = React.useState<string[]>([]);
  // Debounce the selected sources to prevent too frequent searches when changing sources
  const [debouncedSelectedSources] = useDebounce(selectedSources, 3000);
  // The selection made once on load, used before the debounce first catches up.
  const [initialSelectedSources, setInitialSelectedSources] = React.useState<string[]>([]);

  // Key for localStorage - make it unique for different modes
  const LOCAL_STORAGE_KEY = existingSources && existingSources.length > 0
    ? 'rensaio.selectedSources.addSources'
    : 'rensaio.selectedSources.addSeries';

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
      setInitialSelectedSources(sourcesToSelect);
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
  // The 3s debounce is only for the user changing sources. The initial
  // selection (restored or "all") arrives right after mount, and waiting 3s
  // for it left the first search idle and showing "No results found". Use
  // that first selection until the debounce has caught up once; after that,
  // every change (including the user's early edits) is debounced normally.
  // "Caught up" means the debounce no longer holds the pre-load placeholder
  // array (compared by identity, so a settled empty selection still counts).
  const preLoadSourcesRef = React.useRef(selectedSources);
  const effectiveSelectedSources =
    debouncedSelectedSources === preLoadSourcesRef.current
      ? initialSelectedSources
      : debouncedSelectedSources;

  const searchSourcesParam = canBrowseSources
    ? (effectiveSelectedSources.length > 0 ? effectiveSelectedSources : undefined)
    : undefined;

  const isSearchReady = canBrowseSources
    ? debouncedSearchValue.length >= 3 && effectiveSelectedSources.length > 0
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

  const isSearching = (isLoading || isFetching) && debouncedSearchValue.length >= 3;
  const hasQuery = searchValue.length > 0;
  const hasResults = allSeries.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search input row — full width, underlined like a ledger entry */}
      <div className="shrink-0 px-5 sm:px-7">
        <div className="group flex items-center gap-3 border-b-2 border-ink/80 pb-2.5 transition-colors focus-within:border-primary">
          <Search className="h-5 w-5 shrink-0 text-ink-3 transition-colors group-focus-within:text-accent-ink" aria-hidden="true" />
          <input
            className="h-11 min-w-0 flex-1 bg-transparent font-serif text-[22px] tracking-[-0.01em] text-ink outline-none placeholder:italic placeholder:text-ink-3 sm:text-[26px] [&::-webkit-search-cancel-button]:appearance-none"
            type="search"
            aria-label="Search for a series"
            placeholder="Search for a series…"
            autoFocus
            value={searchValue}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setSearchValue(e.target.value)}
          />
          {/* Clear — stands in for the native search-field cancel glyph hidden above */}
          {hasQuery && (
            <button
              type="button"
              aria-label="Clear search"
              className="-my-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-9"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSearchValue("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden={!isSearching}>
            {isSearching && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
          </span>
        </div>

        {/* Sources selector — its own row, right-aligned */}
        {canBrowseSources && availableSources.length > 0 && (
          <div
            className="mt-3 flex justify-end"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="w-full sm:w-56">
              <MultiSelectSources
                sources={availableSources}
                selectedSources={selectedSources}
                onSelectionChange={setSelectedSources}
                triggerClassName="h-9 border-rule-2 bg-paper-1 text-[13px] max-sm:h-11"
              />
            </div>
          </div>
        )}
      </div>

      {/* Results area */}
      <div
        className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-7"
        data-vaul-no-drag
      >
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-bad/30 bg-bad-soft px-3 py-2.5 text-[13px] leading-snug text-bad"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{error.message}</span>
          </div>
        ) : !hasQuery ? (
          <SearchNotice>Start typing to search…</SearchNotice>
        ) : !hasResults && !isSearching ? (
          <SearchNotice>
            {debouncedSearchValue.length < 3
              ? "Keep typing — search starts at 3 characters"
              : "No results found"}
          </SearchNotice>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-paper-1">
            {allSeries.map((series) => {
              const seriesId = getSeriesId(series);
              const isSelected = isSeriesSelected(seriesId);
              const isFocused = lastFocusedId === seriesId;

              return (
                <li key={seriesId}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    className={cn(
                      "group relative grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4 sm:px-4",
                      "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:transition-colors",
                      isSelected
                        ? "bg-accent-soft before:bg-primary"
                        : cn("hover:bg-hover before:bg-transparent", isFocused && "bg-hover/60"),
                    )}
                    onClick={() => {
                      handleSeriesToggle(seriesId, !isSelected);
                      setLastFocusedId(seriesId);
                    }}
                  >
                    {/* Cover thumbnail */}
                    <span className="relative block h-[66px] w-11 overflow-hidden rounded-[3px] bg-paper-3 shadow-paper">
                      <Image
                        src={formatThumbnailUrl(series.thumbnailUrl)}
                        alt=""
                        fill
                        sizes="44px"
                        className="object-cover"
                      />
                    </span>

                    {/* Body */}
                    <span className="min-w-0">
                      <span className="line-clamp-2 font-serif text-[15px] font-semibold leading-snug text-ink sm:text-base">
                        {series.title}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="max-w-full truncate rounded-[3px] border border-rule-2 bg-paper px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
                          {series.provider}
                        </span>
                        <ReactCountryFlag
                          countryCode={getCountryCodeForLanguage(series.lang)}
                          svg
                          style={{ width: 16, height: 12, borderRadius: 2 }}
                          title={`${series.lang.toUpperCase()} (${getCountryCodeForLanguage(series.lang)})`}
                        />
                      </span>
                    </span>

                    {/* Selected indicator */}
                    <span className="flex items-center" aria-hidden="true">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent-ink">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                          <span className="max-sm:sr-only">added</span>
                        </span>
                      ) : (
                        <span className="block h-5 w-5 rounded-full border border-rule-2 transition-colors group-hover:border-ink-3" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Quiet centred prompt used for the idle, too-short and no-result states. */
function SearchNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-rule-2 px-6 py-10 text-center">
      <Search className="h-5 w-5 text-ink-3" aria-hidden="true" />
      <p className="font-serif text-[15px] italic text-ink-2">{children}</p>
    </div>
  );
}
