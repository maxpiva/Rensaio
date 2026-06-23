"use client";

/**
 * match-row.tsx
 *
 * Single provider-match row inside an ImportCard.
 *
 * Layout (desktop, 4-col grid):
 *   [3px accent bar] [28×40 cover thumb] [provider info] [switches cluster]
 *
 * Preferred row: pink soft gradient bg from left, pink accent bar, pink ring + glow on cover.
 * Hover on cover thumb → triggers the body-level CoverPopoverHost popover (disabled on touch).
 *
 * Mobile (≤640px): stacks — cover stays top-left, switches move to 3-col grid below.
 * Handled via CSS classes only; no JS media-query branching here.
 */

import React, { useCallback, useContext } from "react";
import Image from "next/image";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ReactCountryFlag from "react-country-flag";
import { ExternalLink } from "lucide-react";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import type { SmallSeries } from "@/lib/api/types";
import { ImportsContext } from "./imports-context";
import { useCoverPopoverTriggerProps } from "./cover-popover";

// ─── Local state for switches ─────────────────────────────────────────────────

interface MatchRowProps {
  series: SmallSeries;
  seriesIndex: number;
  importPath: string;
  onProviderToggle: (path: string, idx: number) => void;
}

// Default shallow-compare memo is correct here: updateProviderToggle in the parent
// returns the *same* series object reference for every sibling row (only the toggled
// row gets a new object), so sibling MatchRows see no prop change and skip re-render.
// The local `preferred` state syncs via useEffect when the toggled row's new series
// prop arrives, so the pink highlight updates exactly on the row that was clicked.
export const MatchRow = React.memo(function MatchRow({
  series,
  seriesIndex,
  importPath,
  onProviderToggle,
}: MatchRowProps) {
  const importsCtx = useContext(ImportsContext);
  if (!importsCtx)
    throw new Error("MatchRow must be used within ImportsContext.Provider");

  // Local switch state (mirrors parent on mount/sync)
  const [isStorage, setIsStorage] = React.useState(series.isStorage);
  const [useCover, setUseCover] = React.useState(series.useCover);
  const [useTitle, setUseTitle] = React.useState(series.useTitle);
  const [preferred, setPreferred] = React.useState(series.preferred);

  React.useEffect(() => { setIsStorage(series.isStorage); }, [series.isStorage]);
  React.useEffect(() => { setUseCover(series.useCover); }, [series.useCover]);
  React.useEffect(() => { setUseTitle(series.useTitle); }, [series.useTitle]);
  React.useEffect(() => { setPreferred(series.preferred); }, [series.preferred]);

  // Switch handlers
  const handleStorageChange = useCallback(
    (checked: boolean) => {
      setIsStorage(checked);
      importsCtx.updateImportField(importPath, "isStorage", checked, seriesIndex);
    },
    [importPath, seriesIndex, importsCtx]
  );

  const handleCoverChange = useCallback(
    (checked: boolean) => {
      setUseCover(checked);
      importsCtx.updateImportField(importPath, "useCover", checked, seriesIndex);
    },
    [importPath, seriesIndex, importsCtx]
  );

  const handleTitleChange = useCallback(
    (checked: boolean) => {
      setUseTitle(checked);
      importsCtx.updateImportField(importPath, "useTitle", checked, seriesIndex);
    },
    [importPath, seriesIndex, importsCtx]
  );

  const handleProviderClick = useCallback(() => {
    setPreferred((prev) => !prev);
    onProviderToggle(importPath, seriesIndex);
  }, [importPath, seriesIndex, onProviderToggle]);

  // Cover popover trigger props
  const popoverTriggerProps = useCoverPopoverTriggerProps(
    series.thumbnailUrl,
    series.provider
  );

  const [coverImgSrc, setCoverImgSrc] = React.useState(
    series.thumbnailUrl || ""
  );
  React.useEffect(() => {
    setCoverImgSrc(series.thumbnailUrl || "");
  }, [series.thumbnailUrl]);

  const handleCoverImgError = useCallback(() => {
    setCoverImgSrc("");
  }, []);

  return (
    <div
      className={`iw-match-row${preferred ? " is-preferred" : ""}`}
    >
      {/* Pink accent bar (left edge) */}
      <div className="iw-match-accent" aria-hidden="true" />

      {/* Cover thumb — triggers popover on hover */}
      <div
        className={`iw-match-cover${preferred ? " is-preferred" : ""}`}
        tabIndex={0}
        aria-label={`${series.provider} cover`}
        {...popoverTriggerProps}
      >
        {coverImgSrc ? (
          <Image
            src={coverImgSrc}
            alt={`${series.title} cover`}
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
      <div
        className="iw-match-info"
        onClick={handleProviderClick}
        style={{ cursor: "pointer" }}
      >
        <div className="iw-match-prov">
          {series.url ? (
            <a
              href={series.url}
              target="_blank"
              rel="noopener noreferrer"
              className="iw-match-prov__link"
              onClick={(e) => e.stopPropagation()}
            >
              {series.provider}
              <ExternalLink className="iw-match-prov__ext" />
            </a>
          ) : (
            <span>{series.provider}</span>
          )}
          <ReactCountryFlag
            countryCode={getCountryCodeForLanguage(series.lang)}
            svg
            style={{ width: "16px", height: "12px", flexShrink: 0 }}
            title={series.lang.toLowerCase()}
          />
          {preferred && (
            <span className="iw-match-pref-tag">Preferred</span>
          )}
        </div>
        <div className="iw-match-sub">
          {series.scanlator && series.scanlator !== series.provider && (
            <>
              <span className="iw-match-sub__scanlator">{series.scanlator}</span>
              <span className="iw-match-sub__sep">·</span>
            </>
          )}
          <span className="iw-match-sub__chap">{series.chapterCount} chapters</span>
          {series.lastChapter && (
            <>
              <span className="iw-match-sub__sep">·</span>
              <span>Last: {series.lastChapter}</span>
            </>
          )}
        </div>
      </div>

      {/* Switches cluster */}
      <div
        className="iw-match-switches"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="iw-match-switch-cell">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="iw-match-switch-label">Permanent</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  <b>Permanent sources</b> always download new chapters and replace
                  any existing copies from non-permanent sources.
                  <br />
                  <b>Non-permanent sources</b> only download a chapter if they are
                  the first to have it available.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Switch
            checked={isStorage}
            onCheckedChange={handleStorageChange}
            className="scale-75"
          />
        </div>

        <div className="iw-match-switch-cell">
          <span className="iw-match-switch-label">Cover</span>
          <Switch
            checked={useCover}
            onCheckedChange={handleCoverChange}
            className="scale-75"
          />
        </div>

        <div className="iw-match-switch-cell">
          <span className="iw-match-switch-label">Title</span>
          <Switch
            checked={useTitle}
            onCheckedChange={handleTitleChange}
            className="scale-75"
          />
        </div>
      </div>
    </div>
  );
});

MatchRow.displayName = "MatchRow";
