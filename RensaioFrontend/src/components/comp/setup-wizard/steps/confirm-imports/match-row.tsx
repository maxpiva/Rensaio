"use client";

/**
 * match-row.tsx
 *
 * Single provider-match row inside an ImportCard.
 *
 * Layout (desktop, 3-col grid):
 *   [30×42 cover thumb] [provider info] [switches cluster]
 *
 * Preferred row: crimson-soft fill, crimson left rule and crimson ring on the cover.
 * Hover on cover thumb → triggers the body-level CoverPopoverHost popover (disabled on touch).
 *
 * Phone (<640px): cover + info on top, switches move to a 3-col row below.
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
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { cn } from "@/lib/utils";
import { ImportsContext } from "./imports-context";
import { useCoverPopoverTriggerProps } from "./cover-popover";

const switchCell =
  "flex min-w-0 flex-col items-center gap-1.5 max-sm:gap-2 max-sm:py-1";
const switchLabel =
  "font-mono text-[9.5px] font-semibold uppercase leading-none tracking-[0.12em] text-ink-3";

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
// prop arrives, so the crimson highlight updates exactly on the row that was clicked.
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

  const formattedThumbUrl = formatThumbnailUrl(series.thumbnailUrl);

  // Cover popover trigger props
  const popoverTriggerProps = useCoverPopoverTriggerProps(
    formattedThumbUrl,
    series.provider
  );

  const [coverImgSrc, setCoverImgSrc] = React.useState(formattedThumbUrl);
  React.useEffect(() => {
    setCoverImgSrc(formattedThumbUrl);
  }, [formattedThumbUrl]);

  const handleCoverImgError = useCallback(() => {
    setCoverImgSrc("");
  }, []);

  return (
    <div
      role="listitem"
      className={cn(
        "relative grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-rule px-3 py-2.5 transition-colors last:border-b-0",
        "max-sm:grid-cols-[30px_minmax(0,1fr)] max-sm:px-2.5",
        preferred ? "bg-accent-soft" : "hover:bg-hover",
      )}
    >
      {/* Crimson rule on the left edge of the preferred match */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] transition-colors",
          preferred ? "bg-primary" : "bg-transparent",
        )}
        aria-hidden="true"
      />

      {/* Cover thumb — triggers the cover popover on hover / focus */}
      <div
        className={cn(
          "h-[42px] w-[30px] overflow-hidden rounded-[2px] bg-paper-3 outline-none ring-1 transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
          preferred ? "ring-primary/60" : "ring-rule-2",
        )}
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
            unoptimized
            onError={handleCoverImgError}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div className="h-full w-full bg-paper-3" aria-hidden="true" />
        )}
      </div>

      {/* Provider info — click toggles "preferred" */}
      <div
        className="min-w-0 cursor-pointer select-none"
        onClick={handleProviderClick}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-ink">
          {series.url ? (
            <a
              href={series.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1 rounded-[2px] underline-offset-2 outline-none hover:text-accent-ink hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="truncate">{series.provider}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-ink-3" aria-hidden />
            </a>
          ) : (
            <span className="truncate">{series.provider}</span>
          )}
          <ReactCountryFlag
            countryCode={getCountryCodeForLanguage(series.lang)}
            svg
            style={{ width: "16px", height: "12px", flexShrink: 0, borderRadius: 1 }}
            title={series.lang.toLowerCase()}
          />
          {preferred && (
            <span className="inline-flex h-[18px] items-center rounded-[3px] border border-accent-line bg-paper-1 px-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
              Preferred
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 font-mono text-[11px] font-medium text-ink-3">
          {series.scanlator && series.scanlator !== series.provider && (
            <>
              <span className="truncate text-ink-2">{series.scanlator}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="tabular-nums">{series.chapterCount} chapters</span>
          {series.lastChapter && (
            <>
              <span aria-hidden>·</span>
              <span>Last: {series.lastChapter}</span>
            </>
          )}
        </div>
      </div>

      {/* Switches cluster — beside the info on desktop, a 3-up row on phone */}
      <div
        className="flex items-center gap-4 max-sm:col-span-full max-sm:grid max-sm:grid-cols-3 max-sm:gap-2 max-sm:border-t max-sm:border-rule max-sm:pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={switchCell}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(switchLabel, "cursor-help underline decoration-dotted decoration-rule-3 underline-offset-[3px]")}>
                  Permanent
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
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
            aria-label={`Permanent: ${series.provider}`}
          />
        </div>

        <div className={switchCell}>
          <span className={switchLabel}>Cover</span>
          <Switch
            checked={useCover}
            onCheckedChange={handleCoverChange}
            aria-label={`Use cover from ${series.provider}`}
          />
        </div>

        <div className={switchCell}>
          <span className={switchLabel}>Title</span>
          <Switch
            checked={useTitle}
            onCheckedChange={handleTitleChange}
            aria-label={`Use title from ${series.provider}`}
          />
        </div>
      </div>
    </div>
  );
});

MatchRow.displayName = "MatchRow";
