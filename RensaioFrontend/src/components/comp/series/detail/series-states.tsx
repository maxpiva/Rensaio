"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-page notice used by the series detail route for its pre-content states
 * (missing id, deleting, error / not found).
 */
export function SeriesStateNotice({
  tone,
  eyebrow,
  title,
  children,
}: {
  tone: "bad" | "busy";
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center motion-safe:animate-paper-rise"
    >
      <span
        className={cn(
          "mb-5 grid h-12 w-12 place-items-center rounded-full border",
          tone === "bad" ? "border-bad/30 bg-bad-soft text-bad" : "border-rule-2 bg-paper-1 text-ink-3",
        )}
      >
        {tone === "bad" ? (
          <AlertTriangle className="h-5 w-5" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin" />
        )}
      </span>
      <p className="paper-eyebrow mb-2">{eyebrow}</p>
      <p className="font-serif text-[26px] leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">{title}</p>
      {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

/** Skeleton of the series hero shown while the series is loading. */
export function SeriesDetailSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="w-full">
      <span className="sr-only">{label}</span>
      <div className="border-b-[3px] border-double border-rule-3" aria-hidden="true">
        <div className="mx-auto grid max-w-6xl grid-cols-[104px_minmax(0,1fr)] gap-x-4 gap-y-5 px-4 pb-7 pt-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-x-9 sm:px-8 sm:pb-9 sm:pt-8 lg:grid-cols-[224px_minmax(0,1fr)]">
          <div className="skeleton-shimmer aspect-[2/3] w-full rounded-[3px] sm:row-span-2" />
          <div className="self-end space-y-3 sm:self-start">
            <div className="flex gap-1.5">
              <div className="skeleton-shimmer h-5 w-20 rounded-[3px]" />
              <div className="skeleton-shimmer h-5 w-14 rounded-[3px]" />
            </div>
            <div className="skeleton-shimmer h-8 w-11/12 rounded-[3px] sm:h-12" />
            <div className="skeleton-shimmer h-8 w-2/3 rounded-[3px] sm:h-12" />
            <div className="skeleton-shimmer h-3.5 w-40 rounded-[2px]" />
          </div>
          <div className="col-span-2 space-y-3 sm:col-span-1 sm:col-start-2">
            <div className="skeleton-shimmer h-3 w-56 rounded-[2px]" />
            <div className="flex gap-1.5">
              {[64, 80, 56, 72].map((w) => (
                <div key={w} className="skeleton-shimmer h-6 rounded-full" style={{ width: w }} />
              ))}
            </div>
            <div className="space-y-2 pt-1">
              <div className="skeleton-shimmer h-3 w-full max-w-[68ch] rounded-[2px]" />
              <div className="skeleton-shimmer h-3 w-11/12 max-w-[64ch] rounded-[2px]" />
              <div className="skeleton-shimmer h-3 w-3/5 max-w-[40ch] rounded-[2px]" />
            </div>
            <div className="flex gap-2 pt-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton-shimmer h-[52px] flex-1 rounded-md sm:h-9 sm:w-24 sm:flex-none" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-8" aria-hidden="true">
        <div className="skeleton-shimmer h-6 w-40 rounded-[3px]" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="skeleton-shimmer h-40 rounded-lg" />
          <div className="skeleton-shimmer h-40 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
