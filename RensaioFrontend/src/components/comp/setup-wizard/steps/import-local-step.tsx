"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import {
  useSetupWizardScanLocalFiles,
  useSetupWizardInstallExtensions,
  useSetupWizardSearchSeries,
  useSetupWizardStatus,
  useSignalRProgress
} from "@/lib/api/hooks/useSetupWizard";
import { JobType, type SetupJobStatusValue } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PaperBar, PaperNote, PaperPanel, StepIntro } from "../paper";

interface ImportLocalStepProps {
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanProgress: (canProgress: boolean) => void;
  /** Called once the scan/import process has started (or was found already running). */
  onProcessStarted?: () => void;
  /**
   * Import wizard mode: always run a fresh scan instead of treating a previous run's
   * completed jobs as "already done". A scan that is genuinely in-flight (e.g. the page
   * was reloaded mid-scan) is still resumed rather than restarted.
   */
  forceRescan?: boolean;
}

interface ActionProgressProps {
  title: string;
  isActive: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  progress: number;
  message?: string;
  errorMessage?: string;
}

function ActionProgress({
  index,
  title,
  isActive,
  isCompleted,
  isFailed,
  progress,
  message,
  errorMessage
}: ActionProgressProps & { index: number }) {
  const isIdle = !isActive && !isCompleted && !isFailed;

  const pctLabel = isCompleted
    ? '100%'
    : isActive || isFailed
      ? `${Math.round(progress)}%`
      : '—';

  const statusText = message ?? (isCompleted ? 'Complete' : isActive ? 'Running…' : 'Queued');

  return (
    <li
      className={cn(
        'grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-rule px-4 py-4 last:border-b-0 max-sm:gap-3 max-sm:px-3.5',
        isActive && 'bg-paper',
      )}
      aria-current={isActive ? 'step' : undefined}
    >
      <span
        className={cn(
          'grid h-[34px] w-[34px] place-items-center rounded-full border-[1.5px] font-mono text-[12px] font-semibold transition-colors duration-300',
          isCompleted && 'border-ok/35 bg-ok-soft text-ok',
          isFailed && 'border-bad/35 bg-bad-soft text-bad',
          isActive && 'border-accent-line bg-accent-soft text-accent-ink',
          isIdle && 'border-rule-2 text-ink-3',
        )}
      >
        {isFailed ? (
          <AlertCircle className="h-4 w-4" aria-hidden />
        ) : isCompleted ? (
          <Check className="h-4 w-4 stroke-[2.4]" aria-hidden />
        ) : isActive ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          index + 1
        )}
      </span>

      <div className="min-w-0">
        <b className={cn('block text-[14px] font-semibold', isIdle ? 'text-ink-3' : 'text-ink')}>{title}</b>
        <div className="mt-0.5 text-[12.5px] leading-[1.45] text-ink-3 [overflow-wrap:anywhere]">{statusText}</div>
        <PaperBar
          value={isCompleted ? 100 : progress}
          size="lg"
          tone={isFailed ? 'bad' : isCompleted ? 'ok' : 'accent'}
          className="mt-2.5"
          label={`${title} progress`}
        />
        {errorMessage && (
          <div className="mt-2 font-mono text-[11.5px] leading-[1.5] text-bad [overflow-wrap:anywhere]">{errorMessage}</div>
        )}
      </div>

      <span className={cn('font-mono text-[12px] font-semibold tabular-nums', isIdle ? 'text-ink-3' : 'text-ink')}>
        {pctLabel}
      </span>
    </li>
  );
}

export function ImportLocalStep({ setError, setIsLoading, setCanProgress, onProcessStarted, forceRescan }: ImportLocalStepProps) {
  const [currentActionIndex, setCurrentActionIndex] = useState(-1);
  const [allActionsCompleted, setAllActionsCompleted] = useState(false);
  // Jobs that the server reports already completed (e.g. before a page reload) so the UI
  // shows them done instead of resetting to 0% (SignalR has no history after a reload).
  const [serverCompleted, setServerCompleted] = useState<Set<JobType>>(new Set());

  // Use only refs for duplicate prevention - no state
  const completedJobsRef = useRef<Set<JobType>>(new Set());
  const processingJobRef = useRef<JobType | null>(null);
  const hasStartedRef = useRef(false);

  const scanMutation = useSetupWizardScanLocalFiles();
  const installMutation = useSetupWizardInstallExtensions();
  const searchMutation = useSetupWizardSearchSeries();
  const statusMutation = useSetupWizardStatus();

  const handleJobComplete = useCallback((jobType: JobType) => {
    // Check if we've already processed this job completion using ref
    if (completedJobsRef.current.has(jobType)) {
      return;
    }

    // Check if we're currently processing this job (prevents race conditions) using ref
    if (processingJobRef.current === jobType) {
      return;
    }

    processingJobRef.current = jobType;

    // Add to completed jobs immediately to prevent duplicates
    completedJobsRef.current.add(jobType);

    // Trigger next action based on job type immediately without timeout
    const triggerNextAction = async () => {
      try {
        if (jobType === JobType.ScanLocalFiles) {
          setCurrentActionIndex(1);
          await installMutation.mutateAsync();
        } else if (jobType === JobType.InstallAdditionalExtensions) {
          setCurrentActionIndex(2);
          await searchMutation.mutateAsync();
        } else if (jobType === JobType.SearchProviders) {
          setAllActionsCompleted(true);
          setCurrentActionIndex(-1);
        }
      } catch (error) {
        console.error(`Failed to trigger next action after ${jobType}:`, error);
        setError(`Failed to continue after ${jobType === JobType.ScanLocalFiles ? 'scan' : jobType === JobType.InstallAdditionalExtensions ? 'install' : 'search'}`);
        setCurrentActionIndex(-1);
      } finally {
        processingJobRef.current = null;
      }
    };

    // Execute immediately without timeout to reduce race conditions
    void triggerNextAction();
  }, [installMutation, searchMutation, setError]);

  const handleJobError = useCallback((error: string, jobType: JobType) => {
    console.error(`Job failed: ${jobType}`, error);
    setError(`Action failed: ${error}`);
    setCurrentActionIndex(-1);
    processingJobRef.current = null;
  }, [setError]);

  const { getProgressForJob, isJobCompleted, isJobFailed, getJobProgress } = useSignalRProgress({
    jobTypes: [JobType.ScanLocalFiles, JobType.InstallAdditionalExtensions, JobType.SearchProviders],
    onComplete: handleJobComplete,
    onError: handleJobError,
  });

  const actions = [
    {
      title: "Scan Local Files",
      jobType: JobType.ScanLocalFiles,
    },
    {
      title: "Install Additional Sources",
      jobType: JobType.InstallAdditionalExtensions,
    },
    {
      title: "Search Series",
      jobType: JobType.SearchProviders,
    },
  ];

  const triggerAction = useCallback((index: number) => {
    setCurrentActionIndex(index);
    const mutation = index === 0 ? scanMutation : index === 1 ? installMutation : searchMutation;
    const label = index === 0 ? 'scan' : index === 1 ? 'install' : 'search';
    mutation.mutateAsync().catch((error) => {
      console.error(`Failed to start ${label}:`, error);
      setError(`Failed to start ${label} process`);
      setCurrentActionIndex(-1);
      hasStartedRef.current = false; // Reset on error to allow retry
    });
  }, [scanMutation, installMutation, searchMutation, setError]);

  // On mount, reconcile with the server so a page reload resumes the running step instead
  // of restarting the whole scan/install/search chain from scratch.
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    setError(null);

    const isCompleted = (s: SetupJobStatusValue) => s === 'Completed';
    const isInFlight = (s: SetupJobStatusValue) => s === 'Running' || s === 'Waiting';

    statusMutation.mutateAsync()
      .then((status) => {
        onProcessStarted?.();
        const order: { index: number; status: SetupJobStatusValue }[] = [
          { index: 0, status: status.scanLocalFiles },
          { index: 1, status: status.installAdditionalExtensions },
          { index: 2, status: status.searchProviders },
        ];

        const inFlight = order.find((a) => isInFlight(a.status));

        // Import wizard: ignore stale "Completed" statuses left over from a previous import
        // run. Only resume a scan that is genuinely in-flight (e.g. reloaded mid-scan);
        // otherwise always kick off a fresh scan from the beginning.
        if (forceRescan) {
          if (inFlight) {
            // Mark earlier steps done so they show 100%, then resume monitoring the running one.
            const completed = new Set<JobType>();
            for (const a of order) {
              if (a.index < inFlight.index && isCompleted(a.status)) {
                completed.add(actions[a.index]!.jobType);
                completedJobsRef.current.add(actions[a.index]!.jobType);
              }
            }
            if (completed.size > 0) setServerCompleted(completed);
            setCurrentActionIndex(inFlight.index);
          } else {
            triggerAction(0);
          }
          return;
        }

        // Setup wizard: resume completed/running jobs across a page reload.
        // Mark already-completed jobs as done (so they don't show 0%).
        const completed = new Set<JobType>();
        for (const a of order) {
          if (isCompleted(a.status)) {
            completed.add(actions[a.index]!.jobType);
            completedJobsRef.current.add(actions[a.index]!.jobType);
          }
        }
        if (completed.size > 0) setServerCompleted(completed);

        const firstIncomplete = order.find((a) => !isCompleted(a.status));
        if (!firstIncomplete) {
          // Everything already finished.
          setAllActionsCompleted(true);
          setCurrentActionIndex(-1);
          return;
        }

        if (isInFlight(firstIncomplete.status)) {
          // Already running/queued on the server - just monitor it, don't restart.
          setCurrentActionIndex(firstIncomplete.index);
        } else {
          // Not started (or previously failed) - (re)start from this step.
          triggerAction(firstIncomplete.index);
        }
      })
      .catch(() => {
        // If the status check fails, fall back to starting from the beginning.
        onProcessStarted?.();
        triggerAction(0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  // Update loading and progress states
  useEffect(() => {
    const isAnyActionRunning = currentActionIndex >= 0;
    setIsLoading(isAnyActionRunning);
    setCanProgress(allActionsCompleted);
  }, [currentActionIndex, allActionsCompleted, setIsLoading, setCanProgress]);

  // The wizard shell's content region scrolls; no nested scroll box here.
  return (
    <div className="max-w-[760px] space-y-4">
      <StepIntro>
        Scanning local files, installing sources, and searching for series matches. All actions
        run automatically — this may take a few minutes depending on the number of series and sources.
      </StepIntro>

      <PaperPanel as="ol" aria-label="Import actions">
        {actions.map((action, index) => {
          const isCompleted = isJobCompleted(action.jobType) || serverCompleted.has(action.jobType);
          const isActive = currentActionIndex === index && !isCompleted;
          const isFailed = isJobFailed(action.jobType);
          const progress = isCompleted ? 100 : getJobProgress(action.jobType);
          const progressData = getProgressForJob(action.jobType);

          return (
            <ActionProgress
              key={action.jobType}
              index={index}
              title={action.title}
              isActive={isActive}
              isCompleted={isCompleted}
              isFailed={isFailed}
              progress={progress}
              message={progressData?.message}
              errorMessage={progressData?.errorMessage}
            />
          );
        })}
      </PaperPanel>

      {allActionsCompleted && (
        <PaperNote tone="ok" role="status" className="motion-safe:animate-paper-rise">
          <b>Series process completed successfully</b>
        </PaperNote>
      )}
    </div>
  );
}
