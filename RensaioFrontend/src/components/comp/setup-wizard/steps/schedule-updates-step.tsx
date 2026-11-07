"use client";

import React, { useState, useEffect, useLayoutEffect } from 'react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Download, Calendar, Library, Plug } from "lucide-react";
import { useSetupWizardImportTotals } from "@/lib/api/hooks/useSetupWizard";
import type { ImportTotals } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PaperNote, StepIntro, StepLabel } from "../paper";

interface ScheduleUpdatesStepProps {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCanProgress: React.Dispatch<React.SetStateAction<boolean>>;
  onDownloadOptionChange?: (disableDownloads: boolean) => void;
}

export function ScheduleUpdatesStep({
  setError,
  setIsLoading,
  setCanProgress,
  onDownloadOptionChange,
}: ScheduleUpdatesStepProps) {
  const [downloadOption, setDownloadOption] = useState<string>("proceed");
  const [importTotals, setImportTotals] = useState<ImportTotals | null>(null);

  const {
    data: totalsData,
    error: totalsError,
    isLoading: totalsLoading,
    refetch: refetchTotals,
  } = useSetupWizardImportTotals();

  // Always allow progress — this step has no blocking precondition.
  // The parent wizard shell resets canProgress → false on every step change
  // via useEffect([currentStep]). That effect runs before child effects in
  // the commit phase, so a mount-only useEffect with a stable dependency
  // won't re-fire if the component is merely re-rendered (not re-mounted).
  // Using useLayoutEffect without deps guarantees it runs after *every*
  // render cycle, re-asserting canProgress → true regardless of the
  // parent-effect ordering or query-state transitions.
  useLayoutEffect(() => {
    setCanProgress(true);
  });

  // Load import totals when component mounts
  useEffect(() => {
    void refetchTotals();
  }, [refetchTotals]);

  // Handle totals data
  useEffect(() => {
    if (totalsData) {
      setImportTotals(totalsData);
      setError(null);
    }
  }, [totalsData, setError]);

  // Handle loading state
  useEffect(() => {
    setIsLoading(totalsLoading);
  }, [totalsLoading, setIsLoading]);

  // Handle errors
  useEffect(() => {
    if (totalsError) {
      setError(`Failed to load import totals: ${totalsError.message}`);
    } else {
      setError(null);
    }
  }, [totalsError, setError]);

  // Handle download option changes
  useEffect(() => {
    const disableDownloads = downloadOption === "disable";
    onDownloadOptionChange?.(disableDownloads);
  }, [downloadOption, onDownloadOptionChange]);

  const handleDownloadOptionChange = (value: string) => {
    setDownloadOption(value);
  };

  if (totalsLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading import totals...">
        <span className="flex items-center gap-2 font-mono text-[11.5px] font-medium text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-ink" aria-hidden />
          Loading import totals...
        </span>
        <Skeleton className="h-[112px] w-full max-w-[760px]" />
        <Skeleton className="h-[160px] w-full max-w-[640px]" />
      </div>
    );
  }

  if (!importTotals) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed border-rule-2 bg-paper-1 px-6 text-center">
        <p className="font-serif text-[20px] italic text-ink-2">No import data available</p>
      </div>
    );
  }

  const stats = [
    { label: "Series", value: importTotals.totalSeries, Icon: Library },
    { label: "Sources", value: importTotals.totalProviders, Icon: Plug },
    { label: "Scheduled Downloads", value: importTotals.totalDownloads, Icon: Download },
  ];

  const options = [
    {
      value: "proceed",
      title: "Proceed with scheduled downloads",
      body: `All ${importTotals.totalDownloads} pending downloads will be automatically scheduled and start downloading according to your configured settings.`,
    },
    {
      value: "disable",
      title: "Start with downloads disabled",
      body: "All series sources will be imported but disabled. You can manually enable them one by one from the series management page when you're ready.",
    },
  ];

  return (
    <div className="max-w-[760px] space-y-7">
      <StepIntro>
        Review the incoming schedule, and choose between hell let loose now, or do in steps.
      </StepIntro>

      {/* Import Totals Summary */}
      <section aria-labelledby="sched-summary">
        <StepLabel as="h3">
          <span id="sched-summary" className="inline-flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            Import Summary
          </span>
        </StepLabel>
        <dl className="grid grid-cols-3 overflow-hidden rounded-md border border-rule bg-paper-1 shadow-paper max-sm:grid-cols-1">
          {stats.map(({ label, value, Icon }, i) => (
            <div
              key={label}
              className={cn(
                "flex flex-col gap-2 px-5 py-[18px] motion-safe:animate-paper-rise",
                "max-sm:flex-row max-sm:items-baseline max-sm:justify-between max-sm:px-4 max-sm:py-3.5",
                i > 0 && "border-l border-rule max-sm:border-l-0 max-sm:border-t",
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <dt className="paper-eyebrow flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </dt>
              <dd className="font-serif text-[44px] font-normal leading-none tracking-[-0.03em] text-ink tabular-nums max-sm:text-[32px]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Download Options */}
      <section aria-labelledby="sched-options" className="max-w-[640px]">
        <StepLabel as="h3">
          <span id="sched-options">Download Schedule Options</span>
        </StepLabel>
        <RadioGroup
          value={downloadOption}
          onValueChange={handleDownloadOptionChange}
          className="flex flex-col gap-2"
          aria-labelledby="sched-options"
        >
          {options.map((o) => {
            const checked = downloadOption === o.value;
            return (
              <Label
                key={o.value}
                htmlFor={o.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-3 font-normal transition-[background-color,border-color,box-shadow] duration-150",
                  checked
                    ? "border-primary bg-accent-soft shadow-[inset_3px_0_0_hsl(var(--primary))]"
                    : "border-rule-2 bg-paper hover:border-ink-3 hover:bg-paper-1",
                )}
              >
                <RadioGroupItem value={o.value} id={o.value} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px] font-semibold text-ink">{o.title}</b>
                  <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-ink-2">{o.body}</span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>

        {downloadOption === "disable" && (
          <PaperNote tone="warn" role="status" className="mt-3.5 motion-safe:animate-paper-rise">
            <b>Note: Downloads will be disabled</b>
            <span className="mt-0.5 block text-[12.5px]">
              You&apos;ll need to manually enable sources for each series in the series management page to start downloading new chapters.
            </span>
          </PaperNote>
        )}
      </section>
    </div>
  );
}
