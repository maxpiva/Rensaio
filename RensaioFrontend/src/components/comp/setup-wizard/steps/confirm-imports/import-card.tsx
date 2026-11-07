"use client";

/**
 * import-card.tsx
 *
 * Single import card in the confirm-imports panel.
 *
 * Layout:
 *   [poster 64×96] | title (serif) / path (mono)
 *                  | action cluster
 *                  | match rows (MatchRow ×N)
 *   Phone: poster + title side by side; controls and matches span the card.
 *
 * The action cluster contains:
 *   - "Continue After Chapter" number input
 *   - Search button (conditional)
 *   - Skip / Mismatch button (conditional)
 *   - Add button (conditional)
 *   - Action combobox (conditional)
 *
 * SearchSeriesRequester is kept mounted per-card.
 */

import React, { useCallback, useContext, useMemo } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Plus } from "lucide-react";
import { SearchSeriesRequester } from "@/components/comp/setup-wizard/search-series-requester";
import type { ImportInfo, SmallSeries } from "@/lib/api/types";
import { ImportStatus, Action } from "@/lib/api/types";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { cn } from "@/lib/utils";
import { MatchRow } from "./match-row";
import { ImportsContext } from "./imports-context";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ImportCardProps {
  import: ImportInfo;
  onStatusChange: (path: string, status: ImportStatus) => void;
  onActionChange: (path: string, action: Action) => void;
  onProviderToggle: (path: string, seriesIndex: number) => void;
  onChapterChange: (path: string, chapter: number) => void;
  onSeriesPropertyChange: (
    path: string,
    seriesIndex: number,
    property: "useCover" | "isStorage" | "useTitle",
    value: boolean
  ) => void;
  showActionCombobox?: boolean;
  isUpdating?: boolean;
  showSearchButton?: boolean;
  showSkipButton?: boolean;
  showAddButton?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ImportCard = React.memo(
  function ImportCard({
    import: importItem,
    isUpdating,
    showActionCombobox,
    showSearchButton,
    showSkipButton,
    showAddButton,
  }: ImportCardProps) {
    const importsCtx = useContext(ImportsContext);
    if (!importsCtx)
      throw new Error("ImportCard must be used within ImportsContext.Provider");

    // Preferred-series poster thumbnail
    const preferredSeries = importItem.series?.find(
      (s: SmallSeries) => s.preferred
    );
    const thumbnailSrc = formatThumbnailUrl(preferredSeries?.thumbnailUrl);

    const [imgSrc, setImgSrc] = React.useState<string>(thumbnailSrc);
    React.useEffect(() => {
      setImgSrc(thumbnailSrc);
    }, [thumbnailSrc]);
    const handleImgError = useCallback(() => {
      setImgSrc("/rensaio.png");
    }, []);

    // Local chapter state (same pattern as original)
    const [localChapter, setLocalChapter] = React.useState(
      importItem.continueAfterChapter ?? 0
    );
    React.useEffect(() => {
      setLocalChapter(importItem.continueAfterChapter ?? 0);
    }, [importItem.continueAfterChapter]);

    const actionValue = useMemo(
      () => (importItem.action ?? Action.Add).toString(),
      [importItem.action]
    );

    // Event handlers
    const handleActionChange = useCallback(
      (value: string) => {
        const newAction: Action = parseInt(value);
        if (newAction !== importItem.action) {
          const newStatus =
            newAction === Action.Add ? ImportStatus.Import : ImportStatus.Skip;
          importsCtx.updateImportField(importItem.path, "status", newStatus);
          importsCtx.updateImportField(importItem.path, "action", newAction);
        }
      },
      [importItem.action, importItem.path, importsCtx]
    );

    const handleChapterChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const chapter = parseInt(e.target.value) || 0;
        setLocalChapter(chapter);
        importsCtx.updateImportField(
          importItem.path,
          "continueAfterChapter",
          chapter
        );
      },
      [importItem.path, importsCtx]
    );

    const [searchRequesterOpen, setSearchRequesterOpen] = React.useState(false);

    const handleSearchClick = useCallback(() => {
      setSearchRequesterOpen(true);
    }, []);

    const handleSearchResult = useCallback(
      (updatedImportInfo: ImportInfo) => {
        // The backend's augment() only attaches the matched series — it leaves the import's
        // status untouched (still Skip for a Not-Matched item). If we replaced the import
        // as-is it would linger in the "Not Matched" tab forever, even though the user just
        // matched it. Promote a freshly-matched Skip item straight into the Add list so it
        // moves out of Not Matched and actually gets imported. Any meaningful status the
        // backend did assign (Completed / DoNotChange for already-present series) is kept.
        const matched: ImportInfo =
          updatedImportInfo.status === ImportStatus.Skip
            ? { ...updatedImportInfo, status: ImportStatus.Import, action: Action.Add }
            : updatedImportInfo;
        importsCtx.updateImportField(matched.path, "", matched);
      },
      [importsCtx]
    );

    const handleSkipClick = useCallback(() => {
      importsCtx.updateImportField(importItem.path, "status", ImportStatus.Skip);
      importsCtx.updateImportField(importItem.path, "action", Action.Skip);
    }, [importItem.path, importsCtx]);

    const handleAddClick = useCallback(() => {
      importsCtx.updateImportField(
        importItem.path,
        "status",
        ImportStatus.Import
      );
      importsCtx.updateImportField(importItem.path, "action", Action.Add);
    }, [importItem.path, importsCtx]);

    const handleSelectPointerDown = useCallback(
      (e: React.PointerEvent) => { e.stopPropagation(); },
      []
    );
    const handleSelectClick = useCallback(
      (e: React.MouseEvent) => { e.stopPropagation(); },
      []
    );

    const actionSelect = useMemo(
      () => (
        <Select
          value={actionValue}
          onValueChange={handleActionChange}
          disabled={isUpdating}
        >
          <SelectTrigger
            className="w-40 will-change-auto transform-gpu"
            onPointerDown={handleSelectPointerDown}
            onClick={handleSelectClick}
          >
            <SelectValue placeholder="Select action" />
          </SelectTrigger>
          <SelectContent className="will-change-auto transform-gpu">
            <SelectItem value={Action.Add.toString()}>Add</SelectItem>
            <SelectItem value={Action.Skip.toString()}>Skip</SelectItem>
          </SelectContent>
        </Select>
      ),
      [
        actionValue,
        isUpdating,
        handleActionChange,
        handleSelectPointerDown,
        handleSelectClick,
      ]
    );

    const handleProviderToggle = useCallback(
      (path: string, idx: number) => {
        importsCtx.updateImportField(
          path,
          "preferred",
          !(importItem.series?.[idx]?.preferred ?? false),
          idx
        );
      },
      [importsCtx, importItem.series]
    );

    const hasMatches = !!importItem.series && importItem.series.length > 0;
    const btnClass = "max-sm:min-h-11 max-sm:flex-1";

    return (
      <article
        className={cn(
          "grid gap-x-[18px] gap-y-3 rounded-md border border-rule bg-paper-1 p-4 shadow-paper max-sm:gap-x-3 max-sm:px-3 max-sm:py-3.5",
          // Not-matched items have no preferred series → no thumbnail, so the
          // poster column is dropped and the title takes the full width.
          thumbnailSrc ? "grid-cols-[64px_minmax(0,1fr)] max-sm:grid-cols-[52px_minmax(0,1fr)]" : "grid-cols-1",
        )}
      >
        {/* Poster */}
        {thumbnailSrc && (
          <div className="self-start overflow-hidden rounded-[3px] bg-paper-3 shadow-print ring-1 ring-rule-2">
            <Image
              src={imgSrc}
              alt={importItem.title || "Series thumbnail"}
              width={64}
              height={96}
              className="aspect-[2/3] h-auto w-full object-cover"
              unoptimized
              onError={handleImgError}
            />
          </div>
        )}

        {/* On phone this column dissolves (display: contents) so the title sits
            beside the poster and the controls + matches span the full card. */}
        <div className="min-w-0 max-sm:contents">
          {/* Title + path */}
          <div className="min-w-0 max-sm:self-center">
            <h3 className="font-serif text-[20px] font-normal leading-[1.15] tracking-[-0.01em] text-ink [overflow-wrap:anywhere] max-sm:text-[17px]">
              {importItem.title || "Unknown Title"}
            </h3>
            <div className="mt-1 font-mono text-[11.5px] font-medium leading-[1.45] text-ink-3 [overflow-wrap:anywhere] max-sm:text-[11px]">
              {importItem.path}
            </div>
          </div>

          {/* Action cluster */}
          <div className="mt-3 flex flex-wrap items-center gap-2.5 max-sm:col-span-full max-sm:mt-0">
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2 max-sm:w-full">
              <span className="whitespace-nowrap">Continue after</span>
              <Input
                type="number"
                min="0"
                value={localChapter}
                onChange={handleChapterChange}
                className="h-[30px] w-[88px] font-mono text-[12.5px] tabular-nums max-sm:ml-auto max-sm:w-[104px]"
                placeholder="0"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
              {(showSearchButton === true || !importItem.series?.length) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSearchClick}
                  disabled={isUpdating}
                  className={btnClass}
                >
                  <Search className="h-3.5 w-3.5" aria-hidden />
                  Search
                </Button>
              )}

              {showSkipButton && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSkipClick}
                  disabled={isUpdating}
                  className={btnClass}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Mismatch
                </Button>
              )}

              {showAddButton && (
                <Button
                  size="sm"
                  onClick={handleAddClick}
                  disabled={isUpdating}
                  className={btnClass}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add
                </Button>
              )}

              {showActionCombobox && (
                <div className="relative isolate flex items-center gap-2">
                  <span className="text-[12.5px] font-medium text-ink-2">Action:</span>
                  <div className="relative z-10 contain-layout">
                    {actionSelect}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Match rows */}
          {hasMatches && (
            <div
              className="mt-3 overflow-hidden rounded-[5px] border border-rule bg-paper max-sm:col-span-full max-sm:mt-0"
              role="list"
              aria-label="Source matches"
            >
              {importItem.series!.map((series: SmallSeries, index: number) => (
                <MatchRow
                  key={`series-${series.id}-${series.provider}-${series.scanlator ?? ""}`}
                  series={series}
                  seriesIndex={index}
                  importPath={importItem.path}
                  onProviderToggle={handleProviderToggle}
                />
              ))}
            </div>
          )}
        </div>

        {/* SearchSeriesRequester — kept mounted per-card */}
        <SearchSeriesRequester
          open={searchRequesterOpen}
          onOpenChange={setSearchRequesterOpen}
          importTitle={importItem.title || "Unknown Title"}
          importPath={importItem.path}
          onResult={handleSearchResult}
        />
      </article>
    );
  },
  (prevProps, nextProps) => {
    const basicEqual =
      prevProps.import.path === nextProps.import.path &&
      prevProps.import.status === nextProps.import.status &&
      prevProps.showActionCombobox === nextProps.showActionCombobox &&
      prevProps.showSearchButton === nextProps.showSearchButton &&
      prevProps.showSkipButton === nextProps.showSkipButton &&
      prevProps.showAddButton === nextProps.showAddButton &&
      prevProps.isUpdating === nextProps.isUpdating;

    if (!basicEqual) return false;

    const prevSeries = prevProps.import.series ?? [];
    const nextSeries = nextProps.import.series ?? [];
    if (prevSeries.length !== nextSeries.length) return false;

    for (let i = 0; i < prevSeries.length; i++) {
      const prev = prevSeries[i];
      const next = nextSeries[i];
      if (
        !prev ||
        !next ||
        prev.id !== next.id ||
        prev.preferred !== next.preferred ||
        prev.title !== next.title ||
        prev.provider !== next.provider
      ) {
        return false;
      }
    }

    return true;
  }
);

ImportCard.displayName = "ImportCard";
