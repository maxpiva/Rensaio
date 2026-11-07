"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { useDownloadProgress } from "@/lib/api/hooks/useQueue";
import { ProgressStatus } from "@/lib/api/types";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";

const DOCK_DISMISSED_KEY = "ren_dock_dismissed";

/**
 * Activity Dock.
 *
 * Floating bottom-right (desktop) / above bottom-of-viewport (mobile) panel
 * that surfaces the user's current download(s). Subscribes to the same SignalR
 * `ProgressHub` the queue page uses — no duplicate connections, just a second
 * consumer of `useDownloadProgress()`.
 *
 * States:
 *   1. Hidden — when nothing is active (no markup rendered)
 *   2. Hidden — when user dismissed the dock (session-scoped, restores when a
 *      new download starts after dismissal)
 *   3. Collapsed (default) — one row showing the top active download
 *   4. Expanded — up to 5 active downloads with progress + a link to /queue
 *
 * Suppressed on the Queue page itself (would just duplicate what's already on
 * screen) and pre-login routes.
 */
export function ActivityDock() {
  const canViewQueue = usePermission("canViewQueue");
  const pathname = usePathname();
  const { downloads } = useDownloadProgress();
  const [expanded, setExpanded] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<Set<string>>(new Set());

  // Restore dismissed IDs from sessionStorage so the dock stays hidden if the
  // user closes it — but only for currently-active downloads. New downloads
  // re-show the dock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(DOCK_DISMISSED_KEY);
    if (raw) {
      try {
        const ids = JSON.parse(raw) as string[];
        setDismissedFor(new Set(ids));
      } catch {
        // ignore malformed json
      }
    }
  }, []);

  // Drop dismissed IDs that no longer correspond to active downloads — so a
  // fresh download properly re-surfaces the dock.
  useEffect(() => {
    if (dismissedFor.size === 0) return;
    const activeIds = new Set(downloads.map((d) => d.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of dismissedFor) {
      if (activeIds.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }
    if (changed) {
      setDismissedFor(next);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          DOCK_DISMISSED_KEY,
          JSON.stringify([...next]),
        );
      }
    }
  }, [downloads, dismissedFor]);

  // Don't surface the dock on /queue (the page itself is the source of truth).
  if (pathname === "/queue" || pathname.startsWith("/queue/")) return null;

  // Don't surface for users who can't see the queue.
  if (!canViewQueue) return null;

  // Show only items the user hasn't dismissed for the current session.
  const visible = downloads.filter((d) => !dismissedFor.has(d.id));

  if (visible.length === 0) return null;

  // Sort downloading first, then queued/other. Take up to 5 for the expanded
  // list; the collapsed view shows the top one.
  const sorted = [...visible].sort((a, b) => {
    const aActive = a.status === ProgressStatus.InProgress ? 0 : 1;
    const bActive = b.status === ProgressStatus.InProgress ? 0 : 1;
    return aActive - bActive;
  });
  const top = sorted[0]!;
  const list = sorted.slice(0, 5);

  const dismissCurrent = () => {
    const next = new Set(dismissedFor);
    for (const d of visible) next.add(d.id);
    setDismissedFor(next);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        DOCK_DISMISSED_KEY,
        JSON.stringify([...next]),
      );
    }
  };

  return (
    <div
      // Phone: sits above the bottom tab bar (52px + safe-area inset).
      // Desktop: floats bottom-right of the content column.
      className="activity-dock fixed z-30 right-3 pointer-events-none bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] lg:right-5 lg:bottom-5"
    >
      <AnimatePresence>
        <motion.div
          key="dock"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="pointer-events-auto w-[min(calc(100vw-24px),320px)] rounded-lg border border-rule-2 bg-glass shadow-lift backdrop-blur-xl backdrop-saturate-150 overflow-hidden"
        >
          {/* Header / collapsed row */}
          <DockRow
            item={top}
            extraCount={visible.length - 1}
            expanded={expanded}
            onToggleExpand={() => setExpanded((v) => !v)}
            onDismiss={dismissCurrent}
          />

          {/* Expanded list */}
          <AnimatePresence initial={false}>
            {expanded && list.length > 1 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="border-t border-rule overflow-hidden"
              >
                <div className="max-h-72 overflow-y-auto divide-y divide-rule">
                  {list.slice(1).map((d) => (
                    <DockItem key={d.id} item={d} />
                  ))}
                </div>
                <Link
                  href="/queue"
                  className="flex min-h-9 items-center justify-center gap-1.5 border-t border-rule py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3 transition-colors hover:bg-hover hover:text-accent-ink max-sm:min-h-11"
                >
                  View full queue
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─── Dock row (collapsed/top) ─────────────────────────────────────────── */

interface DockRowProps {
  item: ReturnType<typeof useDownloadProgress>["downloads"][number];
  extraCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
}

function DockRow({
  item,
  extraCount,
  expanded,
  onToggleExpand,
  onDismiss,
}: DockRowProps) {
  const failed = item.status === ProgressStatus.Failed;
  const card = item.cardInfo;
  const progress = clampPercentage(item.percentage);

  return (
    <div className="flex items-stretch gap-3 px-3 py-2.5">
      {/* Thumbnail */}
      <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-[3px] bg-paper-3 shadow-print">
        {card.thumbnailUrl ? (
          <Image
            src={formatThumbnailUrl(card.thumbnailUrl)}
            alt=""
            fill
            sizes="36px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-3">
            <Download className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Title + progress */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1.5 min-w-0">
          {failed && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-bad" aria-label="Failed" />
          )}
          <p className="truncate text-[12.5px] font-semibold text-ink">
            {card.title ?? "Download"}
          </p>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 h-[3px] rounded-full bg-paper-3 overflow-hidden">
            <div
              className={`h-full transition-[width] duration-300 ease-out ${
                failed ? "bg-bad" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={`font-mono text-[10.5px] font-semibold tabular-nums shrink-0 ${failed ? "text-bad" : "text-ink-2"}`}>
            {failed ? "Error" : `${progress}%`}
          </span>
        </div>

        {card.chapterName && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-ink-3">
            {card.chapterName}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0">
        {extraCount > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse queue" : "Show all downloads"}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <div className="relative">
                <ChevronUp className="h-4 w-4" />
                <span className="absolute -top-1.5 -right-2 h-3.5 min-w-[14px] rounded-full bg-primary text-primary-foreground font-mono text-[8.5px] font-bold flex items-center justify-center px-0.5 tabular-nums">
                  +{extraCount}
                </span>
              </div>
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onDismiss}
          aria-label="Hide download dock"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Dock item (expanded list) ────────────────────────────────────────── */

function DockItem({
  item,
}: {
  item: ReturnType<typeof useDownloadProgress>["downloads"][number];
}) {
  const failed = item.status === ProgressStatus.Failed;
  const card = item.cardInfo;
  const progress = clampPercentage(item.percentage);

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="relative h-10 w-7.5 shrink-0 overflow-hidden rounded-[3px] bg-paper-3">
        {card.thumbnailUrl ? (
          <Image
            src={formatThumbnailUrl(card.thumbnailUrl)}
            alt=""
            fill
            sizes="30px"
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12.5px] font-medium text-ink">
          {card.title ?? "Download"}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 h-0.5 rounded-full bg-paper-3 overflow-hidden">
            <div
              className={`h-full transition-[width] duration-300 ${
                failed ? "bg-bad" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={`font-mono text-[10px] font-medium tabular-nums shrink-0 ${failed ? "text-bad" : "text-ink-3"}`}>
            {failed ? "Error" : `${progress}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
