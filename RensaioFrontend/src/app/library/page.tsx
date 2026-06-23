"use client";

// All rendering happens on the client for static export compatibility

import { useState, useMemo, useCallback } from "react";
import { AddSeries } from "@/components/comp/series/add-series";
import { ListSeries } from "@/components/comp/series/list-series";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { PageLayout } from "@/components/comp/layout/page-layout";
import { RibbonSlot } from "@/components/comp/layout/ribbon";
import { SeriesStatus, type SeriesInfo } from "@/lib/api/types";
import { useLibrary } from "@/lib/api/hooks/useSeries";
import { useSettings } from "@/lib/api/hooks/useSettings";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { usePermission } from "@/hooks/use-permission";
import { useQueryClient } from "@tanstack/react-query";
import { getResponsiveCardDefault } from "@/lib/utils/responsive-card-default";

// Session storage keys for the library page.
const SESSION_KEYS = {
  tab: "kzk_tab",
  genre: "kzk_genre",
  provider: "kzk_provider",
  category: "kzk_category",
  orderBy: "kzk_orderBy",
  cardWidth: "kzk_cardWidth",
};

// Read a value from sessionStorage, returning fallback when absent or empty.
function getSessionValue(key: string, fallback: string | null): string | null {
  if (typeof window === "undefined") return fallback;
  const value = sessionStorage.getItem(key);
  return value !== null && value !== "" ? value : fallback;
}

export default function RootPage() {
  const queryClient = useQueryClient();
  const canBrowseSources = usePermission('canBrowseSources');
  const { data: settings } = useSettings();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["series", "library"] });
  }, [queryClient]);

  const [tab, setTabState] = useState<string>(getSessionValue(SESSION_KEYS.tab, "all")!);
  const [selectedGenre, setSelectedGenreState] = useState<string | null>(getSessionValue(SESSION_KEYS.genre, null));
  const [selectedProvider, setSelectedProviderState] = useState<string | null>(getSessionValue(SESSION_KEYS.provider, null));
  const [selectedCategory, setSelectedCategoryState] = useState<string | null>(getSessionValue(SESSION_KEYS.category, null));
  const [orderBy, setOrderByState] = useState<string>(getSessionValue(SESSION_KEYS.orderBy, "title")!);
  const [cardWidth, setCardWidthState] = useState<string>(getSessionValue(SESSION_KEYS.cardWidth, getResponsiveCardDefault())!);

  // Wrap setters to also update sessionStorage
  const setTab = (v: string) => { setTabState(v); sessionStorage.setItem(SESSION_KEYS.tab, v); };
  const setSelectedGenre = (v: string | null) => { setSelectedGenreState(v); sessionStorage.setItem(SESSION_KEYS.genre, v ?? ""); };
  const setSelectedProvider = (v: string | null) => { setSelectedProviderState(v); sessionStorage.setItem(SESSION_KEYS.provider, v ?? ""); };
  const setSelectedCategory = (v: string | null) => { setSelectedCategoryState(v); sessionStorage.setItem(SESSION_KEYS.category, v ?? ""); };
  const setOrderBy = (v: string) => { setOrderByState(v); sessionStorage.setItem(SESSION_KEYS.orderBy, v); };
  const setCardWidth = (v: string) => { setCardWidthState(v); sessionStorage.setItem(SESSION_KEYS.cardWidth, v); };

  const { data: library } = useLibrary();

  // Debug and deduplicate library data to prevent duplicate keys
  const deduplicatedLibrary = useMemo(() => {
    if (!library) return library;

    const seen = new Set<string>();
    const duplicates: string[] = [];
    const unique: SeriesInfo[] = [];

    library.forEach((series) => {
      if (seen.has(series.id)) {
        duplicates.push(series.title);
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[Library] Duplicate series detected: ${series.title} (ID: ${series.id})`);
        }
      } else {
        seen.add(series.id);
        unique.push(series);
      }
    });

    if (duplicates.length > 0 && process.env.NODE_ENV !== "production") {
      console.error(`[Library] Found ${duplicates.length} duplicate series:`, duplicates);
    }

    return unique;
  }, [library]);

  const cardWidthOptions = [
    { value: "w-20", label: "XS", text: "text-[0.4rem]" },
    { value: "w-32", label: "S", text: "text-xs" },
    { value: "w-45", label: "M", text: "text-sm" },
    { value: "w-58", label: "L", text: "text-base" },
    { value: "w-70", label: "XL", text: "text-lg" },
  ];

  // Compute unique sorted genres from all series
  const genres = useMemo(() => {
    if (!deduplicatedLibrary) return [];
    const genreSet = new Set<string>();
    deduplicatedLibrary.forEach((series) => {
      series.genre?.forEach((g) => genreSet.add(g));
    });
    return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  }, [deduplicatedLibrary]);

  // Compute unique sorted providers from all series
  const providers = useMemo(() => {
    if (!deduplicatedLibrary) return [];
    const providerSet = new Set<string>();
    deduplicatedLibrary.forEach((series) => {
      series.providers?.forEach((p) => providerSet.add(p.provider));
    });
    return Array.from(providerSet).sort((a, b) => a.localeCompare(b));
  }, [deduplicatedLibrary]);

  // Determine if the categories filter should be shown
  const showCategoriesFilter = settings?.categorizedFolders === true;
  // Categories come from settings, sorted alphabetically
  const categories = useMemo(() => {
    if (!settings?.categories) return [];
    return [...settings.categories].sort((a, b) => a.localeCompare(b));
  }, [settings]);

  // Sorting logic for ListSeries - memoized for performance
  const sortFn = useCallback((a: SeriesInfo, b: SeriesInfo) => {
    if (orderBy === "lastChange") {
      return (b.lastChangeUTC ? new Date(b.lastChangeUTC).getTime() : 0) - (a.lastChangeUTC ? new Date(a.lastChangeUTC).getTime() : 0);
    }
    return a.title.localeCompare(b.title);
  }, [orderBy]);

  // Filtering logic for ListSeries - memoized for performance
  const filterFn = useCallback((series: SeriesInfo) => {
    const matchesTab =
      tab === "completed"
        ? series.status === SeriesStatus.COMPLETED || series.status === SeriesStatus.PUBLISHING_FINISHED
        : tab === "active"
        ? series.status !== SeriesStatus.COMPLETED && series.status !== SeriesStatus.PUBLISHING_FINISHED && series.isActive && !series.pausedDownloads
        : tab === "paused"
        ? series.pausedDownloads
        : tab === "unassigned"
        ? series.hasUnknown === true
        : true;
    const matchesGenre = selectedGenre ? series.genre?.includes(selectedGenre) : true;
    const matchesProvider = selectedProvider ? series.providers?.some((p) => p.provider === selectedProvider) : true;
    const matchesCategory = selectedCategory ? series.category === selectedCategory : true;
    return matchesTab && matchesGenre && matchesProvider && matchesCategory;
  }, [tab, selectedGenre, selectedProvider, selectedCategory]);

  // Count for each tab (with genre, provider, and category filter applied) - memoized for performance
  const { allCount, activeCount, pausedCount, unassignedCount, completedCount } = useMemo(() => {
    if (!deduplicatedLibrary) return { allCount: 0, activeCount: 0, pausedCount: 0, unassignedCount: 0, completedCount: 0 };

    const baseFilter = (series: SeriesInfo) =>
      (!selectedGenre || series.genre?.includes(selectedGenre)) &&
      (!selectedProvider || series.providers?.some((p) => p.provider === selectedProvider)) &&
      (!selectedCategory || series.category === selectedCategory);

    const baseFiltered = deduplicatedLibrary.filter(baseFilter);

    return {
      allCount: baseFiltered.length,
      activeCount: baseFiltered.filter(series =>
        series.status !== SeriesStatus.COMPLETED &&
        series.status !== SeriesStatus.PUBLISHING_FINISHED &&
        series.isActive &&
        !series.pausedDownloads
      ).length,
      pausedCount: baseFiltered.filter(series => series.pausedDownloads).length,
      unassignedCount: baseFiltered.filter(series => series.hasUnknown === true).length,
      completedCount: baseFiltered.filter(series =>
        series.status === SeriesStatus.COMPLETED ||
        series.status === SeriesStatus.PUBLISHING_FINISHED
      ).length,
    };
  }, [deduplicatedLibrary, selectedGenre, selectedProvider, selectedCategory]);

  return (
    <PageLayout mainClassName="p-2 pb-16 sm:px-6 sm:py-4 sm:pb-4 overflow-y-auto">
      {/* Library contextual ribbon — portaled into the command bar */}
      <RibbonSlot>
        <div className="flex w-full items-center gap-2">
          {/* Status filter — single Select with status-colored dots and live
              count badges. Mirrors the cinematic-galaxy mockup's "Status: All"
              dropdown while keeping our existing Select primitive. */}
          <div className="w-36 sm:w-44 shrink-0">
            <Select value={tab} onValueChange={setTab}>
              <SelectTrigger className="w-full !pr-2 caret-transparent h-8 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
                    <span>All</span>
                    {allCount > 0 && (
                      <span className="text-white/40 text-[11px]">{allCount}</span>
                    )}
                  </span>
                </SelectItem>
                <SelectItem value="active">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span>Active</span>
                    {activeCount > 0 && (
                      <span className="text-white/40 text-[11px]">{activeCount}</span>
                    )}
                  </span>
                </SelectItem>
                <SelectItem value="paused">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    <span>Paused</span>
                    {pausedCount > 0 && (
                      <span className="text-white/40 text-[11px]">{pausedCount}</span>
                    )}
                  </span>
                </SelectItem>
                <SelectItem value="unassigned">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>Unassigned</span>
                    {unassignedCount > 0 && (
                      <span className="text-white/40 text-[11px]">{unassignedCount}</span>
                    )}
                  </span>
                </SelectItem>
                <SelectItem value="completed">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    <span>Completed</span>
                    {completedCount > 0 && (
                      <span className="text-white/40 text-[11px]">{completedCount}</span>
                    )}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Categories — only when categorized folders are enabled in settings */}
          {showCategoriesFilter && (
            <div className="w-32 sm:w-40 shrink-0">
              <Select
                value={selectedCategory ?? "__ALL__"}
                onValueChange={(value) => setSelectedCategory(value === "__ALL__" ? null : value)}
              >
                <SelectTrigger className="w-full !pr-2 caret-transparent h-8 text-xs sm:text-sm">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">All Categories</SelectItem>
                  {categories.filter((category) => category).map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Genres */}
          <div className="w-32 sm:w-40 shrink-0">
            <Select
              value={selectedGenre ?? "__ALL__"}
              onValueChange={(value) => setSelectedGenre(value === "__ALL__" ? null : value)}
            >
              <SelectTrigger className="w-full !pr-2 caret-transparent h-8 text-xs sm:text-sm">
                <SelectValue placeholder="All Genres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All Genres</SelectItem>
                {genres.filter((genre) => genre).map((genre) => (
                  <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sources (permission-gated) */}
          {canBrowseSources && (
            <div className="w-32 sm:w-48 shrink-0">
              <Select
                value={selectedProvider ?? "__ALL__"}
                onValueChange={(value) => setSelectedProvider(value === "__ALL__" ? null : value)}
              >
                <SelectTrigger className="w-full !pr-2 caret-transparent h-8 text-xs sm:text-sm">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">All Sources</SelectItem>
                  {providers.filter((provider) => provider).map((provider) => (
                    <SelectItem key={provider} value={provider}>{provider}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Right cluster: sort, card size, add series */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="w-28 sm:w-32">
              <Select value={orderBy} onValueChange={setOrderBy}>
                <SelectTrigger className="w-full !pr-2 caret-transparent h-8 text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Alphabetical</SelectItem>
                  <SelectItem value="lastChange">Last Change</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

            <div className="h-8">
              <AddSeries />
            </div>
          </div>
        </div>
      </RibbonSlot>

      <PullToRefresh onRefresh={handleRefresh}>
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <ListSeries
            filterFn={filterFn}
            sortFn={sortFn}
            cardWidth={cardWidth}
            cardWidthOptions={cardWidthOptions}
            orderBy={orderBy}
            library={deduplicatedLibrary}
          />
        </div>
      </PullToRefresh>
    </PageLayout>
  );
}
