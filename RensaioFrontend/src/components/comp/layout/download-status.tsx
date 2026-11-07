"use client";

import { AlertTriangle, Clock, Download } from "lucide-react";
import Link from "next/link";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePermission } from "@/hooks/use-permission";
import { useDownloadsMetrics } from "@/lib/api/hooks/useDownloads";
import { cn } from "@/lib/utils";

/**
 * Download status counters (active / queued / failed) linking to /queue.
 *
 * Paper look: a hairline-bordered segmented strip of mono counters — each
 * segment is icon + number, colour only reinforces (the tooltip / aria label
 * spells it out). Hidden for users who can't see the queue.
 *
 * `variant="bar"`    — compact strip for the desktop top bar.
 * `variant="drawer"` — full-width strip for the phone More sheet.
 */
export function DownloadStatus({
  variant = "bar",
}: {
  variant?: "bar" | "drawer";
}) {
  const canViewQueue = usePermission("canViewQueue");
  const { data: metrics, isLoading, error } = useDownloadsMetrics();

  if (!canViewQueue || isLoading || error || !metrics) {
    return null;
  }

  const items = [
    {
      key: "active",
      label: "active",
      value: metrics.downloads,
      icon: Download,
      tone: metrics.downloads > 0 ? "text-accent-ink" : "text-ink-2",
    },
    {
      key: "queued",
      label: "queued",
      value: metrics.queued,
      icon: Clock,
      tone: "text-ink-2",
    },
    {
      key: "failed",
      label: "failed",
      value: metrics.failed,
      icon: AlertTriangle,
      tone: metrics.failed > 0 ? "text-bad" : "text-ink-2",
    },
  ];

  const summary = `${metrics.downloads} active, ${metrics.queued} queued, ${metrics.failed} failed`;

  const strip = (
    <Link
      href="/queue"
      aria-label={`Download status: ${summary}. Open queue`}
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border border-rule bg-paper-1 transition-colors hover:border-rule-2",
        variant === "bar" ? "h-9" : "h-11 w-full",
      )}
    >
      {items.map(({ key, label, value, icon: Icon, tone }) => (
        <span
          key={key}
          className={cn(
            "flex items-center justify-center gap-1.5 px-2.5 font-mono text-[11.5px] font-semibold tabular-nums",
            "[&+&]:border-l [&+&]:border-rule",
            variant === "drawer" && "flex-1",
            tone,
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {value}
          {variant === "drawer" && (
            <span className="font-medium text-ink-3">{label}</span>
          )}
        </span>
      ))}
    </Link>
  );

  if (variant === "drawer") return strip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{strip}</TooltipTrigger>
      <TooltipContent side="bottom">
        {metrics.downloads} active · {metrics.queued} queued · {metrics.failed}{" "}
        failed
      </TooltipContent>
    </Tooltip>
  );
}
