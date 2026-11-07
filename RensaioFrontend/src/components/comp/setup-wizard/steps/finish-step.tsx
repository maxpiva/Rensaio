"use client";

import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle, Download, Flag, LoaderCircle } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useSetupWizardImports, useSetupWizardImportSeriesWithOptions, useSetupWizardImportStatus, useSignalRProgress } from "@/lib/api/hooks/useSetupWizard";
import { JobType, ImportStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PaperBar, PaperNote, PaperPanel, PaperTag, StepIntro } from "../paper";

interface FinishStepProps {
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanProgress: (canProgress: boolean) => void;
  disableDownloads?: boolean;
  /** 2.0: surfaces users auto-created during import so the wizard can run its identify-user step. */
  onUsersDetected?: (users: string[]) => void;
  /** Called once the import has started (or was found already running) so the wizard can be closed. */
  onImportStarted?: () => void;
}

export function FinishStep({ setError, setIsLoading, setCanProgress, disableDownloads = false, onUsersDetected, onImportStarted }: FinishStepProps) {
  const hasTriggeredImportRef = useRef(false);
  const [importCompleted, setImportCompleted] = useState(false);
  // Whether we've checked the backend for an already-running import (after a reload).
  const [statusChecked, setStatusChecked] = useState(false);
  const hasCheckedUsersRef = useRef(false);
  const { data: imports } = useSetupWizardImports();
  const importMutation = useSetupWizardImportSeriesWithOptions();
  const importStatusMutation = useSetupWizardImportStatus();
  const { getProgressForJob, isJobCompleted, isJobFailed, getJobProgress } = useSignalRProgress({
    jobTypes: [JobType.ImportSeries],
    onComplete: (jobType) => {
      if (jobType === JobType.ImportSeries) {
        setImportCompleted(true);
      }
    },
    onError: (error, jobType) => {
      console.error(`Import failed: ${jobType}`, error);
      setError(`Import failed: ${error}`);
    },
  });

  // On mount, ask the backend whether an import is already running/queued/completed.
  // This survives a page reload: instead of restarting the import from scratch we
  // reconnect to the running job (or show the completed state).
  useEffect(() => {
    let cancelled = false;
    importStatusMutation.mutateAsync()
      .then((status) => {
        if (cancelled) return;
        if (status.isActive) {
          // An import is already in progress on the server - resume monitoring, don't restart it.
          hasTriggeredImportRef.current = true;
          onImportStarted?.();
        } else if (status.hasCompleted) {
          // The import already finished (e.g. reloaded after completion) - show success.
          hasTriggeredImportRef.current = true;
          setImportCompleted(true);
          onImportStarted?.();
        }
      })
      .catch(() => {
        // If the status check fails, fall back to the normal trigger behavior below.
      })
      .finally(() => {
        if (!cancelled) setStatusChecked(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single effect to handle import triggering
  useEffect(() => {
    // Wait until we know whether an import is already running so a reload doesn't restart it.
    if (!statusChecked) return;

    const alreadyCompleted = isJobCompleted(JobType.ImportSeries);
    const alreadyFailed = isJobFailed(JobType.ImportSeries);
    const progress = getJobProgress(JobType.ImportSeries);
    const alreadyRunning = progress > 0 && !alreadyCompleted && !alreadyFailed;

    // Only trigger if we haven't already triggered and job isn't running/completed/failed
    if (!hasTriggeredImportRef.current && !alreadyCompleted && !alreadyRunning && !alreadyFailed) {
      hasTriggeredImportRef.current = true;
      setError(null);
      onImportStarted?.();

      // Determine what to import
      if (imports && imports.length > 0) {
        const importsToProcess = imports.filter(item =>
          item.status === ImportStatus.Import || item.status === ImportStatus.DoNotChange
        );

        if (importsToProcess.length > 0) {
          importMutation.mutateAsync(disableDownloads).catch((error: unknown) => {
            console.error('Import failed:', error);
            setError('Failed to start import process');
            hasTriggeredImportRef.current = false; // Reset on error to allow retry
          });
        } else {
          setImportCompleted(true);
        }
      } else {
        importMutation.mutateAsync(disableDownloads).catch((error: unknown) => {
          console.error('Import failed:', error);
          setError('Failed to start import process');
          hasTriggeredImportRef.current = false; // Reset on error to allow retry
        });
      }
    }
  }, [statusChecked, imports, importMutation, setError, isJobCompleted, isJobFailed, getJobProgress]);

  // 2.0: after the import completes, fetch any users the backend auto-created during
  // import so the wizard's identify-user step can offer to claim/promote them.
  useEffect(() => {
    const isDone = importCompleted || isJobCompleted(JobType.ImportSeries);
    if (isDone && onUsersDetected && !hasCheckedUsersRef.current) {
      hasCheckedUsersRef.current = true;
      apiClient.get<{ autoCreatedUsers?: string[] }>('/api/setup/import/users')
        .then(data => {
          onUsersDetected(data.autoCreatedUsers ?? []);
        })
        .catch(() => {
          // Silently fail - user can manually create admin later
          onUsersDetected([]);
        });
    }
  }, [importCompleted, isJobCompleted, onUsersDetected]);

  // Update loading and progress states
  useEffect(() => {
    const isImporting = hasTriggeredImportRef.current && !importCompleted && !isJobCompleted(JobType.ImportSeries) && !isJobFailed(JobType.ImportSeries);
    setIsLoading(isImporting);
    setCanProgress(importCompleted || isJobCompleted(JobType.ImportSeries));
  }, [importCompleted, isJobCompleted, isJobFailed, setIsLoading, setCanProgress]);

  const progressData = getProgressForJob(JobType.ImportSeries);
  const progress = importCompleted || isJobCompleted(JobType.ImportSeries) ? 100 : getJobProgress(JobType.ImportSeries);
  const isFailed = isJobFailed(JobType.ImportSeries);
  const isDone = importCompleted || isJobCompleted(JobType.ImportSeries);
  const isActive = hasTriggeredImportRef.current && !isDone && !isFailed;

  const statusText = (() => {
    if (isFailed)  return 'Import process failed';
    if (isDone)    return 'Import process completed successfully';
    if (isActive)  return progressData?.message ?? 'Importing series…';
    return 'Preparing to import series…';
  })();

  const tag = isFailed
    ? <PaperTag tone="bad"><AlertCircle aria-hidden />Failed</PaperTag>
    : isDone
      ? <PaperTag tone="ok"><CheckCircle aria-hidden />Complete</PaperTag>
      : isActive
        ? <PaperTag tone="accent"><Download aria-hidden />Importing</PaperTag>
        : <PaperTag><Flag aria-hidden />Waiting</PaperTag>;

  // The wizard shell's content region scrolls; no nested scroll box here.
  return (
    <div className="max-w-[760px] space-y-4">
      <StepIntro>
        Final step: importing your selected series into the library. Please wait while the process completes.
      </StepIntro>

      {/* Progress panel */}
      <PaperPanel as="section" aria-labelledby="finish-import-title">
        <div className="flex items-center gap-3 border-b border-rule px-4 py-3.5">
          <span
            className={cn(
              'grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border-[1.5px]',
              isFailed && 'border-bad/35 bg-bad-soft text-bad',
              isDone && 'border-ok/35 bg-ok-soft text-ok',
              isActive && 'border-accent-line bg-accent-soft text-accent-ink',
              !isFailed && !isDone && !isActive && 'border-rule-2 text-ink-3',
            )}
          >
            {isFailed ? <AlertCircle className="h-4 w-4" aria-hidden />
              : isDone ? <CheckCircle className="h-4 w-4" aria-hidden />
              : isActive ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              : <Flag className="h-4 w-4" aria-hidden />}
          </span>
          <h3 id="finish-import-title" className="min-w-0 flex-1 font-serif text-[20px] font-normal leading-tight tracking-[-0.01em] text-ink">
            Series Import
          </h3>
          {tag}
        </div>
        <div className="px-4 pb-4 pt-3.5">
          <div className="mb-2 flex items-baseline justify-between gap-3 font-mono text-[12px] font-medium">
            <span className="min-w-0 text-ink-2 [overflow-wrap:anywhere]" role="status">{statusText}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{Math.round(progress)}%</span>
          </div>
          <PaperBar
            value={progress}
            size="lg"
            tone={isFailed ? 'bad' : isDone ? 'ok' : 'accent'}
            label="Series import progress"
          />
          {progressData?.errorMessage && (
            <div className="mt-3 rounded-[5px] border border-bad/30 bg-bad-soft px-3 py-2 font-mono text-[11.5px] leading-[1.5] text-ink [overflow-wrap:anywhere]">
              <strong className="text-bad">Error:</strong> {progressData.errorMessage}
            </div>
          )}
        </div>
      </PaperPanel>

      {/* Done banner */}
      {isDone && (
        <PaperNote tone="ok" className="motion-safe:animate-paper-rise">
          <b>Import process completed successfully</b>
        </PaperNote>
      )}

      {/* Fail banner */}
      {isFailed && (
        <PaperNote tone="bad" role="alert" className="motion-safe:animate-paper-rise">
          <b className="block">Import Failed</b>
          <span className="mt-0.5 block">
            The import process encountered an error. You can try again or skip this step and manually import series later.
          </span>
        </PaperNote>
      )}
    </div>
  );
}
