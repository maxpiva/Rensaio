"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Loader2, Maximize2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useSetupWizardImportStatus, useSignalRProgress } from "@/lib/api/hooks/useSetupWizard";
import { useSetupWizard } from "@/components/providers/setup-wizard-provider";
import { JobType } from "@/lib/api/types";

/**
 * Floating indicator shown while the setup wizard is minimized.
 *
 * The series import can take hours, so the wizard lets the user close (minimize) it once
 * the import has started and keep using the app. This pill surfaces the import's progress
 * and, when clicked, re-opens the wizard so the user can finish the remaining setup steps
 * (the wizard is NOT completed by minimizing it). It resumes correctly after a page reload.
 */
export function ImportProgressPill() {
  const { isWizardMinimized, reopenWizard } = useSetupWizard();
  if (!isWizardMinimized) return null;
  return <ImportProgressPillInner reopen={reopenWizard} />;
}

function ImportProgressPillInner({ reopen }: { reopen: () => void }) {
  const queryClient = useQueryClient();
  const importStatusMutation = useSetupWizardImportStatus();

  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleComplete = useCallback(() => {
    setDone(true);
    // Refresh the library so newly imported series appear without a manual reload.
    void queryClient.invalidateQueries({ queryKey: ["series", "library"] });
  }, [queryClient]);

  const { getProgressForJob, getJobProgress } = useSignalRProgress({
    jobTypes: [JobType.ImportSeries],
    onComplete: handleComplete,
    onError: () => setFailed(true),
  });

  // On mount, sync with the server in case the import already finished/failed while away.
  useEffect(() => {
    let cancelled = false;
    importStatusMutation.mutateAsync()
      .then((status) => {
        if (cancelled) return;
        if (status.hasCompleted) setDone(true);
        else if (status.hasFailed) setFailed(true);
      })
      .catch(() => {
        // Keep showing the in-progress state if the status check fails.
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressData = getProgressForJob(JobType.ImportSeries);
  const progress = done ? 100 : getJobProgress(JobType.ImportSeries);

  const title = failed
    ? "Import failed"
    : done
      ? "Import complete — finish setup"
      : "Importing library";

  const subtitle = failed
    ? progressData?.errorMessage ?? "Reopen setup to retry."
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
