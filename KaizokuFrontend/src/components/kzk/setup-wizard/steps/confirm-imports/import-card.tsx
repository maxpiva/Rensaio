"use client";

/**
 * import-card.tsx
 *
 * Single import card in the confirm-imports panel.
 *
 * Layout:
 *   [poster 64×96] | [title (Fraunces) / path (mono)] | [action cluster]
 *   ——————————————————————————————————————————————————————————
 *   match rows (MatchRow ×N)
 *
 * The action cluster contains:
 *   - "Continue After Chapter" number input
 *   - Search button (conditional)
 *   - Skip / Mismatch button (conditional)
 *   - Add button (conditional)
 *   - Action combobox (conditional)
 *
 * SearchSeriesRequester is kept mounted per-card (Slice C re-skins that component).
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
import { Search, X, Plus, ExternalLink } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { SearchSeriesRequester } from "@/components/kzk/setup-wizard/search-series-requester";
import type {
  ImportInfo,
  ImportProviderSnapshot,
  SmallSeries,
} from "@/lib/api/types";
import { ImportStatus, Action } from "@/lib/api/types";
import { MatchRow } from "./match-row";
import { ImportsContext } from "./imports-context";

// ─── Read-only ProviderRow ────────────────────────────────────────────────────
//
// Used for the "Already Imported" (ImportStatus.DoNotChange) case where
// importItem.series is empty but importItem.providers is populated.
//
// Mirrors the visual shell of MatchRow (same .iw-match-* CSS classes for
// effortless styling parity) but is immutable: no switches, no preferred
// toggle radio behavior, no popover trigger logic.

interface ProviderRowProps {
  provider: ImportProviderSnapshot;
}

const ProviderRow = React.memo(function ProviderRow({
  provider,
}: ProviderRowProps) {
  const [coverImgSrc, setCoverImgSrc] = React.useState<string>(
    provider.thumbnailUrl ?? ""
  );
  React.useEffect(() => {
    setCoverImgSrc(provider.thumbnailUrl ?? "");
  }, [provider.thumbnailUrl]);

  const handleCoverImgError = useCallback(() => {
    setCoverImgSrc("");
  }, []);

  return (
    <div className="iw-match-row">
      {/* Accent bar (transparent — read-only rows are never "preferred") */}
      <div className="iw-match-accent" aria-hidden="true" />

      {/* Cover thumb (28×40, same as MatchRow) */}
      <div
        className="iw-match-cover is-readonly"
        aria-label={`${provider.provider} cover`}
      >
        {coverImgSrc ? (
          <Image
            src={coverImgSrc}
            alt={`${provider.title ?? provider.provider} cover`}
            width={28}
            height={40}
            className="iw-match-cover__img"
            unoptimized
            onError={handleCoverImgError}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div className="iw-match-cover__placeholder" aria-hidden="true" />
        )}
      </div>

      {/* Provider info */}
      <div className="iw-match-info">
        <div className="iw-match-prov">
          {provider.url ? (
            <a
              href={provider.url}
              target="_blank"
              rel="noopener noreferrer"
              className="iw-match-prov__link"
              onClick={(e) => e.stopPropagation()}
            >
              {provider.provider}
              <ExternalLink className="iw-match-prov__ext" />
            </a>
          ) : (
            <span>{provider.provider}</span>
          )}
          <ReactCountryFlag
            countryCode={getCountryCodeForLanguage(provider.language)}
            svg
            style={{ width: "16px", height: "12px", flexShrink: 0 }}
            title={provider.language.toLowerCase()}
          />
        </div>
        <div className="iw-match-sub">
          {provider.scanlator &&
            provider.scanlator !== provider.provider && (
              <>
                <span className="iw-match-sub__scanlator">
                  {provider.scanlator}
                </span>
                <span className="iw-match-sub__sep">·</span>
              </>
            )}
          <span className="iw-match-sub__chap">
            {provider.chapterCount} chapters
          </span>
        </div>
      </div>

      {/* No switches — read-only */}
    </div>
  );
});

ProviderRow.displayName = "ProviderRow";

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

    // Poster thumbnail fallback chain:
    //   1) preferred series thumbnail
    //   2) first series with a thumbnailUrl
    //   3) first provider snapshot with a thumbnailUrl (covers DoNotChange case
    //      where importItem.series is empty)
    //   4) /kaizoku.net.png logo
    const derivedThumbnailSrc = useMemo<string>(() => {
      const preferred = importItem.series?.find(
        (s: SmallSeries) => s.preferred
      );
      if (preferred?.thumbnailUrl) return preferred.thumbnailUrl;

      const firstSeriesWithThumb = importItem.series?.find(
        (s: SmallSeries) => !!s.thumbnailUrl
      );
      if (firstSeriesWithThumb?.thumbnailUrl)
        return firstSeriesWithThumb.thumbnailUrl;

      const firstProviderWithThumb = importItem.providers?.find(
        (p: ImportProviderSnapshot) => !!p.thumbnailUrl
      );
      if (firstProviderWithThumb?.thumbnailUrl)
        return firstProviderWithThumb.thumbnailUrl;

      return "/kaizoku.net.png";
    }, [importItem.series, importItem.providers]);

    const [imgSrc, setImgSrc] = React.useState<string>(derivedThumbnailSrc);
    React.useEffect(() => {
      setImgSrc(derivedThumbnailSrc);
    }, [derivedThumbnailSrc]);
    const handleImgError = useCallback(() => {
      setImgSrc("/kaizoku.net.png");
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
        const newAction = parseInt(value) as Action;
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
        importsCtx.updateImportField(
          updatedImportInfo.path,
          "",
          updatedImportInfo
        );
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

    return (
      <div className="iw-import-card">
        {/* Card header: poster + title/path + action cluster */}
        <div className="iw-card-head">
          {/* Poster */}
          <div className="iw-card-poster">
            <Image
              src={imgSrc}
              alt={importItem.title || "Series thumbnail"}
              width={64}
              height={96}
              className="iw-card-poster__img"
              unoptimized
              onError={handleImgError}
            />
          </div>

          {/* Title + path */}
          <div className="iw-card-meta">
            <h3 className="iw-card-title">
              {importItem.title || "Unknown Title"}
            </h3>
            <div className="iw-card-path">{importItem.path}</div>
          </div>

          {/* Action cluster */}
          <div className="iw-action-cluster">
            <div className="iw-action-chapter">
              <label className="iw-action-chapter__label">Continue after</label>
              <Input
                type="number"
                min="0"
                value={localChapter}
                onChange={handleChapterChange}
                className="iw-action-chapter__input"
                placeholder="0"
              />
            </div>

            <div className="iw-action-btn-row">
              {(showSearchButton ||
                !importItem.series ||
                importItem.series.length === 0) && (
                <Button
                  size="sm"
                  onClick={handleSearchClick}
                  disabled={isUpdating}
                  className="iw-action-btn"
                >
                  <Search className="h-4 w-4" />
                  Search
                </Button>
              )}

              {showSkipButton && (
                <Button
                  size="sm"
                  onClick={handleSkipClick}
                  disabled={isUpdating}
                  className="iw-action-btn"
                >
                  <X className="h-4 w-4" />
                  Mismatch
                </Button>
              )}

              {showAddButton && (
                <Button
                  size="sm"
                  onClick={handleAddClick}
                  disabled={isUpdating}
                  className="iw-action-btn"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              )}

              {showActionCombobox && (
                <div className="flex items-center gap-2 relative isolate">
                  <span className="text-sm font-medium">Action:</span>
                  <div className="relative z-10 contain-layout">
                    {actionSelect}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Match rows — interactive when we have a series[] selection, or a
            read-only provider list (already-imported case) when not. */}
        {importItem.series && importItem.series.length > 0 ? (
          <div className="iw-matches">
            {importItem.series.map((series: SmallSeries, index: number) => (
              <MatchRow
                key={`series-${series.id}-${series.provider}-${series.scanlator ?? ""}`}
                series={series}
                seriesIndex={index}
                importPath={importItem.path}
                onProviderToggle={handleProviderToggle}
              />
            ))}
          </div>
        ) : importItem.providers && importItem.providers.length > 0 ? (
          <div className="iw-matches">
            {importItem.providers.map(
              (provider: ImportProviderSnapshot) => (
                <ProviderRow
                  key={`provider-${provider.provider}-${provider.scanlator ?? ""}-${provider.language}`}
                  provider={provider}
                />
              )
            )}
          </div>
        ) : null}

        {/* SearchSeriesRequester — kept mounted per-card (Slice C re-skins) */}
        <SearchSeriesRequester
          open={searchRequesterOpen}
          onOpenChange={setSearchRequesterOpen}
          importTitle={importItem.title || "Unknown Title"}
          importPath={importItem.path}
          onResult={handleSearchResult}
        />
      </div>
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

    const prevSeries = prevProps.import.series || [];
    const nextSeries = nextProps.import.series || [];
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

    // When series[] is empty, the card falls back to rendering providers[],
    // so changes there must trigger a re-render too.
    const prevProviders = prevProps.import.providers || [];
    const nextProviders = nextProps.import.providers || [];
    if (prevProviders.length !== nextProviders.length) return false;
    for (let i = 0; i < prevProviders.length; i++) {
      const prev = prevProviders[i];
      const next = nextProviders[i];
      if (
        !prev ||
        !next ||
        prev.provider !== next.provider ||
        prev.scanlator !== next.scanlator ||
        prev.language !== next.language ||
        prev.thumbnailUrl !== next.thumbnailUrl ||
        prev.chapterCount !== next.chapterCount ||
        prev.url !== next.url
      ) {
        return false;
      }
    }

    return true;
  }
);

ImportCard.displayName = "ImportCard";
