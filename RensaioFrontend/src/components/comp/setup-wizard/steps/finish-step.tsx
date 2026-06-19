"use client";
import { apiClient } from '@/lib/api/client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Loader2, Flag, MinusCircle } from "lucide-react";
import { useSetupWizardImports, useSetupWizardImportSeriesWithOptions, useSetupWizardImportStatus, useSignalRProgress } from "@/lib/api/hooks/useSetupWizard";
import { useSetupWizard } from "@/components/providers/setup-wizard-provider";
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
  onUsersDetected?: (users: string[]) => void;
}

export function FinishStep({ setError, setIsLoading, setCanProgress, disableDownloads = false, onUsersDetected }: FinishStepProps) {
  const hasTriggeredImportRef = useRef(false);
  const [importCompleted, setImportCompleted] = useState(false);
  // Whether we've checked the backend for an already-running import (after a reload).
  const [statusChecked, setStatusChecked] = useState(false);
  // True when we reconnected to an import that was already in progress (page reload / reconnect).
  const [resumed, setResumed] = useState(false);
  const hasCheckedUsersRef = useRef(false);
  const { hasScrollbar, containerRef } = useScrollbarDetection();
  const { data: imports } = useSetupWizardImports();
  const importMutation = useSetupWizardImportSeriesWithOptions();
  const importStatusMutation = useSetupWizardImportStatus();
  const { nextStep } = useSetupWizard();
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
          setResumed(true);
        } else if (status.hasCompleted) {
          // The import already finished (e.g. reloaded after completion) - show success.
          hasTriggeredImportRef.current = true;
          setImportCompleted(true);
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
      
      // Determine what to import
      if (imports && imports.length > 0) {
        const importsToProcess = imports.filter(item =>
          item.status === ImportStatus.Import || item.status === ImportStatus.DoNotChange
        );
          if (importsToProcess.length > 0) {
           importMutation.mutateAsync(disableDownloads).catch((error: any) => {
            console.error('Import failed:', error);
            setError('Failed to start import process');
            hasTriggeredImportRef.current = false; // Reset on error to allow retry
          });
        } else {
          setImportCompleted(true);
        }
      } else {
        importMutation.mutateAsync(disableDownloads).catch((error: any) => {
          console.error('Import failed:', error);
          setError('Failed to start import process');
          hasTriggeredImportRef.current = false; // Reset on error to allow retry
        });
      }
    }
  }, [statusChecked, imports, importMutation, setError, isJobCompleted, isJobFailed, getJobProgress]);

  // Check for auto-created users after import completes
  useEffect(() => {
    const isDone = importCompleted || isJobCompleted(JobType.ImportSeries);
    if (isDone && onUsersDetected && !hasCheckedUsersRef.current) {
      hasCheckedUsersRef.current = true;
      // Fetch auto-created users from the backend
      apiClient.get<{ autoCreatedUsers?: string[] }>('/api/setup/import/users')
        .then(data => {
          if (data.autoCreatedUsers) {
            onUsersDetected(data.autoCreatedUsers);
          }
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
  const isActive = hasTriggeredImportRef.current && !importCompleted && !isJobCompleted(JobType.ImportSeries) && !isFailed;

  const getIcon = () => {
    if (isFailed) return <AlertCircle className="h-6 w-6 text-destructive" />;
    if (importCompleted || isJobCompleted(JobType.ImportSeries)) return <CheckCircle className="h-6 w-6 text-primary" />;
    if (isActive) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
    return <Flag className="h-6 w-6 text-muted-foreground" />;
  };

  const getStatusMessage = () => {
    if (isFailed) return "Import process failed";
    if (importCompleted || isJobCompleted(JobType.ImportSeries)) return "Import process completed successfully!";
    if (isActive) return resumed && progress === 0 ? "Resuming import..." : "Importing series...";
    return "Preparing to import series...";
  };

  const getDetailMessage = () => {
    if (importCompleted || isJobCompleted(JobType.ImportSeries)) {
      return "All selected series have been imported into your library. The setup wizard is now complete!";
    }
    if (isActive && progressData?.message) {
      return progressData.message;
    }
    if (isActive && resumed) {
      return "Reconnected to an import that was already running on the server. It will keep running even if you reload or close this page.";
    }
    if (isFailed && progressData?.errorMessage) {
      return progressData.errorMessage;
    }
    return "This may take a few minutes depending on the number of series being imported.";
  };
  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Final step: Importing your selected series into the library. 
        Please wait while the process completes.
      </div>

      <div 
        ref={containerRef}
        className={`max-h-[60vh] p-0.5 overflow-y-auto max-[768px]:max-h-none max-[768px]:overflow-visible ${hasScrollbar ? 'pr-2' : ''}`}
      >
        <div className="space-y-6">
          <Card className={`w-full ${isActive ? 'ring-2 ring-primary' : ''}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                {getIcon()}
                <span>Series Import</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Progress value={progress} className="h-3" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{getStatusMessage()}</span>
                  <span className="text-muted-foreground">{Math.round(progress)}%</span>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground">
                {getDetailMessage()}
              </div>

              {progressData?.errorMessage && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
                  <strong>Error:</strong> {progressData.errorMessage}
                </div>
              )}

              {isActive && (
                <div className="space-y-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-[44px] gap-2"
                    onClick={() => void nextStep()}
                  >
                    <MinusCircle className="h-4 w-4" />
                    Continue in background
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    The import keeps running on the server. You can finish setup and use the app
                    while it completes — progress shows in a floating indicator and survives reloads.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {(importCompleted || isJobCompleted(JobType.ImportSeries)) && (
            <div className="bg-secondary border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                <span className="text font-medium">
                  Import process completed successfully!
                </span>
              </div>
              <p className="text mb-4">
                Congratulations! Your Rensaiō import wizard is now complete. 
              </p>
            </div>
          )}

          {isFailed && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-red-800 mb-2">
                Import Failed
              </h3>
              <p className="text-red-700 mb-4">
                The import process encountered an error. You can try again or skip this step and manually import series later.
              </p>
              <div className="text-sm text-red-600">
                Check the error details above and try again, or contact support if the issue persists.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
