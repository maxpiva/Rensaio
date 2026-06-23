"use client";

import React from "react";
import {
  Clock,
  FolderOpen,
  Layers,
  Plug,
  type LucideIcon,
} from "lucide-react";
import type { SeriesExtendedInfo } from "@/lib/api/types";

interface LibraryStatsCardProps {
  series: SeriesExtendedInfo;
  activeProvidersCount: number;
}

type MutedTone = "amber" | "emerald" | "default";

interface StatRowProps {
  icon: LucideIcon;
  label: string;
  value: string;
  muted?: string;
  mutedTone?: MutedTone;
  valueTitle?: string;
}

function StatRow({
  icon: Icon,
  label,
  value,
  muted,
  mutedTone = "default",
  valueTitle,
}: StatRowProps) {
  const mutedClass =
    mutedTone === "amber"
      ? "text-amber-500"
      : mutedTone === "emerald"
        ? "text-emerald-400"
        : "text-muted-foreground";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
          {label}
        </div>
        <div
          className="text-sm text-foreground tabular-nums truncate"
          title={valueTitle ?? value}
        >
          {value}
        </div>
      </div>
      {muted && (
        <div
          className={`text-[11px] ${mutedClass} truncate max-w-[40%]`}
          title={muted}
        >
          {muted}
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  const ms = Date.now() - time;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function absoluteDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function truncatePath(path: string | undefined): {
  display: string;
  full: string;
} {
  if (!path) return { display: "—", full: "" };
  // Normalize trailing slash, split on both / and \
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]+/).filter(Boolean);
  if (parts.length === 0) return { display: path, full: path };
  if (parts.length === 1) return { display: parts[0]!, full: path };
  const tail = parts.slice(-2).join("/");
  // Preserve trailing slash if original had one
  const hadTrailing = /[/\\]$/.test(path);
  return {
    display: hadTrailing ? `${tail}/` : tail,
    full: path,
  };
}

export function LibraryStatsCard({
  series,
  activeProvidersCount,
}: LibraryStatsCardProps) {
  const chapterRange = series.chapterList ?? "";
  const relative = relativeTime(series.lastChangeUTC);
  const absolute = absoluteDate(series.lastChangeUTC);
  const totalProviders = series.providers?.length ?? 0;
  const { display: pathDisplay, full: pathFull } = truncatePath(series.path);

  return (
    <section className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <header className="px-4 py-3 border-b border-border/60">
        <h2 className="text-sm font-semibold tracking-tight">Library Stats</h2>
      </header>
      <div className="divide-y divide-border/40">
        <StatRow
          icon={Layers}
          label="Chapters"
          value={`${series.chapterCount}`}
          muted={chapterRange || undefined}
        />
        <StatRow
          icon={Plug}
          label="Active Sources"
          value={`${activeProvidersCount}`}
          muted={`of ${totalProviders}`}
        />
        <StatRow
          icon={Clock}
          label="Last Update"
          value={relative}
          muted={absolute || undefined}
        />
        <StatRow
          icon={FolderOpen}
          label="Storage"
          value={pathDisplay}
          valueTitle={pathFull || pathDisplay}
          muted="Healthy"
          mutedTone="emerald"
        />
      </div>
    </section>
  );
}
