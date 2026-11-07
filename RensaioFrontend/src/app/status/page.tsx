"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Octagon, RotateCcw } from 'lucide-react';
import { useSeriesStatus, useProviderStatus, useClearAlert } from '@/lib/api/hooks/useStatus';
import { ProviderStatusPanel } from '@/components/comp/status/provider-status-panel';
import { SeriesStatusPanel } from '@/components/comp/status/series-status-panel';
import { StatusNotice } from '@/components/comp/status/status-notice';
import { PageHeader } from '@/components/comp/layout/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { HealthStatusLevel } from '@/lib/api/types';
import { cn } from '@/lib/utils';

type StatusTab = "providers" | "series";

interface StatTileProps {
  label: string;
  value: number;
  tone: "warning" | "critical";
  loading?: boolean;
  /** The figure couldn't be loaded; show a neutral "Unknown" tag, not "Clear". */
  unavailable?: boolean;
}

/**
 * Summary tile: a printed figure with a status tag underneath. The tag is
 * always icon + label ("Clear" / "Warning" / "Critical"), never colour alone.
 */
function StatTile({ label, value, tone, loading, unavailable = false }: StatTileProps) {
  const active = !unavailable && value > 0;
  const toneText = tone === "critical" ? "text-bad" : "text-warn";
  const toneSoft = tone === "critical" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn";
  const ToneIcon = tone === "critical" ? Octagon : AlertTriangle;

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col rounded-lg border bg-paper-1 p-3.5 shadow-paper sm:p-4",
        active ? (tone === "critical" ? "border-bad/30" : "border-warn/30") : "border-rule",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-x-0 top-0 h-[3px] rounded-t-lg",
            tone === "critical" ? "bg-bad" : "bg-warn",
          )}
        />
      )}
      <span className="paper-eyebrow min-w-0 text-ink-3 [overflow-wrap:anywhere]">{label}</span>
      <div
        className={cn(
          "mt-2 font-serif text-[40px] leading-none tabular-nums tracking-[-0.03em] sm:text-[46px]",
          active ? toneText : "text-ink-3/70",
        )}
      >
        {loading ? <Skeleton className="h-10 w-10" /> : unavailable ? "–" : value}
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-[22px] w-16 rounded-[4px]" />
        ) : unavailable ? (
          <span className="inline-flex h-[22px] items-center gap-1 rounded-[4px] bg-paper-2 px-1.5 text-[11.5px] font-semibold text-ink-2">
            <CircleHelp className="h-3 w-3" aria-hidden="true" />
            Unknown
          </span>
        ) : active ? (
          <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-[4px] px-1.5 text-[11.5px] font-semibold", toneSoft)}>
            <ToneIcon className="h-3 w-3" aria-hidden="true" />
            {tone === "critical" ? "Critical" : "Warning"}
          </span>
        ) : (
          <span className="inline-flex h-[22px] items-center gap-1 rounded-[4px] bg-ok-soft px-1.5 text-[11.5px] font-semibold text-ok">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Clear
          </span>
        )}
      </div>
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-busy="true" aria-label="Loading alerts" className="overflow-hidden rounded-lg border border-rule bg-paper-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 border-t border-rule px-4 py-3.5 first:border-t-0">
          <Skeleton className="h-[54px] w-10 rounded-[3px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="hidden h-7 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

export default function StatusPage() {
  const [activeTab, setActiveTab] = useState<StatusTab>("series");
  const seriesQuery = useSeriesStatus();
  const providersQuery = useProviderStatus();
  const { data: series, isLoading: seriesLoading } = seriesQuery;
  const { data: providers, isLoading: providersLoading } = providersQuery;
  const { mutate: clearAlert } = useClearAlert();
  const { canAdmin } = useAuth();

  const handleClearAlert = (targetType: number, targetId: string) => {
    clearAlert({ targetType, targetId });
  };

  const seriesWarnings = series?.filter((s) => s.level === HealthStatusLevel.Yellow).length ?? 0;
  const seriesCritical = series?.filter((s) => s.level === HealthStatusLevel.Red).length ?? 0;
  const sourceWarnings = providers?.filter((p) => p.level === HealthStatusLevel.Yellow).length ?? 0;
  const sourceCritical = providers?.filter((p) => p.level === HealthStatusLevel.Red).length ?? 0;
  const totalAlerts = (series?.length ?? 0) + (providers?.length ?? 0);
  const anyCritical = seriesCritical + sourceCritical;

  // A failed refetch keeps the old data cached, so go by isError alone: stale
  // results must never read as a current all-clear (Queue uses the same rule).
  const seriesUnavailable = seriesQuery.isError;
  const providersUnavailable = providersQuery.isError;

  const description = seriesLoading || providersLoading
    ? "Health of your sources and series."
    : seriesUnavailable || providersUnavailable
      ? "Health of your sources and series. Some checks couldn’t be loaded."
      : totalAlerts === 0
        ? "Health of your sources and series. Everything checks out."
        : `Health of your sources and series. ${totalAlerts} alert${totalAlerts === 1 ? "" : "s"} need${totalAlerts === 1 ? "s" : ""} a look${anyCritical ? `, ${anyCritical} critical` : ""}.`;

  const errorNotice = (what: string, retry: () => void) => (
    <StatusNotice
      tone="bad"
      title={`Couldn’t load ${what} status`}
      body="The server didn’t answer. Try again in a moment."
      action={
        <Button variant="ink" onClick={retry}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      }
    />
  );

  return (
    <div className="w-full max-w-[1100px]">
      <PageHeader
        folio="04"
        eyebrow="Status · Health report"
        title="Status"
        accent="report"
        tate="診断"
        description={description}
      />

      {/* Summary tiles */}
      <section aria-label="Alert summary" className="mb-7 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatTile label="Series Warnings" value={seriesWarnings} tone="warning" loading={seriesLoading} unavailable={seriesUnavailable} />
        <StatTile label="Series Critical" value={seriesCritical} tone="critical" loading={seriesLoading} unavailable={seriesUnavailable} />
        <StatTile label="Source Warnings" value={sourceWarnings} tone="warning" loading={providersLoading} unavailable={providersUnavailable} />
        <StatTile label="Source Critical" value={sourceCritical} tone="critical" loading={providersLoading} unavailable={providersUnavailable} />
      </section>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StatusTab)}>
        <div className="mb-3 flex items-center gap-3">
          <TabsList aria-label="Alert type" className="max-sm:grid max-sm:w-full max-sm:grid-cols-2">
            <TabsTrigger value="series" className="min-w-[96px] max-sm:min-h-[38px]">
              Series
              <span className="font-mono text-[10.5px] font-medium tabular-nums opacity-70">
                {seriesLoading || seriesUnavailable ? "–" : (series?.length ?? 0)}
              </span>
            </TabsTrigger>
            <TabsTrigger value="providers" className="min-w-[96px] max-sm:min-h-[38px]">
              Sources
              <span className="font-mono text-[10.5px] font-medium tabular-nums opacity-70">
                {providersLoading || providersUnavailable ? "–" : (providers?.length ?? 0)}
              </span>
            </TabsTrigger>
          </TabsList>
          <span aria-hidden="true" className="hidden h-px flex-1 bg-rule sm:block" />
        </div>

        <TabsContent value="providers" className="mt-0">
          {providersLoading ? (
            <PanelSkeleton rows={2} />
          ) : providersUnavailable ? (
            errorNotice("source", () => void providersQuery.refetch())
          ) : (
            <ProviderStatusPanel
              providers={providers ?? []}
              onClearAlert={handleClearAlert}
              canAdmin={canAdmin}
            />
          )}
        </TabsContent>

        <TabsContent value="series" className="mt-0">
          {seriesLoading ? (
            <PanelSkeleton rows={3} />
          ) : seriesUnavailable ? (
            errorNotice("series", () => void seriesQuery.refetch())
          ) : (
            <SeriesStatusPanel
              series={series ?? []}
              onClearAlert={handleClearAlert}
              canAdmin={canAdmin}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
