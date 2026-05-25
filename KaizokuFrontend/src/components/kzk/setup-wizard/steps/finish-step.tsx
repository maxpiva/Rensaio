"use client";

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Loader2, Flag } from "lucide-react";
import { useSetupWizardImports, useSetupWizardImportSeriesWithOptions, useSignalRProgress } from "@/lib/api/hooks/useSetupWizard";
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
}

export function FinishStep({ setError, setIsLoading, setCanProgress, disableDownloads = false }: FinishStepProps) {
  const hasTriggeredImportRef = useRef(false);
  const [importCompleted, setImportCompleted] = useState(false);
  const { hasScrollbar, containerRef } = useScrollbarDetection();
  const { data: imports } = useSetupWizardImports();
  const importMutation = useSetupWizardImportSeriesWithOptions();
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

  // Single effect to handle import triggering
  useEffect(() => {
    const alreadyCompleted = isJobCompleted(JobType.ImportSeries);
    const alreadyFailed = isJobFailed(JobType.ImportSeries);
    const progress = getJobProgress(JobType.ImportSeries);
    const alreadyRunning = progress > 0 && !alreadyCompleted && !alreadyFailed;

    // Only trigger if we haven't already triggered and job isn't running/completed/failed
    if (!hasTriggeredImportRef.current && !alreadyCompleted && !alreadyRunning && !alreadyFailed) {
      hasTriggeredImportRef.current = true;
      setError(null);

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
  }, [imports, importMutation, setError, isJobCompleted, isJobFailed, getJobProgress]);

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
