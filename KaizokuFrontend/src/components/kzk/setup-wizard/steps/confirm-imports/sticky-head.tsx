"use client";

/**
 * sticky-head.tsx
 *
 * Sticky header inside the confirm-imports step content area.
 *
 * Contains:
 *   1. Filter tab strip: Add (green) / Finished (violet) / Already Imported (blue) /
 *      Not Matched (gray) — each with a colored dot and count badge.
 *   2. Reviewed-counter row: "N of M reviewed · X ready to import" + hairline progress bar.
 *
 * On mobile (≤640px): tabs become a horizontally scrollable snap-scroll chip strip.
 * CSS handles the responsive reflow; no JS media-query in this file.
 */

import React from "react";

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

  return (
    <div className="iw-sticky-head" role="region" aria-label="Filter and progress">
      {/* Tab strip */}
      <div className="iw-tabs" role="tablist" aria-label="Import filter tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`iw-tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span
              className={`iw-tab__dot iw-tab__dot--${tab.dotColor}`}
              aria-hidden="true"
            />
            <span className="iw-tab__label">{tab.label}</span>
            <span className="iw-tab__count" aria-label={`${tab.count} items`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Reviewed-counter row */}
      <div className="iw-reviewed-counter" aria-label="Progress summary">
        <span className="iw-reviewed-counter__pair">
          <strong>{String(reviewedCount).padStart(2, "0")}</strong>
          {" of "}
          <strong>{totalCount}</strong>
          {" reviewed"}
        </span>
        <span className="iw-reviewed-counter__sep" aria-hidden="true">·</span>
        <span className="iw-reviewed-counter__pair iw-reviewed-counter__pair--ready">
          <strong>{readyCount}</strong>
          {" ready to import"}
        </span>
        {/* Hairline progress bar */}
        <div
          className="iw-reviewed-counter__hairline"
          aria-hidden="true"
          style={
            {
              "--iw-progress": totalCount > 0
                ? `${Math.round((readyCount / totalCount) * 100)}%`
                : "0%",
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}
