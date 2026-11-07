"use client";

import { type AddSeriesState } from "@/components/comp/series/add-series";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { type FullSeries, type ExistingSource } from "@/lib/api/types";
import React from "react";
import Image from "next/image";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { BookmarkCheck, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ─── DynamicTags — kept as a named export for external consumers ─────────────
export function DynamicTags({ genres }: { genres: string[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState<number>(6);

  React.useEffect(() => {
    if (!containerRef.current || genres.length === 0) return;

    const calculateVisibleTags = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      let totalWidth = 0;
      let count = 0;

      const tempContainer = document.createElement("div");
      tempContainer.style.position = "absolute";
      tempContainer.style.visibility = "hidden";
      tempContainer.style.display = "flex";
      tempContainer.style.gap = "4px";
      document.body.appendChild(tempContainer);

      for (const genre of genres) {
        const tempBadge = document.createElement("span");
        tempBadge.className =
          "inline-flex items-center rounded-md border px-2.5 py-0.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80";
        tempBadge.textContent = genre;
        tempContainer.appendChild(tempBadge);
        const tagWidth = tempBadge.offsetWidth + 4;
        if (totalWidth + tagWidth <= containerWidth - 80) {
          totalWidth += tagWidth;
          count++;
        } else {
          break;
        }
      }

      document.body.removeChild(tempContainer);
      setVisibleCount(Math.max(1, count));
    };

    calculateVisibleTags();

    const resizeObserver = new ResizeObserver(calculateVisibleTags);
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [genres]);

  return (
    <div ref={containerRef} className="flex items-center gap-1 w-full">
      {genres.slice(0, visibleCount).map((genre: string) => (
        <Badge key={genre} variant="secondary" className="text-sm">
          {genre}
        </Badge>
      ))}
      {genres.length > visibleCount && (
        <Badge variant="secondary" className="text-sm">
          +{genres.length - visibleCount} more
        </Badge>
      )}
    </div>
  );
}

// ─── Type guards (verbatim) ──────────────────────────────────────────────────

function isFullSeriesArray(value: unknown): value is FullSeries[] {
  return Array.isArray(value) && value.every(isValidFullSeries);
}

function isValidFullSeries(obj: unknown): obj is FullSeries {
  if (!obj || typeof obj !== "object") return false;
  const series = obj as Record<string, unknown>;
  return (
    (typeof series.mihonId === "string" || typeof series.providerId === "string") &&
    typeof series.provider === "string" &&
    typeof series.scanlator === "string" &&
    typeof series.lang === "string" &&
    typeof series.title === "string" &&
    typeof series.artist === "string" &&
    typeof series.author === "string" &&
    typeof series.description === "string" &&
    Array.isArray(series.genre) &&
    typeof series.chapterCount === "number" &&
    (typeof series.url === "string" || typeof series.url === "undefined") &&
    typeof series.useCover === "boolean" &&
    typeof series.isStorage === "boolean" &&
    typeof series.useTitle === "boolean"
  );
}

function isExistingSeries(series: FullSeries, existingSources: ExistingSource[]): boolean {
  return existingSources.some(
    (existing) =>
      existing.mihonProviderId === series.mihonProviderId &&
      existing.provider === series.provider &&
      existing.scanlator === series.scanlator &&
      existing.lang === series.lang,
  );
}

const getSeriesId = (series: FullSeries): string =>
  series.mihonId ?? series.providerId ?? series.title;

// ─── Main component ──────────────────────────────────────────────────────────

export function ConfirmSeriesStep({
  formState,
  setFormState,
  setError: _setError,
  setIsLoading: _setIsLoading,
  setCanProgress,
  isAddSourcesMode = false,
  existingSources = [],
}: {
  formState: AddSeriesState;
  setFormState: React.Dispatch<React.SetStateAction<AddSeriesState>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCanProgress: React.Dispatch<React.SetStateAction<boolean>>;
  isAddSourcesMode?: boolean;
  existingSources?: ExistingSource[];
}) {
  // ── validFullSeries (verbatim) ─────────────────────────────────────────────
  const validFullSeries: FullSeries[] = React.useMemo(() => {
    if (isFullSeriesArray(formState.fullSeries)) {
      const processedSeries = formState.fullSeries.map((series) => ({
        ...series,
        isUnselectable: isExistingSeries(series, existingSources),
      }));
      return processedSeries.sort((a, b) => {
        if (a.isUnselectable && !b.isUnselectable) return -1;
        if (!a.isUnselectable && b.isUnselectable) return 1;
        return 0;
      });
    }
    return [];
  }, [formState.fullSeries, existingSources]);

  // ── setCanProgress effect (verbatim) ──────────────────────────────────────
  React.useEffect(() => {
    const hasSelectedSeries = validFullSeries.some(
      (series) => series.isSelected && !series.isUnselectable,
    );
    setCanProgress(hasSelectedSeries);
  }, [validFullSeries, setCanProgress]);

  // ── Auto-initialize first selectable (verbatim) ───────────────────────────
  React.useEffect(() => {
    const selectableSeries = validFullSeries.filter((series) => !series.isUnselectable);
    if (selectableSeries.length > 0 && !selectableSeries.some((series) => series.isSelected)) {
      setFormState((prev: AddSeriesState) => {
        const updatedSeries = prev.fullSeries.map((series: FullSeries) => {
          const isFirstSelectable =
            !series.isUnselectable &&
            selectableSeries[0] &&
            getSeriesId(series) === getSeriesId(selectableSeries[0]) &&
            series.provider === selectableSeries[0].provider &&
            series.lang === selectableSeries[0].lang &&
            series.scanlator === selectableSeries[0].scanlator;
          return { ...series, isSelected: Boolean(isFirstSelectable) };
        });
        return { ...prev, fullSeries: updatedSeries };
      });
    }
  }, [validFullSeries.length, setFormState]);

  // ── Handlers (verbatim) ───────────────────────────────────────────────────
  const handleToggleSelection = React.useCallback(
    (seriesKey: string) => {
      setFormState((prev: AddSeriesState) => {
        const updatedSeries = prev.fullSeries.map((series: FullSeries) => {
          const currentKey = `${getSeriesId(series)}-${series.provider}-${series.lang}-${series.scanlator}`;
          return currentKey === seriesKey && !series.isUnselectable
            ? { ...series, isSelected: !series.isSelected }
            : series;
        });
        return { ...prev, fullSeries: updatedSeries };
      });
    },
    [setFormState],
  );

  const handleStorageChange = React.useCallback(
    (seriesKey: string, checked: boolean): void => {
      setFormState((prev: AddSeriesState): AddSeriesState => {
        const updatedSeries: FullSeries[] = prev.fullSeries.map(
          (series: FullSeries): FullSeries => {
            const currentKey = `${getSeriesId(series)}-${series.provider}-${series.lang}-${series.scanlator}`;
            return currentKey === seriesKey ? { ...series, isStorage: checked } : series;
          },
        );
        return { ...prev, fullSeries: updatedSeries };
      });
    },
    [setFormState],
  );

  const handleCoverChange = React.useCallback(
    (seriesKey: string, checked: boolean): void => {
      setFormState((prev: AddSeriesState): AddSeriesState => {
        const updatedSeries: FullSeries[] = prev.fullSeries.map(
          (series: FullSeries): FullSeries => {
            const currentKey = `${getSeriesId(series)}-${series.provider}-${series.lang}-${series.scanlator}`;
            return {
              ...series,
              useCover:
                currentKey === seriesKey ? checked : checked ? false : series.useCover,
            };
          },
        );
        return { ...prev, fullSeries: updatedSeries };
      });
    },
    [setFormState],
  );

  const handleTitleChange = React.useCallback(
    (seriesKey: string, checked: boolean): void => {
      setFormState((prev: AddSeriesState): AddSeriesState => {
        const updatedSeries: FullSeries[] = prev.fullSeries.map(
          (series: FullSeries): FullSeries => {
            const currentKey = `${getSeriesId(series)}-${series.provider}-${series.lang}-${series.scanlator}`;
            return {
              ...series,
              useTitle:
                currentKey === seriesKey ? checked : checked ? false : series.useTitle,
            };
          },
        );
        return { ...prev, fullSeries: updatedSeries };
      });
    },
    [setFormState],
  );

  // ── Storage / category state (verbatim) ───────────────────────────────────
  const [selectedCategory, setSelectedCategory] = React.useState<string>("");
  const [editableStoragePath, setEditableStoragePath] = React.useState<string>("");
  const categoryManuallyChanged = React.useRef<boolean>(false);

  const handleStoragePathChange = React.useCallback(
    (newPath: string) => {
      setEditableStoragePath(newPath);
      setFormState((prev: AddSeriesState) => ({ ...prev, storagePath: newPath }));
    },
    [setFormState],
  );

  const handleCategoryChange = React.useCallback((newCategory: string) => {
    categoryManuallyChanged.current = true;
    setSelectedCategory(newCategory);
  }, []);

  // ── titleSeries / useCover series (verbatim logic) ────────────────────────
  const titleSeries = React.useMemo(
    () => validFullSeries.find((series) => series.useTitle),
    [validFullSeries],
  );

  const coverSeries = React.useMemo(
    () =>
      validFullSeries.find((series) => series.useCover) ??
      validFullSeries.find((s) => !s.isUnselectable) ??
      validFullSeries[0],
    [validFullSeries],
  );

  const availableCategories = React.useMemo(
    () => formState.originalAugmentedResponse?.categories ?? [],
    [formState.originalAugmentedResponse],
  );

  const useCategoriesForPath =
    formState.originalAugmentedResponse?.useCategoriesForPath ?? false;
  const baseStoragePath = formState.originalAugmentedResponse?.storageFolderPath;

  const titleSeriesIdRef = React.useRef<string | null>(null);

  // ── Category init effect (verbatim) ───────────────────────────────────────
  React.useEffect(() => {
    const currentTitleSeriesId = titleSeries
      ? `${getSeriesId(titleSeries)}-${titleSeries.provider}`
      : null;
    if (
      currentTitleSeriesId !== titleSeriesIdRef.current &&
      !categoryManuallyChanged.current
    ) {
      titleSeriesIdRef.current = currentTitleSeriesId;
      if (availableCategories.length > 0) {
        const initialCategory =
          titleSeries?.type && availableCategories.includes(titleSeries.type)
            ? titleSeries.type
            : availableCategories[0];
        setSelectedCategory(initialCategory ?? "");
      } else {
        setSelectedCategory("");
      }
    }
  }, [titleSeries, availableCategories]);

  // ── Path-computation effect (verbatim) ────────────────────────────────────
  React.useEffect(() => {
    if (formState.storagePath && !editableStoragePath) {
      setEditableStoragePath(formState.storagePath);
      return;
    }
    if (!titleSeries || !baseStoragePath) return;

    const separator = baseStoragePath.includes("\\") ? "\\" : "/";
    let computedPath: string;
    if (availableCategories.length > 0 && useCategoriesForPath && selectedCategory) {
      computedPath = `${baseStoragePath}${separator}${selectedCategory}${separator}${titleSeries.suggestedFilename}`;
    } else {
      computedPath = `${baseStoragePath}${separator}${titleSeries.suggestedFilename}`;
    }
    if (computedPath !== editableStoragePath) {
      handleStoragePathChange(computedPath);
    }
  }, [
    titleSeries,
    baseStoragePath,
    availableCategories,
    useCategoriesForPath,
    selectedCategory,
    formState.storagePath,
    editableStoragePath,
  ]);

  // ── More-options collapsible state ────────────────────────────────────────
  const [moreOptionsOpen, setMoreOptionsOpen] = React.useState(false);

  // ── Derived display values ────────────────────────────────────────────────
  const displayTitle = titleSeries?.title ?? coverSeries?.title ?? "";
  const displayAuthor = coverSeries?.author ?? "";
  const displayArtist = coverSeries?.artist ?? "";
  const displayGenres = (coverSeries?.genre ?? []).slice(0, 4);
  const displaySynopsis = coverSeries?.description ?? "";
  const coverUrl = coverSeries ? formatThumbnailUrl(coverSeries.thumbnailUrl) : null;

  const selectedCount = validFullSeries.filter(
    (s) => s.isSelected && !s.isUnselectable,
  ).length;

  const selectableCount = validFullSeries.filter((s) => !s.isUnselectable).length;
  const initials = displayTitle
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-7" data-vaul-no-drag>
      {/* Title bar */}
      {displayTitle && (
        <h3 className="mb-5 font-serif text-[24px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink [overflow-wrap:anywhere] sm:text-[30px]">
          {displayTitle}
        </h3>
      )}

      {/* Two-column layout: meta panel | sources */}
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-[168px_minmax(0,1fr)]">
        {/* ── Left: meta panel ── */}
        <aside className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-3 sm:block">
          {/* Cover, set with an offset print shadow */}
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[3px] bg-paper-3 shadow-print">
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt={displayTitle}
                fill
                sizes="(max-width: 640px) 88px, 168px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-serif text-3xl italic text-ink-3">
                {initials}
              </div>
            )}
          </div>

          <div className="min-w-0 sm:mt-4">
            {/* Author / artist */}
            {displayAuthor && (
              <p className="font-serif text-[14px] italic leading-snug text-ink-2">
                by {displayAuthor}
                {displayArtist && displayArtist !== displayAuthor && (
                  <> · art {displayArtist}</>
                )}
              </p>
            )}

            {/* Genre chips */}
            {displayGenres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {displayGenres.map((genre: string) => (
                  <span
                    key={genre}
                    className="rounded-full border border-rule-2 px-2 py-0.5 text-[11px] leading-4 text-ink-2"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Synopsis */}
          {displaySynopsis && (
            <p className="col-span-2 line-clamp-6 text-[13px] leading-relaxed text-ink-2 sm:mt-4">
              {displaySynopsis}
            </p>
          )}
        </aside>

        {/* ── Right: sources ── */}
        <section className="min-w-0" aria-label="Sources">
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink/80 pb-2">
            <h4 className="font-serif text-[18px] font-semibold tracking-[-0.01em] text-ink">
              Track from <em className="font-medium text-accent-ink">these sources</em>
            </h4>
            {selectedCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2 tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {selectedCount} OF {selectableCount}
              </span>
            )}
          </div>

          {/* Desktop table */}
          <div className="mt-3 hidden overflow-hidden rounded-lg border border-rule bg-paper-1 sm:block">
            <div
              className="grid grid-cols-[16px_32px_minmax(0,1fr)_auto] gap-3 border-b border-rule px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3"
              aria-hidden="true"
            >
              <div />
              <div />
              <div>Source</div>
              <div className="text-right">Chapters</div>
            </div>
            <div className="divide-y divide-rule">
              {validFullSeries.map((series) => {
                const seriesKey = `${getSeriesId(series)}-${series.provider}-${series.lang}-${series.scanlator}`;
                const chCount = series.chapterCount;
                const thumbUrl = series.thumbnailUrl ? formatThumbnailUrl(series.thumbnailUrl) : null;
                const isActive = series.isSelected && !series.isUnselectable;
                return (
                  <div key={seriesKey}>
                    <div
                      className={sourceRowClass(isActive, series.isUnselectable)}
                      onClick={() => {
                        if (!series.isUnselectable) handleToggleSelection(seriesKey);
                      }}
                    >
                      <SourceCheck
                        checked={isActive}
                        disabled={series.isUnselectable}
                        label={`Track from ${series.provider}`}
                        onToggle={() => {
                          if (!series.isUnselectable) handleToggleSelection(seriesKey);
                        }}
                      />
                      <SourceThumb url={thumbUrl} provider={series.provider} />
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-ink">{series.provider}</span>
                        <ReactCountryFlag
                          countryCode={getCountryCodeForLanguage(series.lang)}
                          svg
                          style={{ width: "16px", height: "12px", flexShrink: 0, borderRadius: 2 }}
                          title={series.lang.toUpperCase()}
                        />
                        {series.scanlator && series.scanlator !== series.provider && (
                          <span className="truncate text-[11px] text-ink-3">
                            · {series.scanlator}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-3">
                        {series.isUnselectable && <ExistsTag />}
                        <span className="font-mono text-[13px] tabular-nums text-ink">
                          {chCount}
                          <span className="text-ink-3"> ch</span>
                        </span>
                      </div>
                    </div>

                    {/* Per-source switches — visible only when selected */}
                    {isActive && (
                      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-dashed border-rule bg-accent-soft/40 py-2.5 pl-[71px] pr-3">
                        <SourceSwitch
                          id={`storage-${seriesKey}`}
                          checked={series.isStorage}
                          onCheckedChange={(checked) => handleStorageChange(seriesKey, checked)}
                          label="Permanent Source"
                        />
                        <SourceSwitch
                          id={`cover-${seriesKey}`}
                          checked={series.useCover}
                          onCheckedChange={(checked) => handleCoverChange(seriesKey, checked)}
                          label="Use as Cover"
                        />
                        <SourceSwitch
                          id={`title-${seriesKey}`}
                          checked={series.useTitle}
                          onCheckedChange={(checked) => handleTitleChange(seriesKey, checked)}
                          label="Use as Title"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile card stack */}
          <div className="mt-3 divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-paper-1 sm:hidden">
            {validFullSeries.map((series) => {
              const seriesKey = `${getSeriesId(series)}-${series.provider}-${series.lang}-${series.scanlator}`;
              const chCount = series.chapterCount;
              const thumbUrl = series.thumbnailUrl ? formatThumbnailUrl(series.thumbnailUrl) : null;
              const isActive = series.isSelected && !series.isUnselectable;
              return (
                <div key={seriesKey}>
                  <div
                    className={cn(sourceRowClass(isActive, series.isUnselectable), "min-h-[60px]")}
                    onClick={() => {
                      if (!series.isUnselectable) handleToggleSelection(seriesKey);
                    }}
                  >
                    <SourceCheck
                      checked={isActive}
                      disabled={series.isUnselectable}
                      label={`Track from ${series.provider}`}
                      onToggle={() => {
                        if (!series.isUnselectable) handleToggleSelection(seriesKey);
                      }}
                    />
                    <SourceThumb url={thumbUrl} provider={series.provider} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[14px] font-medium text-ink">{series.provider}</span>
                        <ReactCountryFlag
                          countryCode={getCountryCodeForLanguage(series.lang)}
                          svg
                          style={{ width: "16px", height: "12px", flexShrink: 0, borderRadius: 2 }}
                          title={series.lang.toUpperCase()}
                        />
                        {series.scanlator && series.scanlator !== series.provider && (
                          <span className="truncate text-[11px] text-ink-3">· {series.scanlator}</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
                        <span>{series.lang.toUpperCase()}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          <span className="tabular-nums text-ink-2">{chCount}</span> chapters
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      {series.isUnselectable && <ExistsTag />}
                    </div>
                  </div>

                  {/* Per-source switches — visible only when selected */}
                  {isActive && (
                    <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-dashed border-rule bg-accent-soft/40 px-3 py-1">
                      <SourceSwitch
                        id={`m-storage-${seriesKey}`}
                        checked={series.isStorage}
                        onCheckedChange={(checked) => handleStorageChange(seriesKey, checked)}
                        label="Permanent"
                        compact
                      />
                      <SourceSwitch
                        id={`m-cover-${seriesKey}`}
                        checked={series.useCover}
                        onCheckedChange={(checked) => handleCoverChange(seriesKey, checked)}
                        label="Cover"
                        compact
                      />
                      <SourceSwitch
                        id={`m-title-${seriesKey}`}
                        checked={series.useTitle}
                        onCheckedChange={(checked) => handleTitleChange(seriesKey, checked)}
                        label="Title"
                        compact
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* More options — Storage Path + Category */}
          {!isAddSourcesMode && titleSeries && (
            <Collapsible open={moreOptionsOpen} onOpenChange={setMoreOptionsOpen} className="mt-4">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:h-11"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      moreOptionsOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                  More options
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 grid gap-4 rounded-lg border border-rule bg-paper-1 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
                  <div className="min-w-0">
                    <Label htmlFor="storage-path" className="paper-eyebrow">
                      Storage Path
                    </Label>
                    <Input
                      id="storage-path"
                      value={editableStoragePath}
                      onChange={(e) => handleStoragePathChange(e.target.value)}
                      placeholder="Enter storage path..."
                      className="mt-1.5 font-mono text-xs sm:text-[13px]"
                    />
                  </div>
                  {availableCategories.length > 0 && (
                    <div className="w-full">
                      <Label htmlFor="category-select" className="paper-eyebrow">
                        Category
                      </Label>
                      <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                        <SelectTrigger id="category-select" className="mt-1.5">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCategories.filter((category: string) => category).map((category: string) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Presentational helpers (local to the confirm step) ─────────────────────

function sourceRowClass(isActive: boolean, isUnselectable: boolean | undefined): string {
  return cn(
    "relative grid grid-cols-[16px_32px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors",
    "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:transition-colors",
    isActive ? "bg-accent-soft before:bg-primary" : "before:bg-transparent",
    isUnselectable ? "cursor-not-allowed opacity-50" : "cursor-pointer",
    !isActive && !isUnselectable && "hover:bg-hover",
  );
}

function SourceCheck({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  const id = React.useId();
  return (
    <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onToggle} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
    </span>
  );
}

function SourceThumb({ url, provider }: { url: string | null; provider: string }) {
  return (
    <span className="relative block h-12 w-8 overflow-hidden rounded-[2px] bg-paper-3 shadow-paper">
      {url && (
        <Image src={url} alt={`${provider} cover`} fill sizes="32px" className="object-cover" />
      )}
    </span>
  );
}

function ExistsTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[3px] bg-bad-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-bad">
      <BookmarkCheck className="h-3 w-3" aria-hidden="true" />
      EXISTS
    </span>
  );
}

function SourceSwitch({
  id,
  checked,
  onCheckedChange,
  label,
  compact = false,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", compact && "min-h-11")}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="cursor-pointer text-xs text-ink-2">
        {label}
      </Label>
    </div>
  );
}
