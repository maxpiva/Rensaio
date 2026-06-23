"use client";

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Flag } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useSetupWizardImports, useSetupWizardImportSeriesWithOptions, useSetupWizardImportStatus, useSignalRProgress } from "@/lib/api/hooks/useSetupWizard";
import { JobType, ImportStatus } from "@/lib/api/types";

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
  const { hasScrollbar, containerRef } = useScrollbarDetection();
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

  const heroCardClass = [
    'iw-hero-progress',
    isActive  ? 'is-active'  : '',
    isFailed  ? 'is-failed'  : '',
  ].filter(Boolean).join(' ');

  const iconClass = [
    'iw-hero-progress-icon',
    isFailed  ? 'is-failed'  : '',
    isDone    ? 'is-done'    : '',
    isActive  ? 'is-spinning': '',
    (!isFailed && !isDone && !isActive) ? 'is-idle' : '',
  ].filter(Boolean).join(' ');

  const renderHeroIcon = () => {
    if (isFailed)  return <AlertCircle className="h-5 w-5" />;
    if (isDone)    return <CheckCircle className="h-5 w-5" />;
    if (isActive)  return null; // CSS border-animation spinner
    return <Flag className="h-5 w-5" />;
  };

  const statusText = (() => {
    if (isFailed)  return 'Import process failed';
    if (isDone)    return 'Import process completed successfully';
    if (isActive)  return progressData?.message ?? 'Importing series…';
    return 'Preparing to import series…';
  })();

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Final step: importing your selected series into the library. Please wait while the process completes.
      </p>

      <div
        ref={containerRef}
        className={`max-h-[60vh] p-0.5 overflow-y-auto ${hasScrollbar ? 'pr-2' : ''}`}
      >
        <div className="space-y-3">
          {/* Hero progress card */}
          <div className={heroCardClass}>
            <div className="iw-hero-progress-head">
              <div className={iconClass}>
                {renderHeroIcon()}
              </div>
              <div className="iw-hero-info">
                <div className="iw-hero-title">Series Import</div>
                <div className="iw-hero-status">{statusText}</div>
              </div>
              <div className="iw-hero-pct">{Math.round(progress)}%</div>
            </div>
            <div className="iw-progress-bar">
              <div className="iw-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            {progressData?.errorMessage && (
              <div
                className="text-sm mt-3 p-2 rounded"
                style={{
                  color: 'hsl(var(--destructive))',
                  background: 'hsl(var(--destructive) / 0.1)',
                }}
              >
                <strong>Error:</strong> {progressData.errorMessage}
              </div>
            )}
          </div>

          {/* Done banner */}
          {isDone && (
            <div className="iw-done-banner">
              <CheckCircle />
              <span>Import process completed successfully</span>
            </div>
          )}

          {/* Fail banner */}
          {isFailed && (
            <div className="iw-fail-banner">
              <div className="iw-fail-banner-icon">
                <AlertCircle className="h-10 w-10" />
              </div>
              <p className="iw-fail-banner-title">Import Failed</p>
              <p className="iw-fail-banner-body">
                The import process encountered an error. You can try again or skip this step and manually import series later.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
