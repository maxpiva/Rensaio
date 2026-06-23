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

/**
 * Download status badges.
 *
 * Restores the old sidebar's at-a-glance download counters (active / queued /
 * failed) that the redesigned command bar dropped. A single link to /queue with
 * three colour-coded counts. Hidden for users who can't see the queue.
 *
 * `variant="bar"`  — compact horizontal cluster for the desktop command bar.
 * `variant="drawer"` — roomier row for the mobile nav drawer footer.
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
      label: "Active downloads",
      value: metrics.downloads,
      icon: Download,
      color: "text-blue-500",
    },
    {
      label: "Queued downloads",
      value: metrics.queued,
      icon: Clock,
      color: "text-yellow-500",
    },
    {
      label: "Failed downloads",
      value: metrics.failed,
      icon: AlertTriangle,
      color: "text-red-500",
    },
  ];

  if (variant === "drawer") {
    return (
      <Link
        href="/queue"
        className="flex items-center justify-around rounded-lg border border-border/60 bg-muted/30 px-2 py-2 transition-colors hover:bg-muted/50"
      >
        {items.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-1.5" title={label}>
            <Icon className={`h-4 w-4 ${color}`} />
            <span className={`text-xs font-semibold tabular-nums ${color}`}>
              {value}
            </span>
          </div>
        ))}
      </Link>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/queue"
          aria-label="Download status"
          className="flex items-center gap-2 rounded-lg px-2 h-9 hover:bg-accent/60 transition-colors"
        >
          {items.map(({ label, value, icon: Icon, color }) => (
            <span
              key={label}
              className="flex items-center gap-1"
              title={label}
            >
              <Icon className={`h-4 w-4 ${color}`} />
              <span
                className={`text-xs font-semibold tabular-nums ${color}`}
              >
                {value}
              </span>
            </span>
          ))}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {metrics.downloads} active · {metrics.queued} queued · {metrics.failed}{" "}
        failed
      </TooltipContent>
    </Tooltip>
  );
}
