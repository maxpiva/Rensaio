"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, AlertCircle, Loader2, Circle } from "lucide-react";
import {
  useSetupWizardScanLocalFiles,
  useSetupWizardInstallExtensions,
  useSetupWizardSearchSeries,
  useSignalRProgress
} from "@/lib/api/hooks/useSetupWizard";
import { JobType } from "@/lib/api/types";

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
  const cardClass = [
    'iw-scan-card',
    isActive    ? 'is-active' : '',
    isCompleted ? 'is-done'   : '',
    isFailed    ? 'is-failed' : '',
  ].filter(Boolean).join(' ');

  const iconClass = [
    'iw-scan-icon',
    isFailed    ? 'is-failed'  : '',
    isCompleted ? 'is-done'    : '',
    isActive    ? 'is-spinning': '',
    (!isFailed && !isCompleted && !isActive) ? 'is-idle' : '',
  ].filter(Boolean).join(' ');

  const renderIcon = () => {
    if (isFailed)    return <AlertCircle />;
    if (isCompleted) return <CheckCircle />;
    if (isActive)    return null; // spinner via CSS border animation
    return <Circle />;
  };

  const pctLabel = isCompleted
    ? '100%'
    : isActive || isFailed
      ? `${Math.round(progress)}%`
      : '—';

  const statusText = message ?? (isCompleted ? 'Complete' : isActive ? 'Running…' : 'Queued');

  return (
    <div className={cardClass}>
      <div className={iconClass}>
        {renderIcon()}
      </div>

      <div className="iw-scan-body">
        <div className="iw-scan-label">{title}</div>
        <div className="iw-progress-bar">
          <div
            className="iw-progress-fill"
            style={{ width: `${isCompleted ? 100 : progress}%` }}
          />
        </div>
        <div className="iw-scan-status">{statusText}</div>
        {errorMessage && (
          <div className="iw-scan-error">{errorMessage}</div>
        )}
      </div>

      <div className={`iw-scan-pct${(!isActive && !isCompleted && !isFailed) ? ' is-muted' : ''}`}>
        {pctLabel}
      </div>
    </div>
  );
}

export function ImportLocalStep({ setError, setIsLoading, setCanProgress }: ImportLocalStepProps) {
  const [currentActionIndex, setCurrentActionIndex] = useState(-1);
  const [allActionsCompleted, setAllActionsCompleted] = useState(false);
  const { hasScrollbar, containerRef } = useScrollbarDetection();

  // Use only refs for duplicate prevention - no state
  const completedJobsRef = useRef<Set<JobType>>(new Set());
  const processingJobRef = useRef<JobType | null>(null);
  const hasStartedRef = useRef(false);

  const scanMutation = useSetupWizardScanLocalFiles();
  const installMutation = useSetupWizardInstallExtensions();
  const searchMutation = useSetupWizardSearchSeries();

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

  // Auto-start the import process when component mounts (only once)
  useEffect(() => {
    if (!hasStartedRef.current && !scanMutation.isPending) {
      hasStartedRef.current = true;
      setError(null);
      setCurrentActionIndex(0);

      // Start the scan process
      scanMutation.mutateAsync().catch((error) => {
        console.error('Scan failed:', error);
        setError('Failed to start scan process');
        setCurrentActionIndex(-1);
        hasStartedRef.current = false; // Reset on error to allow retry
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  // Update loading and progress states
  useEffect(() => {
    const isAnyActionRunning = currentActionIndex >= 0;
    setIsLoading(isAnyActionRunning);
    setCanProgress(allActionsCompleted);
  }, [currentActionIndex, allActionsCompleted, setIsLoading, setCanProgress]);

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Scanning local files, installing sources, and searching for series matches. This may take a few minutes.
      </p>

      <div
        ref={containerRef}
        className={`max-h-[60vh] p-0.5 overflow-y-auto ${hasScrollbar ? 'pr-2' : ''}`}
      >
        <div>
          {actions.map((action, index) => {
            const isActive = currentActionIndex === index;
            const isCompleted = isJobCompleted(action.jobType);
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
            <div className="iw-done-banner" style={{ marginTop: '12px' }}>
              <CheckCircle />
              <span>Series process completed successfully</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
