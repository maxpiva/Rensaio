"use client";

/**
 * Paper status vocabulary for the Just In surfaces (grid cards, hover card,
 * details modal and spotlight). Every status is icon + label, never colour
 * alone. Labels come from getStatusDisplay so wording stays in one place.
 */

import React from "react";
import {
  Ban,
  BadgeCheck,
  BookCheck,
  BookmarkCheck,
  BookmarkMinus,
  CircleCheck,
  CircleDot,
  CirclePause,
  CircleQuestionMark,
  CircleX,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { InLibraryStatus, SeriesStatus } from "@/lib/api/types";
import { getStatusDisplay } from "@/lib/utils/series-status";

type Tone = "ok" | "info" | "warn" | "bad" | "accent" | "muted";

const TONE_TAG: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  accent: "bg-accent-soft text-accent-ink",
  muted: "bg-paper-2 text-ink-3",
};

const TONE_STRIPE: Record<Tone, string> = {
  ok: "bg-ok",
  info: "bg-info",
  warn: "bg-warn",
  bad: "bg-bad",
  accent: "bg-accent-ink",
  muted: "bg-ink-3",
};

function statusMeta(status: SeriesStatus | undefined): { Icon: LucideIcon; tone: Tone } {
  switch (status) {
    case SeriesStatus.ONGOING:
      return { Icon: CircleDot, tone: "ok" };
    case SeriesStatus.COMPLETED:
      return { Icon: CircleCheck, tone: "info" };
    case SeriesStatus.PUBLISHING_FINISHED:
      return { Icon: BookCheck, tone: "info" };
    case SeriesStatus.LICENSED:
      return { Icon: BadgeCheck, tone: "accent" };
    case SeriesStatus.CANCELLED:
      return { Icon: CircleX, tone: "bad" };
    case SeriesStatus.ON_HIATUS:
      return { Icon: CirclePause, tone: "warn" };
    case SeriesStatus.DISABLED:
      return { Icon: Ban, tone: "muted" };
    default:
      return { Icon: CircleQuestionMark, tone: "muted" };
  }
}

/** 2px colour strip used along the top edge of covers. Decorative only. */
export function statusStripeClass(status: SeriesStatus | undefined): string {
  return TONE_STRIPE[statusMeta(status).tone];
}

export function SeriesStatusTag({
  status,
  className,
}: {
  status: SeriesStatus | undefined;
  className?: string;
}) {
  const { Icon, tone } = statusMeta(status);
  const label = getStatusDisplay(status ?? SeriesStatus.UNKNOWN).text;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] px-2 text-[11.5px] font-semibold leading-none",
        TONE_TAG[tone],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  info: "text-info",
  warn: "text-warn",
  bad: "text-bad",
  accent: "text-accent-ink",
  muted: "text-ink-3",
};

/** Quiet inline status (icon + label) for dense captions. */
export function SeriesStatusInline({
  status,
  className,
}: {
  status: SeriesStatus | undefined;
  className?: string;
}) {
  const { Icon, tone } = statusMeta(status);
  const label = getStatusDisplay(status ?? SeriesStatus.UNKNOWN).text;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 text-ink-3", className)}>
      <Icon className={cn("h-3 w-3 shrink-0", TONE_TEXT[tone])} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Library membership tag. Renders nothing for series that are not in the
 * library. "Disabled" means the series is in the library but switched off.
 */
export function InLibraryTag({
  inLibrary,
  compact = false,
  className,
}: {
  inLibrary: InLibraryStatus;
  compact?: boolean;
  className?: string;
}) {
  if (inLibrary === InLibraryStatus.NotInLibrary) return null;
  const disabled = inLibrary === InLibraryStatus.InLibraryButDisabled;
  const Icon = disabled ? BookmarkMinus : BookmarkCheck;
  const label = disabled ? "Disabled" : "In library";
  const full = disabled ? "In your library, disabled" : "In your library";
  return (
    <span
      title={full}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] font-semibold leading-none shadow-sm",
        disabled ? "bg-warn text-paper" : "bg-ok text-paper",
        compact ? "h-[18px] px-1 text-[10px]" : "h-[20px] px-1.5 text-[11px]",
        className,
      )}
    >
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {compact ? <span className="sr-only">{full}</span> : <span>{label}</span>}
    </span>
  );
}

/**
 * Relative age of a fetch date: "now", "9m", "3h", "2d", or a short date
 * once it is older than a month.
 */
export function formatFetchAge(fetchDate?: string): { short: string; long: string } | null {
  if (!fetchDate) return null;
  const then = new Date(fetchDate);
  const t = then.getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return { short: "now", long: "just now" };
  if (mins < 60) return { short: `${mins}m`, long: `${mins} min ago` };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { short: `${hours}h`, long: `${hours} h ago` };
  const days = Math.floor(hours / 24);
  if (days <= 31) return { short: `${days}d`, long: `${days} day${days === 1 ? "" : "s"} ago` };
  const date = then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { short: date, long: date };
}
