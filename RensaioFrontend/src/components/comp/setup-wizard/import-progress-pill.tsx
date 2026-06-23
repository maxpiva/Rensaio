"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Loader2, Maximize2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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

  return (
    <button
      type="button"
      onClick={reopen}
      aria-label="Reopen setup wizard"
      className="fixed bottom-4 right-4 z-[60] w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-background/95 p-4 text-left shadow-lg backdrop-blur transition-colors hover:bg-accent supports-[backdrop-filter]:bg-background/80"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {failed ? (
            <AlertCircle className="h-5 w-5 text-destructive" />
          ) : done ? (
            <CheckCircle className="h-5 w-5 text-primary" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{title}</span>
            <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          {!failed && (
            <div className="mt-2 space-y-1">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate">{subtitle}</span>
                <span className="shrink-0">{Math.round(progress)}%</span>
              </div>
            </div>
          )}
          {failed && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    </button>
  );
}
