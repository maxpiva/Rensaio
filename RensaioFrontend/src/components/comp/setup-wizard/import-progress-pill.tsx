"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useSetupWizardImportStatus, useSignalRProgress } from "@/lib/api/hooks/useSetupWizard";
import { useSetupWizard } from "@/components/providers/setup-wizard-provider";
import { useAuth } from "@/contexts/auth-context";
import { JobType } from "@/lib/api/types";

/**
 * Gate so the indicator's status poll and SignalR connection only run for an
 * authenticated session (not on the login / user-select screens).
 */
export function ImportProgressPill() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return <ImportProgressPillInner />;
}

/**
 * A small floating indicator that surfaces the series-import job while it runs in the
 * background. It lets users close/finish the setup wizard and keep using the app while a
 * large library import (which can take hours) continues on the server.
 *
 * On mount it asks the backend whether an import is already running so the indicator
 * resumes after a page reload or reconnect instead of disappearing.
 */
function ImportProgressPillInner() {
  const queryClient = useQueryClient();
  const { isWizardActive } = useSetupWizard();
  const importStatusMutation = useSetupWizardImportStatus();

  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleComplete = useCallback(() => {
    setDone(true);
    setActive(false);
    // Refresh the library so newly imported series appear without a manual reload.
    void queryClient.invalidateQueries({ queryKey: ["series", "library"] });
  }, [queryClient]);

  const handleError = useCallback(() => {
    setFailed(true);
    setActive(false);
  }, []);

  const { getProgressForJob, getJobProgress } = useSignalRProgress({
    jobTypes: [JobType.ImportSeries],
    onProgress: () => {
      // A live progress event means an import is running - show the indicator.
      setActive(true);
      setDone(false);
      setFailed(false);
      setDismissed(false);
    },
    onComplete: handleComplete,
    onError: handleError,
  });

  // On mount, reconnect to an import that may already be running on the server.
  useEffect(() => {
    let cancelled = false;
    importStatusMutation.mutateAsync()
      .then((status) => {
        if (cancelled) return;
        if (status.isActive) {
          setActive(true);
        }
      })
      .catch(() => {
        // No import status available - keep the indicator hidden.
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-hide a short while after completion.
  useEffect(() => {
    if (done) {
      hideTimerRef.current = setTimeout(() => setDismissed(true), 6000);
      return () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      };
    }
  }, [done]);

  // Don't compete with the wizard, which shows its own progress.
  if (isWizardActive || dismissed) return null;
  if (!active && !done && !failed) return null;

  const progressData = getProgressForJob(JobType.ImportSeries);
  const progress = done ? 100 : getJobProgress(JobType.ImportSeries);

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
      role="status"
      aria-live="polite"
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
            <span className="text-sm font-medium">
              {failed ? "Import failed" : done ? "Import complete" : "Importing library"}
            </span>
            {(done || failed) && (
              <button
                type="button"
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDismissed(true)}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!failed && (
            <div className="mt-2 space-y-1">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate">
                  {done
                    ? "Your library is ready"
                    : progressData?.message ?? "Running in the background…"}
                </span>
                <span className="shrink-0">{Math.round(progress)}%</span>
              </div>
            </div>
          )}
          {failed && (
            <p className="mt-1 text-xs text-muted-foreground">
              {progressData?.errorMessage ?? "The import stopped. You can re-run it from the setup wizard."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
