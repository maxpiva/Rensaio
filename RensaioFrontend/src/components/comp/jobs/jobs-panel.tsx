"use client";

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertCircle, AlertTriangle, Clock, Loader2, FileText } from 'lucide-react';
import { useUpdateAllSeries } from '@/lib/api/hooks/useSeries';
import { useSignalRProgress } from '@/lib/api/hooks/useSetupWizard';
import { JobType } from '@/lib/api/types';

interface JobProgressProps {
  title: string;
  isActive: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  progress: number;
  message?: string;
  errorMessage?: string;
}

function JobProgress({
  title,
  isActive,
  isCompleted,
  isFailed,
  progress,
  message,
  errorMessage
}: JobProgressProps) {
  // Status is always icon + label.
  const state = isFailed
    ? { label: 'Failed', cls: 'bg-bad-soft text-bad', icon: <AlertCircle className="h-3 w-3" aria-hidden="true" /> }
    : isCompleted
      ? { label: 'Done', cls: 'bg-ok-soft text-ok', icon: <CheckCircle className="h-3 w-3" aria-hidden="true" /> }
      : isActive
        ? { label: 'Running', cls: 'bg-accent-soft text-accent-ink', icon: <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" /> }
        : { label: 'Waiting', cls: 'bg-paper-3 text-ink-2', icon: <Clock className="h-3 w-3" aria-hidden="true" /> };

  return (
    <div
      className={`rounded-md border bg-paper-1 p-3.5 ${isActive ? 'border-accent-line' : 'border-rule'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13.5px] font-semibold text-ink">{title}</span>
        <span className={`inline-flex h-[22px] items-center gap-1 rounded-[4px] px-1.5 text-[11.5px] font-semibold ${state.cls}`}>
          {state.icon}
          {state.label}
        </span>
      </div>
      <Progress value={progress} className="mt-3 h-[3px]" aria-label={`${title} progress`} />
      <div className="mt-1.5 flex justify-between gap-3 font-mono text-[11px] text-ink-3">
        <span className="min-w-0 truncate">{message ?? 'Waiting...'}</span>
        <span className="tabular-nums">{Math.round(progress)}%</span>
      </div>
      {errorMessage && (
        <div role="alert" className="mt-2.5 rounded-[4px] border border-bad/25 bg-bad-soft px-2.5 py-2 text-[12.5px] text-bad">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

export function JobsPanel() {
  const [isUpdateAllSeriesRunning, setIsUpdateAllSeriesRunning] = useState(false);
  const updateAllSeriesMutation = useUpdateAllSeries();

  const handleUpdateAllSeriesComplete = useCallback(() => {
    setIsUpdateAllSeriesRunning(false);
  }, []);

  const handleUpdateAllSeriesError = useCallback((error: string) => {
    console.error('UpdateAllSeries job failed - callback triggered:', error);
    setIsUpdateAllSeriesRunning(false);
  }, []);

  const { getProgressForJob, isJobCompleted, isJobFailed, getJobProgress } = useSignalRProgress({
    jobTypes: [JobType.UpdateAllSeries],
    onComplete: handleUpdateAllSeriesComplete,
    onError: handleUpdateAllSeriesError,
  });

  const handleUpdateAllSeries = async () => {
    try {
      setIsUpdateAllSeriesRunning(true);
      await updateAllSeriesMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to start UpdateAllSeries:', error);
      setIsUpdateAllSeriesRunning(false);
    }
  };

  // Get progress data for UpdateAllSeries
  const updateAllSeriesProgress = getProgressForJob(JobType.UpdateAllSeries);
  const isUpdateAllSeriesCompleted = isJobCompleted(JobType.UpdateAllSeries);
  const isUpdateAllSeriesFailed = isJobFailed(JobType.UpdateAllSeries);
  const updateAllSeriesProgressValue = isUpdateAllSeriesCompleted ? 100 : getJobProgress(JobType.UpdateAllSeries);

  // Show progress bar ONLY if we have progress data from SignalR (not based on local state)
  // TEMPORARILY: Also show when button is pressed to debug
  const showUpdateAllSeriesProgress = updateAllSeriesProgress !== null || isUpdateAllSeriesRunning;

  return (
    <div className="space-y-4">
      {/* Update All Series */}
      <section aria-labelledby="job-update-all" className="rounded-lg border border-rule bg-paper-1/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="paper-eyebrow mb-1.5 text-ink-3">Library job</p>
            <h3 id="job-update-all" className="font-serif text-[19px] leading-tight text-ink">
              Update All Series
            </h3>
          </div>
          <Button
            size="sm"
            className="gap-1.5 max-sm:min-h-11 max-sm:w-full"
            onClick={handleUpdateAllSeries}
            disabled={updateAllSeriesMutation.isPending || isUpdateAllSeriesRunning}
          >
            {updateAllSeriesMutation.isPending || isUpdateAllSeriesRunning ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4" aria-hidden="true" />
            )}
            Update All Series
          </Button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          Applies the selected title to the entire series. This process updates titles for consistency, rewrites the ComicInfo.xml, and sets the series cover to the one you selected.
        </p>
        <p className="mt-2.5 flex gap-2 rounded-[4px] border border-warn/25 bg-warn-soft px-2.5 py-2 text-[12.5px] leading-relaxed text-warn">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
          <span>
            <b className="font-semibold">Note:</b> This may also rename files and convert your series into .cbz archives, but only if the ComicInfo metadata has been updated.
          </span>
        </p>
      </section>

      {/* Progress — show ONLY when we receive SignalR messages */}
      {showUpdateAllSeriesProgress && (
        <JobProgress
          title="Updating All Series"
          isActive={!isUpdateAllSeriesCompleted && !isUpdateAllSeriesFailed && updateAllSeriesProgress !== null}
          isCompleted={isUpdateAllSeriesCompleted}
          isFailed={isUpdateAllSeriesFailed}
          progress={updateAllSeriesProgressValue || 0}
          message={updateAllSeriesProgress?.message?.length ? updateAllSeriesProgress.message : 'Processing...'}
          errorMessage={updateAllSeriesProgress?.errorMessage}
        />
      )}

      {/* Completion message */}
      {isUpdateAllSeriesCompleted && (
        <div role="status" className="rounded-md border border-ok/25 bg-ok-soft p-3.5">
          <div className="flex items-center gap-2 text-ok">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-[13.5px] font-semibold">
              Update All Series completed successfully!
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-2">
            All series have been updated with consistent naming and metadata.
          </p>
        </div>
      )}
    </div>
  );
}
