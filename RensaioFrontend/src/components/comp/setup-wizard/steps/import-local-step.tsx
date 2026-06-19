"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useSetupWizardScanLocalFiles,
  useSetupWizardInstallExtensions,
  useSetupWizardSearchSeries,
  useSetupWizardStatus,
  useSignalRProgress
} from "@/lib/api/hooks/useSetupWizard";
import { JobType, type SetupJobStatusValue } from "@/lib/api/types";

// Custom hook to detect if scrollbar is visible
function useScrollbarDetection() {
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    const checkScrollbar = () => {
      if (containerRef.current) {
        const { scrollHeight, clientHeight } = containerRef.current;
        const newHasScrollbar = scrollHeight > clientHeight;
        setHasScrollbar(prev => prev !== newHasScrollbar ? newHasScrollbar : prev);
      }
    };

    const debouncedCheck = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(checkScrollbar, 100);
    };

    checkScrollbar();

    const observer = new ResizeObserver(debouncedCheck);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { hasScrollbar, containerRef };
}

interface ImportLocalStepProps {
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanProgress: (canProgress: boolean) => void;
  /** Called once the scan/import process has started (or was found already running). */
  onProcessStarted?: () => void;
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
  title,
  isActive,
  isCompleted,
  isFailed,
  progress,
  message,
  errorMessage
}: ActionProgressProps) {
  const getIcon = () => {
    if (isFailed) return <AlertCircle className="h-5 w-5 text-destructive" />;
    if (isCompleted) return <CheckCircle className="h-5 w-5 text-primary" />;
    if (isActive) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />;
  };

  return (
    <Card className={`w-full ${isActive ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-base">
          {getIcon()}
          <span>{title}</span>
          {isFailed && (
            <span className="text-sm text-destructive font-normal">Failed</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{message ?? 'Waiting...'}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          {errorMessage && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {errorMessage}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ImportLocalStep({ setError, setIsLoading, setCanProgress, onProcessStarted }: ImportLocalStepProps) {
  const [currentActionIndex, setCurrentActionIndex] = useState(-1);
  const [allActionsCompleted, setAllActionsCompleted] = useState(false);
  // Jobs that the server reports already completed (e.g. before a page reload) so the UI
  // shows them done instead of resetting to 0% (SignalR has no history after a reload).
  const [serverCompleted, setServerCompleted] = useState<Set<JobType>>(new Set());
  const { hasScrollbar, containerRef } = useScrollbarDetection();

  // Use only refs for duplicate prevention - no state
  const completedJobsRef = useRef<Set<JobType>>(new Set());
  const processingJobRef = useRef<JobType | null>(null);
  const hasStartedRef = useRef(false);

  const scanMutation = useSetupWizardScanLocalFiles();
  const installMutation = useSetupWizardInstallExtensions();
  const searchMutation = useSetupWizardSearchSeries();
  const statusMutation = useSetupWizardStatus();  const handleJobComplete = useCallback((jobType: JobType) => {
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
  }, [currentActionIndex, allActionsCompleted, setIsLoading, setCanProgress]); return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        This step will automatically scan your local files, install any needed sources, and search for series matches.<br/>
        All actions will run automatically. This may take a few minutes depending on the number of series being imported and the sources selected.
      </div>

      <div
        ref={containerRef}
        className={`max-h-[60vh] p-0.5 overflow-y-auto max-[768px]:max-h-none max-[768px]:overflow-visible ${hasScrollbar ? 'pr-2' : ''}`}
      >
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Import Progress</h3>

          {actions.map((action, index) => {
            const isCompleted = isJobCompleted(action.jobType) || serverCompleted.has(action.jobType);
            const isActive = currentActionIndex === index && !isCompleted;
            const isFailed = isJobFailed(action.jobType);
            const progress = isCompleted ? 100 : getJobProgress(action.jobType);
            const progressData = getProgressForJob(action.jobType);

            return (
              <ActionProgress
                key={action.jobType}
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

          {allActionsCompleted && (
            <div className="bg-secondary border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                <span className="text font-medium">
                  Series process completed successfully!
                </span>
              </div>
              <p className="text text-sm mt-1">
                You can now proceed to review and confirm the imported series.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
