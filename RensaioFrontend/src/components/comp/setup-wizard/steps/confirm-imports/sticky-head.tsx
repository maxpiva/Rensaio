"use client";

/**
 * sticky-head.tsx
 *
 * Sticky header inside the confirm-imports step content area.
 *
 * Contains:
 *   1. Filter tab strip: Add / Finished / Already Imported / Not Matched —
 *      each with a status dot and a mono count; the active tab is underlined crimson.
 *   2. Reviewed-counter row: "N of M reviewed · X ready to import" + hairline progress bar.
 *
 * On narrow screens the tab strip scrolls sideways; no JS media-query in this file.
 */

import React from "react";

import { cn } from "@/lib/utils";
import { PaperBar } from "../../paper";

/** Tab dots: Add = ok, Finished = accent, Already Imported = info, Not Matched = muted. */
const DOT: Record<"green" | "violet" | "blue" | "gray", string> = {
  green: "bg-ok",
  violet: "bg-primary",
  blue: "bg-info",
  gray: "bg-ink-3",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type TabId = "import" | "completed" | "unchanged" | "skip";

interface TabDef {
  id: TabId;
  label: string;
  shortLabel: string;
  dotColor: "green" | "violet" | "blue" | "gray";
  count: number;
}

interface StickyHeadProps {
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
  importCount: number;
  completedCount: number;
  unchangedCount: number;
  skippedCount: number;
  /** Number of items "reviewed" (non-pending) for the counter row. */
  reviewedCount: number;
  /** Total item count across all tabs. */
  totalCount: number;
  /** Items ready to import (status === Import). */
  readyCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StickyHead({
  activeTab,
  onTabChange,
  importCount,
  completedCount,
  unchangedCount,
  skippedCount,
  reviewedCount,
  totalCount,
  readyCount,
}: StickyHeadProps) {
  const tabs: TabDef[] = [
    { id: "import",    label: "Add",               shortLabel: "Add",      dotColor: "green",  count: importCount    },
    { id: "completed", label: "Finished",           shortLabel: "Done",     dotColor: "violet", count: completedCount },
    { id: "unchanged", label: "Already Imported",   shortLabel: "Imported", dotColor: "blue",   count: unchangedCount },
    { id: "skip",      label: "Not Matched",        shortLabel: "Unmatched",dotColor: "gray",   count: skippedCount   },
  ];

  const pct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  return (
    <div
      className="sticky top-0 z-[4] -mx-4 shrink-0 bg-paper/95 px-4 pb-3 backdrop-blur-[6px] sm:-mx-6 sm:px-6 lg:-mx-11 lg:px-11"
      role="region"
      aria-label="Filter and progress"
    >
      {/* Tab strip — scrolls sideways on narrow screens */}
      <div
        className="flex gap-5 overflow-x-auto border-b border-rule [scrollbar-width:none] max-sm:gap-4 [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Import filter tabs"
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "relative inline-flex h-11 shrink-0 items-center gap-[7px] whitespace-nowrap text-[13.5px] font-semibold outline-none transition-colors",
                "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:transition-colors",
                "focus-visible:rounded-[3px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                selected ? "text-ink after:bg-primary" : "text-ink-3 after:bg-transparent hover:text-ink",
              )}
              onClick={(e) => {
                e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                onTabChange(tab.id);
              }}
            >
              <span className={cn("h-[7px] w-[7px] rounded-full", DOT[tab.dotColor])} aria-hidden="true" />
              <span>{tab.label}</span>
              <span
                className={cn("font-mono text-[11px] font-medium tabular-nums", selected ? "text-accent-ink" : "text-ink-3")}
                aria-label={`${tab.count} items`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Reviewed-counter row */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11.5px] font-medium text-ink-3 [&_strong]:font-semibold [&_strong]:text-ink"
        aria-label="Progress summary"
      >
        <span className="tabular-nums">
          <strong>{String(reviewedCount).padStart(2, "0")}</strong>
          {" of "}
          <strong>{totalCount}</strong>
          {" reviewed"}
        </span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          <strong className="!text-accent-ink">{readyCount}</strong>
          {" ready to import"}
        </span>
        {/* Hairline progress bar */}
        <PaperBar value={pct} className="min-w-[80px] flex-1 max-sm:basis-full" />
      </div>
    </div>
  );
}
