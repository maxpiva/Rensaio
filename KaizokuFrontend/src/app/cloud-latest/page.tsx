"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { getResponsiveCardDefault } from "@/lib/utils/responsive-card-default";
import { Globe, Tag, X, Check, Search, Compass, Plus } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { useSearch } from "@/contexts/search-context";
import { RibbonSlot } from "@/components/kzk/layout/ribbon";
import { useSearchSources, useLatest, useLatestGenres } from "@/lib/api/hooks/useSeries";
import { seriesService } from "@/lib/api/services/seriesService";
import { useQueryClient } from '@tanstack/react-query';
import { CloudLatestGrid } from "@/components/kzk/series/cloud-latest-grid";
import { InLibraryStatus, type LatestSeriesInfo, type LatestGenre } from "@/lib/api/types";
import { useDebounce } from "@/lib/hooks/useDebounce";
import {
  SpotlightHero,
  type SpotlightItem,
} from "@/components/kzk/series/spotlight-hero";
import { AddSeries } from "@/components/kzk/series/add-series";

const ITEMS_PER_PAGE = 40; // Increased to ensure screen fill
const MAX_VISIBLE_GENRES = 200;
const TAG_POPOVER_MAX_WIDTH_PX = 352; // matches w-[min(22rem,calc(100vw-2rem))] on the popover root

// Calculate optimal items per page based on card width and screen size
function calculateItemsPerPage(cardWidth: string): number {
  // Card width mappings (in rem, then converted to px)
  const cardWidths: Record<string, number> = {
    "w-20": 5 * 16,    // 80px
    "w-32": 8 * 16,    // 128px
    "w-45": 11.25 * 16, // 180px
    "w-58": 14.5 * 16,  // 232px
    "w-70": 17.5 * 16,  // 280px
  };

  const cardWidthPx = cardWidths[cardWidth] || 180; // Default to medium
  const gap = 16; // 1rem gap
  const aspectRatio = 4/6; // Card aspect ratio
  const cardHeight = cardWidthPx / aspectRatio; // ~270px for medium

  // Estimate screen dimensions
  const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
  const screenHeight = typeof window !== "undefined" ? window.innerHeight : 1080;

  // Account for sidebar, padding, header (roughly 300px total)
  const availableWidth = screenWidth - 300;
  const availableHeight = screenHeight - 200;

  // Calculate columns and rows that fit on screen
  const columns = Math.floor((availableWidth + gap) / (cardWidthPx + gap));
  const rows = Math.floor((availableHeight + gap) / (cardHeight + gap));

  // We want to fetch 2-3 screens worth to ensure infinite scroll works
  const itemsPerScreen = Math.max(columns * rows, 12); // Minimum 12 items
  const optimalFetch = Math.max(itemsPerScreen * 2, 40); // At least 2 screens worth, minimum 40

  return optimalFetch;
}

// Session storage keys for the cloud-latest page.
const SESSION_KEYS = {
  sourceId: "kzk_cloud_sourceId",
  cardWidth: "kzk_cloud_cardWidth",
  search: "kzk_cloud_search",
  genres: "kzk_cloud_genres",
};

// Read a value from sessionStorage, returning fallback when absent or empty.
function getSessionValue(key: string, fallback: string | null): string | null {
  if (typeof window === "undefined") return fallback;
  const value = sessionStorage.getItem(key);
  return value !== null && value !== "" ? value : fallback;
}

function getSessionGenres(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.genres);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
    return [];
  } catch {
    return [];
  }
}

// Match the cache-key shape used by useLatest so manual setQueryData hits.
function buildGenreKey(genres: string[]): string[] {
  return genres
    .map((g) => g.trim().toLowerCase())
    .filter((g) => g.length > 0)
    .sort();
}

export default function CloudLatestPage() {
  const router = useRouter();

  // Add Series modal (controlled) — opened from the spotlight CTA with the
  // active spotlight item's title prefilled as the search keyword.
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalTitle, setAddModalTitle] = useState<string | undefined>(
    undefined,
  );

  const [selectedSourceId, setSelectedSourceIdState] = useState<string | null>(
    getSessionValue(SESSION_KEYS.sourceId, null)
  );
  const [cardWidth, setCardWidthState] = useState<string>(getSessionValue(SESSION_KEYS.cardWidth, getResponsiveCardDefault())!);
  const [selectedGenres, setSelectedGenresState] = useState<string[]>(getSessionGenres());
  const [items, setItems] = useState<LatestSeriesInfo[]>([]);
  // The spotlight pool is derived from the FIRST page of results only — it
  // must not change as the user scrolls and more pages arrive. We snapshot
  // here whenever currentPage === 0 returns data.
  const [firstPageItems, setFirstPageItems] = useState<LatestSeriesInfo[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Tag-filter popover state
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const tagPopoverRef = useRef<HTMLDivElement | null>(null);
  const tagButtonRef = useRef<HTMLButtonElement | null>(null);
  const tagSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [tagPopoverPos, setTagPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Track user activity for periodic refresh logic
  const lastActivityRef = useRef<number>(Date.now());
  const lastLatestDataRef = useRef<LatestSeriesInfo[] | null>(null);
  const queryClient = useQueryClient();

  // Calculate dynamic items per page based on card size
  const itemsPerPage = useMemo(() => {
    return calculateItemsPerPage(cardWidth);
  }, [cardWidth]);

  // Debounce card width changes to prevent race conditions
  const debouncedCardWidth = useDebounce(cardWidth, 300);

  // Wrap setters to also update sessionStorage
  const setSelectedSourceId = (v: string | null) => {
    setSelectedSourceIdState(v);
    sessionStorage.setItem(SESSION_KEYS.sourceId, v ?? "");
  };

  const setCardWidth = (v: string) => {
    setCardWidthState(v);
    sessionStorage.setItem(SESSION_KEYS.cardWidth, v);
  };

  const setSelectedGenres = useCallback(
    (next: string[]) => {
      setSelectedGenresState(next);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(SESSION_KEYS.genres, JSON.stringify(next));
      }
    },
    [SESSION_KEYS.genres]
  );

  const toggleGenre = useCallback(
    (name: string) => {
      setSelectedGenresState((prev) => {
        const exists = prev.includes(name);
        const next = exists ? prev.filter((g) => g !== name) : [...prev, name];
        if (typeof window !== "undefined") {
          sessionStorage.setItem(SESSION_KEYS.genres, JSON.stringify(next));
        }
        return next;
      });
    },
    [SESSION_KEYS.genres]
  );

  const clearGenres = useCallback(() => {
    setSelectedGenres([]);
  }, [setSelectedGenres]);

  const { debouncedSearchTerm } = useSearch();
  const { data: sources } = useSearchSources();
  const { data: genresData, isLoading: isGenresLoading } = useLatestGenres();

  // Card width options (same as main page)
  const cardWidthOptions = [
    { value: "w-20", label: "XS", text: "text-[0.4rem]" },
    { value: "w-32", label: "S", text: "text-xs" },
    { value: "w-45", label: "M", text: "text-sm" },
    { value: "w-58", label: "L", text: "text-base" },
    { value: "w-70", label: "XL", text: "text-lg" },
  ];

  // Sync search box value in sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchInput = document.querySelector<HTMLInputElement>(
      "input[type='search'], input[type='text'][placeholder*='search']"
    );
    if (!searchInput) return;
    // Set initial value
    const saved = sessionStorage.getItem(SESSION_KEYS.search);
    if (saved && searchInput.value !== saved) searchInput.value = saved;
    // Save on change
    const handler = (e: Event) => {
      const target = e.target as HTMLInputElement;
      sessionStorage.setItem(SESSION_KEYS.search, target.value);
    };
    searchInput.addEventListener("input", handler);
    return () => searchInput.removeEventListener("input", handler);
  }, [SESSION_KEYS.search]);

  // Memoize a stable signature of selectedGenres so reset effect only fires
  // on actual content change (not array identity churn).
  const selectedGenresSignature = useMemo(
    () => buildGenreKey(selectedGenres).join("|"),
    [selectedGenres]
  );

  // Reset pagination when filters change (but NOT for card width changes)
  useEffect(() => {
    setItems([]);
    setFirstPageItems([]);
    setCurrentPage(0);
    setHasMore(true);
  }, [debouncedSearchTerm, selectedSourceId, selectedGenresSignature]);

  // Calculate dynamic items per page based on debounced card size for API calls
  const debouncedItemsPerPage = useMemo(() => {
    return calculateItemsPerPage(debouncedCardWidth);
  }, [debouncedCardWidth]);

  // Genres to pass to the API/hook — undefined when none selected so callers
  // can treat it as "no filter" and skip the param entirely.
  const genresArg = useMemo(
    () => (selectedGenres.length > 0 ? selectedGenres : undefined),
    [selectedGenres]
  );

  // Fetch latest series data
  const { data: latestData, isLoading, error } = useLatest(
    currentPage * debouncedItemsPerPage,
    debouncedItemsPerPage,
    selectedSourceId ?? undefined,
    debouncedSearchTerm ?? undefined,
    genresArg,
    true
  );

  // Check if we need to load more items when card size changes
  useEffect(() => {
    if (!items.length) return; // Don't trigger on initial load or filter changes

    const currentItemsOnScreen = items.length;
    const newRequiredItems = debouncedItemsPerPage;

    // If we need more items to fill the screen and we have more available
    if (currentItemsOnScreen < newRequiredItems && hasMore && !isLoading && !isLoadingMore) {
      setIsLoadingMore(true);
      setCurrentPage(prev => prev + 1);
    }
  }, [debouncedItemsPerPage, items.length, hasMore, isLoading, isLoadingMore]);

  // Track user activity (mouse, keyboard, touch events)
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];

    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, []);

  // Periodic refresh of latest data when user is idle
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      const oneMinuteInMs = 60 * 1000;

      // Only refresh if user has been idle for at least 1 minute
      if (timeSinceLastActivity < oneMinuteInMs) return;

      try {
        // Get fresh data from server for the first page only
        const refreshGenres = selectedGenres.length > 0 ? selectedGenres : undefined;
        const freshLatestData = await seriesService.getLatest(
          0, // Always refresh first page
          debouncedItemsPerPage,
          selectedSourceId ?? undefined,
          debouncedSearchTerm ?? undefined,
          refreshGenres
        );

        // Compare with previous data using memo-like logic
        const hasChanges = !lastLatestDataRef.current ||
          JSON.stringify(lastLatestDataRef.current) !== JSON.stringify(freshLatestData);

        if (hasChanges) {
          // Update the query cache with fresh data. The key shape MUST match
          // useLatest's queryKey: ['series', 'latest', start, count, sourceId, keyword, genreKey]
          const genreKey = buildGenreKey(selectedGenres);
          queryClient.setQueryData(
            ['series', 'latest', 0, debouncedItemsPerPage, selectedSourceId ?? undefined, debouncedSearchTerm ?? undefined, genreKey],
            freshLatestData
          );

          // Store the new data for next comparison
          lastLatestDataRef.current = freshLatestData;

          if (process.env.NODE_ENV !== "production") {
            console.log('Latest data refreshed due to changes detected (user idle)');
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error('Failed to refresh latest data:', error);
        }
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [selectedSourceId, debouncedSearchTerm, debouncedItemsPerPage, selectedGenres, queryClient]);

  // Store latest data for comparison on each update
  useEffect(() => {
    if (latestData && currentPage === 0) {
      lastLatestDataRef.current = latestData;
    }
  }, [latestData, currentPage]);

  // Update items when new data arrives
  useEffect(() => {
    if (latestData) {
      if (currentPage === 0) {
        // First page - replace all items and snapshot for the spotlight pool
        setItems(latestData);
        setFirstPageItems(latestData);
      } else {
        // Subsequent pages - append items
        setItems(prevItems => [...prevItems, ...latestData]);
      }

      // Since the Latest endpoint doesn't provide metadata about total count,
      // we infer hasMore from the response size:
      // - If we get exactly debouncedItemsPerPage items, there are likely more
      // - If we get fewer than debouncedItemsPerPage items, we've reached the end
      setHasMore(latestData.length >= debouncedItemsPerPage);
      setIsLoadingMore(false);
    }
  }, [latestData, currentPage, debouncedItemsPerPage]);

  // Load more function for infinite scroll
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore) return;

    setIsLoadingMore(true);
    setCurrentPage(prev => prev + 1);
  }, [hasMore, isLoading, isLoadingMore]);

  // Sorted sources for the select
  const sortedSources = useMemo(() => {
    if (!sources) return [];
    return [...sources].sort((a, b) => a.provider.localeCompare(b.provider));
  }, [sources]);

  // Spotlight pool — derived from the first page of latest results. Filters
  // out series that are already in the library, shuffles randomly, and caps
  // at 5. Random (not top-N-by-fetchDate) because the user will already see
  // the freshest items in the grid directly below the hero — surfacing them
  // again is redundant. Browse is for discovery, so randomness widens the
  // chance of showing something the user wouldn't have scrolled into.
  // Re-shuffles only when filters refresh the first page (source / genre /
  // search change), so the hero stays stable while paginating.
  const spotlightItems = useMemo<SpotlightItem[]>(() => {
    if (!firstPageItems || firstPageItems.length === 0) return [];
    const notInLibrary = firstPageItems.filter(
      (s) => s.inLibrary === InLibraryStatus.NotInLibrary,
    );
    // Fisher–Yates shuffle on a copy, then take 5. Plain temp-swap (not the
    // destructure idiom) so it cooperates with noUncheckedIndexedAccess.
    const shuffled = [...notInLibrary];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    return shuffled.slice(0, 5).map((s): SpotlightItem => ({
      // mihonId is the catalog id; we coerce to string for the SpotlightItem.
      id: s.seriesId ?? s.mihonId,
      title: s.title,
      author: s.author,
      description: s.description,
      thumbnailUrl: s.thumbnailUrl,
      status: s.status,
      genres: s.genre,
      availableChapters: s.chapterCount,
      provider: s.provider,
      sourceName: s.provider,
    }));
  }, [firstPageItems]);

  // Browse spotlight CTA: if the candidate already has a backing seriesId
  // (e.g. became InLibrary mid-session), navigate to its detail page;
  // otherwise open the AddSeries modal pre-filled with the title so the
  // search step kicks off immediately.
  const handleSpotlightAdd = useCallback(
    (item: SpotlightItem) => {
      const raw = firstPageItems.find(
        (s) => (s.seriesId ?? s.mihonId) === item.id,
      );
      if (raw?.seriesId) {
        router.push(`/library/series?id=${raw.seriesId}`);
        return;
      }
      setAddModalTitle(item.title);
      setAddModalOpen(true);
    },
    [firstPageItems, router],
  );

  // Filtered tag list for the popover. Backend already sorts by count desc,
  // so we preserve that order and just cap at MAX_VISIBLE_GENRES.
  const filteredGenres = useMemo<LatestGenre[]>(() => {
    const list = genresData ?? [];
    const term = tagSearch.trim().toLowerCase();
    const filtered = term
      ? list.filter((g) => g.name.toLowerCase().includes(term))
      : list;
    return filtered.slice(0, MAX_VISIBLE_GENRES);
  }, [genresData, tagSearch]);

  // Click-outside + Escape to close the tag popover.
  useEffect(() => {
    if (!tagPopoverOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (tagPopoverRef.current?.contains(target)) return;
      if (tagButtonRef.current?.contains(target)) return;
      setTagPopoverOpen(false);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTagPopoverOpen(false);
        tagButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    // Focus the search input shortly after open for keyboard users.
    const t = window.setTimeout(() => tagSearchInputRef.current?.focus(), 0);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [tagPopoverOpen]);

  // Compute & track the popover's fixed position relative to the trigger
  // button. Recomputes on open, resize, and scroll so the popover stays
  // anchored even when the user scrolls the page.
  useEffect(() => {
    if (!tagPopoverOpen) {
      setTagPopoverPos(null);
      return;
    }

    let rafId: number | null = null;

    const compute = () => {
      rafId = null;
      const btn = tagButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const popoverWidth = Math.min(TAG_POPOVER_MAX_WIDTH_PX, window.innerWidth - 32);
      const maxLeft = window.innerWidth - popoverWidth - 16;
      const left = Math.max(16, Math.min(rect.left, maxLeft));
      setTagPopoverPos({
        top: rect.bottom + 8,
        left,
        width: popoverWidth,
      });
    };

    const schedule = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(compute);
    };

    compute(); // immediate on open
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [tagPopoverOpen]);

  const tagButtonLabel = useMemo(() => {
    if (selectedGenres.length === 0) return "Tags";
    if (selectedGenres.length === 1) return `Tag: ${selectedGenres[0]!}`;
    return `Tags · ${selectedGenres.length}`;
  }, [selectedGenres]);

  return (
    <>
      {/* Browse contextual ribbon — portaled into the command bar */}
      <RibbonSlot>
        <div className="flex w-full items-center gap-2">
          {/* Source picker */}
          <div className="w-40 sm:w-48 shrink-0">
            <Select
              value={selectedSourceId ?? "__ALL__"}
              onValueChange={(value) => setSelectedSourceId(value === "__ALL__" ? null : value)}
            >
              <SelectTrigger className="w-full !pr-2 caret-transparent h-8 text-xs sm:text-sm">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">
                  <div className="flex items-center gap-2">
                    <Globe size={16} />
                    <span>All Sources</span>
                  </div>
                </SelectItem>
                {sortedSources.map((source) => (
                  <SelectItem key={source.mihonProviderId} value={source.mihonProviderId}>
                    <div className="flex items-center gap-2">
                      {source.language === "all" ? (
                        <Globe size={16} />
                      ) : (
                        <ReactCountryFlag
                          countryCode={getCountryCodeForLanguage(source.language)}
                          svg
                          style={{
                            width: "16px",
                            height: "12px",
                          }}
                          title={`${source.language.toUpperCase()}`}
                        />
                      )}
                      <span>{source.provider}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tag popover — anchored to the trigger button; opens below the ribbon. */}
          <div className="relative shrink-0">
            <Button
              ref={tagButtonRef}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 justify-between gap-2 bg-card font-normal text-xs sm:text-sm"
              aria-haspopup="dialog"
              aria-expanded={tagPopoverOpen}
              onClick={() => setTagPopoverOpen((o) => !o)}
            >
              <Tag className="h-4 w-4 opacity-70" />
              <span className="truncate max-w-[10rem]">{tagButtonLabel}</span>
              {selectedGenres.length > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-none text-primary-foreground">
                  {selectedGenres.length}
                </span>
              )}
            </Button>

            {tagPopoverOpen && tagPopoverPos && createPortal(
              <div
                ref={tagPopoverRef}
                role="dialog"
                aria-label="Filter by tags"
                style={{
                  position: "fixed",
                  top: tagPopoverPos.top,
                  left: tagPopoverPos.left,
                  width: tagPopoverPos.width,
                }}
                className="z-50 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
              >
                <div className="flex items-center gap-2 border-b border-border/60 px-2 py-2">
                  <Search className="h-4 w-4 shrink-0 opacity-60" />
                  <Input
                    ref={tagSearchInputRef}
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags…"
                    className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto py-1">
                  {isGenresLoading ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Loading tags…
                    </div>
                  ) : filteredGenres.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {(genresData?.length ?? 0) === 0
                        ? "No tags available yet"
                        : "No tags match your search"}
                    </div>
                  ) : (
                    <ul className="flex flex-col">
                      {filteredGenres.map((g) => {
                        const isChecked = selectedGenres.includes(g.name);
                        return (
                          <li key={g.name}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={isChecked}
                              onClick={() => toggleGenre(g.name)}
                              className="group flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                                  isChecked
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-input bg-transparent"
                                }`}
                              >
                                {isChecked && <Check className="h-3 w-3" />}
                              </span>
                              <span className="flex-1 truncate">{g.name}</span>
                              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                                {g.count}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {selectedGenres.length > 0 && (
                  <div className="flex items-center justify-between border-t border-border/60 px-2 py-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedGenres.length} selected
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={clearGenres}
                    >
                      Clear all
                    </Button>
                  </div>
                )}
              </div>,
              document.body,
            )}
          </div>

          {/* Right cluster: card size */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="w-14 sm:w-16">
              <Select value={cardWidth} onValueChange={setCardWidth}>
                <SelectTrigger className="w-full !pr-2 caret-transparent h-8 text-xs sm:text-sm">
                  <SelectValue placeholder="Card Size" />
                </SelectTrigger>
                <SelectContent>
                  {cardWidthOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </RibbonSlot>

      {/* Cinematic spotlight — only renders once the first page has resolved
          to at least one non-InLibrary candidate. Hidden during the very
          first load to avoid jumpy layout. */}
      {isLoading && currentPage === 0 && firstPageItems.length === 0 ? (
        <div
          aria-hidden
          className="mb-6 h-[420px] w-full animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]"
        />
      ) : spotlightItems.length > 0 ? (
        <div className="mb-6 sm:mb-8">
          <SpotlightHero
            variant="browse"
            items={spotlightItems}
            eyebrow="DISCOVER · From your sources"
            eyebrowIcon={Compass}
            ctaLabel="Add to library"
            ctaIcon={Plus}
            onCtaClick={handleSpotlightAdd}
          />
        </div>
      ) : null}

      {/* Controlled Add-Series modal launched by the spotlight CTA. The
          existing AddSeries component already seeds its `searchKeyword`
          form-state from the `title` prop, so passing the spotlight item's
          title prefills the search step. The visible trigger is hidden — we
          drive `open` externally. */}
      <AddSeries
        title={addModalTitle}
        open={addModalOpen}
        onOpenChange={(v) => {
          setAddModalOpen(v);
          if (!v) setAddModalTitle(undefined);
        }}
        triggerButton={<span aria-hidden className="hidden" />}
      />

      {selectedGenres.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedGenres.map((name) => (
            <Badge
              key={name}
              variant="secondary"
              className="group inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-0.5 text-xs font-normal text-secondary-foreground hover:bg-secondary"
            >
              <span className="truncate max-w-[12rem]">{name}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => toggleGenre(name)}
                className="-mr-1 ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={clearGenres}
            className="ml-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="pt-4">
        <CloudLatestGrid
          items={items}
          isLoading={isLoading && currentPage === 0}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          error={error}
          cardWidth={cardWidth}
          cardWidthOptions={cardWidthOptions}
        />
      </div>
    </>
  );
}
