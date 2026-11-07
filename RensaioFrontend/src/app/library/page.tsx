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
import { PageLayout, PageHeader } from "@/components/comp/layout/page-layout";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowDownUp, Folder, Plug, Plus, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { SeriesStatus, type SeriesInfo } from "@/lib/api/types";
import { useLibrary } from "@/lib/api/hooks/useSeries";
import { useSettings } from "@/lib/api/hooks/useSettings";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { usePermission } from "@/hooks/use-permission";
import { useQueryClient } from "@tanstack/react-query";
import { getResponsiveCardDefault } from "@/lib/utils/responsive-card-default";

// Session storage keys for the library page.
const SESSION_KEYS = {
  tab: "ren_tab",
  genre: "ren_genre",
  provider: "ren_provider",
  category: "ren_category",
  orderBy: "ren_orderBy",
  cardWidth: "ren_cardWidth",
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
  const canAddSeries = usePermission('canAddSeries');
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

  const totalCount = deduplicatedLibrary?.length ?? 0;

  const statusTabs: { value: string; label: string; count: number; marker: React.ReactNode }[] = [
    { value: "all", label: "All", count: allCount, marker: null },
    { value: "active", label: "Active", count: activeCount, marker: <span className="h-1.5 w-1.5 rounded-full bg-ok" /> },
    { value: "paused", label: "Paused", count: pausedCount, marker: <span className="h-1.5 w-1.5 rounded-full bg-warn" /> },
    { value: "unassigned", label: "Unassigned", count: unassignedCount, marker: <AlertTriangle className="h-3.5 w-3.5 text-warn" /> },
    { value: "completed", label: "Completed", count: completedCount, marker: <span className="h-1.5 w-1.5 rounded-full bg-info" /> },
  ];

  const filterTrigger =
    "h-9 w-auto min-w-[9.5rem] max-w-[14rem] shrink-0 gap-2 text-[13px] caret-transparent max-sm:h-11 [&>span]:flex [&>span]:items-center [&>span]:gap-2";

  return (
    <PageLayout mainClassName="overflow-y-auto px-4 pt-5 pb-8 sm:px-8 sm:pt-7">
      <PageHeader
        folio="01"
        eyebrow="Library"
        title="The"
        accent="Library"
        meta={[
          `${totalCount} series`,
          orderBy === "lastChange" ? "Newest change first" : "A → Z",
        ]}
        tate="書庫"
        actions={
          <AddSeries
            triggerButton={
              <Button className="gap-1.5 max-sm:h-11">
                <Plus className="h-4 w-4" />
                {canAddSeries ? "Add Series" : "Request Series"}
              </Button>
            }
          />
        }
      />

      {/* Filter bar — status tabs, sort + card size, then the facet selects. */}
      <div className="mb-5 space-y-3 sm:mb-6 motion-safe:animate-paper-rise [animation-delay:60ms]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <div
            role="group"
            aria-label="Filter by status"
            className="-mx-4 flex min-w-0 items-end gap-5 overflow-x-auto border-b border-rule px-4 [scrollbar-width:none] sm:-mx-0 sm:px-0 lg:flex-1 [&::-webkit-scrollbar]:hidden"
          >
            {statusTabs.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  aria-pressed={active}
                  className={cn(
                    "relative -mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13.5px] font-semibold transition-colors outline-none max-sm:min-h-11",
                    "focus-visible:text-ink focus-visible:[box-shadow:0_2px_0_0_var(--accent-ink)]",
                    active
                      ? "border-accent-ink text-ink"
                      : "border-transparent text-ink-3 hover:border-rule-2 hover:text-ink-2",
                  )}
                >
                  {t.marker}
                  <span>{t.label}</span>
                  {t.count > 0 && (
                    <span
                      className={cn(
                        "-translate-y-1 font-mono text-[10.5px] font-medium tabular-nums",
                        active ? "text-accent-ink" : "text-ink-3",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Select value={orderBy} onValueChange={setOrderBy}>
              <SelectTrigger
                aria-label="Sort order"
                className="h-9 min-w-0 flex-1 gap-2 caret-transparent max-sm:h-11 sm:w-[11.5rem] sm:flex-none [&>span]:flex [&>span]:items-center [&>span]:gap-2"
              >
                <ArrowDownUp className="hidden h-3.5 w-3.5 shrink-0 text-ink-3 sm:block" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="title">Alphabetical</SelectItem>
                <SelectItem value="lastChange">Last Change</SelectItem>
              </SelectContent>
            </Select>

            <div
              role="radiogroup"
              aria-label="Card size"
              className="flex shrink-0 items-center rounded-md border border-rule-2 bg-paper-1 p-0.5"
            >
              {cardWidthOptions.map((opt) => {
                const active = cardWidth === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`Card size ${opt.label}`}
                    title={`Card size ${opt.label}`}
                    onClick={() => setCardWidth(opt.value)}
                    className={cn(
                      "inline-flex h-8 min-w-8 items-center justify-center rounded-[4px] px-1.5 font-mono text-[11px] font-semibold tracking-wide transition-colors outline-none max-sm:h-10 max-sm:min-w-10",
                      "focus-visible:ring-[3px] focus-visible:ring-accent-soft",
                      active ? "bg-ink text-paper" : "text-ink-3 hover:bg-hover hover:text-ink",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {/* Categories — only when categorized folders are enabled in settings */}
          {showCategoriesFilter && (
            <Select
              value={selectedCategory ?? "__ALL__"}
              onValueChange={(value) => setSelectedCategory(value === "__ALL__" ? null : value)}
            >
              <SelectTrigger aria-label="Category" className={cn(filterTrigger, selectedCategory && "border-accent-line bg-accent-soft")}>
                <Folder className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All Categories</SelectItem>
                {categories.filter((category) => category).map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Genres */}
          <Select
            value={selectedGenre ?? "__ALL__"}
            onValueChange={(value) => setSelectedGenre(value === "__ALL__" ? null : value)}
          >
            <SelectTrigger aria-label="Genre" className={cn(filterTrigger, selectedGenre && "border-accent-line bg-accent-soft")}>
              <Tag className="h-3.5 w-3.5 shrink-0 text-ink-3" />
              <SelectValue placeholder="All Genres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">All Genres</SelectItem>
              {genres.filter((genre) => genre).map((genre) => (
                <SelectItem key={genre} value={genre}>{genre}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sources (permission-gated) */}
          {canBrowseSources && (
            <Select
              value={selectedProvider ?? "__ALL__"}
              onValueChange={(value) => setSelectedProvider(value === "__ALL__" ? null : value)}
            >
              <SelectTrigger aria-label="Source" className={cn(filterTrigger, selectedProvider && "border-accent-line bg-accent-soft")}>
                <Plug className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All Sources</SelectItem>
                {providers.filter((provider) => provider).map((provider) => (
                  <SelectItem key={provider} value={provider}>{provider}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <PullToRefresh onRefresh={handleRefresh}>
        <ListSeries
          filterFn={filterFn}
          sortFn={sortFn}
          cardWidth={cardWidth}
          cardWidthOptions={cardWidthOptions}
          orderBy={orderBy}
          library={deduplicatedLibrary}
        />
      </PullToRefresh>
    </PageLayout>
  );
}
