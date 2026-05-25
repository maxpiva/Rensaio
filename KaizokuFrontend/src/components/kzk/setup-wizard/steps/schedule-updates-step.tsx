"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Download, Library, Plug, AlertTriangle } from "lucide-react";
import { useSetupWizardImportTotals } from "@/lib/api/hooks/useSetupWizard";
import type { ImportTotals } from "@/lib/api/types";

interface ScheduleUpdatesStepProps {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCanProgress: React.Dispatch<React.SetStateAction<boolean>>;
  onDownloadOptionChange?: (disableDownloads: boolean) => void;
}

export function ScheduleUpdatesStep({
  setError,
  setIsLoading,
  setCanProgress,
  onDownloadOptionChange,
}: ScheduleUpdatesStepProps) {
  const [downloadOption, setDownloadOption] = useState<string>("proceed");
  const [importTotals, setImportTotals] = useState<ImportTotals | null>(null);

  const {
    data: totalsData,
    error: totalsError,
    isLoading: totalsLoading,
    refetch: refetchTotals,
  } = useSetupWizardImportTotals();

  // Load import totals when component mounts
  useEffect(() => {
    void refetchTotals();
  }, [refetchTotals]);

  // Handle totals data
  useEffect(() => {
    if (totalsData) {
      setImportTotals(totalsData);
      setError(null);
    }
  }, [totalsData, setError]);

  // Handle loading state
  useEffect(() => {
    setIsLoading(totalsLoading);
  }, [totalsLoading, setIsLoading]);

  // Handle errors
  useEffect(() => {
    if (totalsError) {
      setError(`Failed to load import totals: ${totalsError.message}`);
    } else {
      setError(null);
    }
  }, [totalsError, setError]);

  // Handle progress state - always allow progress since user can choose either option
  useEffect(() => {
    setCanProgress(true);
  }, [setCanProgress]);

  // Handle download option changes
  useEffect(() => {
    const disableDownloads = downloadOption === "disable";
    onDownloadOptionChange?.(disableDownloads);
  }, [downloadOption, onDownloadOptionChange]);

  const handleDownloadOptionChange = (value: string) => {
    setDownloadOption(value);
  };

  if (totalsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading import totals…</span>
        </div>
      </div>
    );
  }

  if (!importTotals) {
    return (
      <div className="text-center p-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
        No import data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="iw-stats-row">
        <div className="iw-stat-card">
          <Library className="h-5 w-5" style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
          <div>
            <div className="iw-stat-number">{importTotals.totalSeries}</div>
            <div className="iw-stat-label">Series</div>
          </div>
        </div>
        <div className="iw-stat-card">
          <Plug className="h-5 w-5" style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
          <div>
            <div className="iw-stat-number">{importTotals.totalProviders}</div>
            <div className="iw-stat-label">Sources</div>
          </div>
        </div>
        <div className="iw-stat-card">
          <Download className="h-5 w-5" style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
          <div>
            <div className="iw-stat-number">{importTotals.totalDownloads}</div>
            <div className="iw-stat-label">Downloads</div>
          </div>
        </div>
      </div>

      {/* Radio options */}
      <div role="radiogroup" aria-label="Download schedule">
        {/* Option 1 — proceed */}
        <div
          className={`iw-radio-card${downloadOption === 'proceed' ? ' is-selected' : ''}`}
          onClick={() => handleDownloadOptionChange('proceed')}
          role="radio"
          aria-checked={downloadOption === 'proceed'}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') handleDownloadOptionChange('proceed'); }}
        >
          <div className="iw-radio-control" />
          <div className="iw-radio-body">
            <div className="iw-radio-title">Proceed with scheduled downloads</div>
            <div className="iw-radio-desc">
              All {importTotals.totalDownloads} pending downloads will be automatically scheduled and start downloading according to your configured settings.
            </div>
          </div>
        </div>

        {/* Option 2 — disable */}
        <div
          className={`iw-radio-card${downloadOption === 'disable' ? ' is-selected' : ''}`}
          onClick={() => handleDownloadOptionChange('disable')}
          role="radio"
          aria-checked={downloadOption === 'disable'}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') handleDownloadOptionChange('disable'); }}
        >
          <div className="iw-radio-control" />
          <div className="iw-radio-body">
            <div className="iw-radio-title">Start with downloads disabled</div>
            <div className="iw-radio-desc">
              All series sources will be imported but disabled. You can manually enable them one by one from the series management page when you&apos;re ready.
            </div>

            {downloadOption === 'disable' && (
              <div className="iw-warn-banner">
                <AlertTriangle />
                <span>No chapters will be fetched until you toggle downloads back on for each series.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
