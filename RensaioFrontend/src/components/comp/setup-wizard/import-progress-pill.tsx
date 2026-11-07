"use client";

import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Loader2, Maximize2 } from "lucide-react";
import { useSetupWizardStatus, useSignalRProgress } from "@/lib/api/hooks/useSetupWizard";
import { useSetupWizard } from "@/components/providers/setup-wizard-provider";
import { JobType, type SetupJobStatusValue } from "@/lib/api/types";

const SETUP_JOBS = [
  JobType.ScanLocalFiles,
  JobType.InstallAdditionalExtensions,
  JobType.SearchProviders,
  JobType.ImportSeries,
];

function jobLabel(job: JobType | null): string {
  switch (job) {
    case JobType.ScanLocalFiles: return "Scanning local files";
    case JobType.InstallAdditionalExtensions: return "Installing sources";
    case JobType.SearchProviders: return "Searching series";
    case JobType.ImportSeries: return "Importing library";
    default: return "Setting up your library";
  }
}

/**
 * Floating indicator shown while the setup wizard is minimized.
 *
 * The scan/search and the final import can each take a long time, so the wizard lets the
 * user close (minimize) it once a long-running step has started and keep using the app.
 * This pill surfaces the current step's progress and, when clicked, re-opens the wizard so
 * the user can finish the remaining setup steps (minimizing does NOT complete the wizard).
 * It resumes correctly after a page reload.
 */
export function ImportProgressPill() {
  const { isWizardMinimized, reopenWizard } = useSetupWizard();
  if (!isWizardMinimized) return null;
  return <ImportProgressPillInner reopen={reopenWizard} />;
}

function ImportProgressPillInner({ reopen }: { reopen: () => void }) {
  const queryClient = useQueryClient();
  const statusMutation = useSetupWizardStatus();

  const [currentJob, setCurrentJob] = useState<JobType | null>(null);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const { getProgressForJob, getJobProgress } = useSignalRProgress({
    jobTypes: SETUP_JOBS,
    onProgress: (p) => {
      setCurrentJob(p.jobType);
    },
    onComplete: (jobType) => {
      if (jobType === JobType.ImportSeries) {
        setDone(true);
        // Refresh the library so newly imported series appear without a manual reload.
        void queryClient.invalidateQueries({ queryKey: ["series", "library"] });
      }
    },
    onError: () => setFailed(true),
  });

  // On mount, sync with the server so the pill shows the right state after a reload.
  useEffect(() => {
    let cancelled = false;
    const inFlight = (s: SetupJobStatusValue) => s === "Running" || s === "Waiting";
    statusMutation.mutateAsync()
      .then((status) => {
        if (cancelled) return;
        if (status.importSeries === "Completed") {
          setDone(true);
          return;
        }
        // Pick the latest in-flight job to label the pill until SignalR sends updates.
        if (inFlight(status.searchProviders)) setCurrentJob(JobType.SearchProviders);
        else if (inFlight(status.installAdditionalExtensions)) setCurrentJob(JobType.InstallAdditionalExtensions);
        else if (inFlight(status.scanLocalFiles)) setCurrentJob(JobType.ScanLocalFiles);
        else if (inFlight(status.importSeries)) setCurrentJob(JobType.ImportSeries);
      })
      .catch(() => {
        // Keep showing the in-progress state if the status check fails.
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressData = currentJob !== null ? getProgressForJob(currentJob) : null;
  const progress = done ? 100 : currentJob !== null ? getJobProgress(currentJob) : 0;

  const title = failed
    ? "Setup paused"
    : done
      ? "Import complete — finish setup"
      : jobLabel(currentJob);

  const subtitle = failed
    ? progressData?.errorMessage ?? "Reopen setup to continue."
    : done
      ? "Tap to finish the remaining setup steps."
      : progressData?.message ?? "Running in the background — tap to reopen.";

  const pct = Math.round(progress);
  // Ring geometry for the 28px progress dial.
  const R = 11;
  const C = 2 * Math.PI * R;

  return (
    <button
      type="button"
      onClick={reopen}
      aria-label="Reopen setup wizard"
      className={[
        // Ink-inverted floating slip. Phone: full width above the tab bar and
        // the activity dock; desktop: centred at the foot of the page.
        "group fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+124px)] z-[60] flex items-center gap-3 rounded-[10px] bg-ink py-2.5 pl-3 pr-2.5 text-left text-paper shadow-lift",
        "outline-none transition-[transform,opacity] duration-200 hover:-translate-y-px focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:animate-paper-rise",
        "lg:inset-x-auto lg:bottom-6 lg:left-1/2 lg:w-[min(440px,calc(100vw-48px))] lg:-translate-x-1/2 lg:rounded-full lg:py-2 lg:hover:-translate-y-px",
      ].join(" ")}
    >
      {/* Status dial */}
      <span className="relative grid h-7 w-7 shrink-0 place-items-center" aria-hidden>
        {failed ? (
          <AlertCircle className="h-5 w-5 text-[hsl(var(--primary))]" />
        ) : done ? (
          <CheckCircle className="h-5 w-5 text-paper" />
        ) : (
          <>
            <svg viewBox="0 0 28 28" className="absolute inset-0 h-7 w-7 -rotate-90">
              <circle cx="14" cy="14" r={R} fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth={2.5} />
              <circle
                cx="14"
                cy="14"
                r={R}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C - (C * pct) / 100}
                className="transition-[stroke-dashoffset] duration-500 ease-out"
              />
            </svg>
            {pct === 0 && <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />}
          </>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 flex min-w-0 items-baseline gap-2 font-mono text-[11px] font-medium leading-tight opacity-75">
          <span className={failed ? "line-clamp-2 [overflow-wrap:anywhere]" : "truncate"}>{subtitle}</span>
          {!failed && <span className="ml-auto shrink-0 tabular-nums">{pct}%</span>}
        </span>
      </span>

      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper text-ink transition-transform group-hover:scale-105 max-lg:h-10 max-lg:w-10" aria-hidden>
        <Maximize2 className="h-4 w-4" />
      </span>
    </button>
  );
}
