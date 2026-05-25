/*
 * confirm-imports-step.tsx — thin orchestrator (Slice B)
 *
 * Hosts:
 *   - useDualImportState + debounced backend sync (logic unchanged)
 *   - ImportsContext.Provider
 *   - Tab state
 *   - <StickyHead> (filter tabs + reviewed counter)
 *   - <CardsScroll> (virtualized list via react-window, pink scrollbar, jump-to-top)
 *   - <CoverPopoverHost> (body-level singleton cover art popover)
 *
 * All sub-components live under ./confirm-imports/.
 * No business-logic changes — only JSX restructuring + new className hooks.
 */

"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSetupWizardImports, useSetupWizardImportSeries, useSetupWizardUpdateImport } from "@/lib/api/hooks/useSetupWizard";
import type { ImportInfo, SmallSeries } from "@/lib/api/types";
import { ImportStatus, Action } from "@/lib/api/types";

import { ImportsContext } from "./confirm-imports/imports-context";
import { StickyHead, type TabId } from "./confirm-imports/sticky-head";
import { CardsScroll } from "./confirm-imports/cards-scroll";
import { CoverPopoverHost } from "./confirm-imports/cover-popover";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ConfirmImportsStepProps {
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanProgress: (canProgress: boolean) => void;
}

// ─── useDualImportState (unchanged from original) ────────────────────────────

function useDualImportState(
  globalImports: ImportInfo[],
  onAnyImportChange: (updated: ImportInfo[]) => void
) {
  const [localImports, setLocalImports] = useState<ImportInfo[]>([]);
  const prevGlobalRef = useRef<ImportInfo[]>([]);

  function shouldSyncLocal(
    global: ImportInfo[],
    prevGlobal: ImportInfo[]
  ): boolean {
    if (global.length !== prevGlobal.length) return true;
    for (let i = 0; i < global.length; i++) {
      const g = global[i];
      const p = prevGlobal[i];
      if (!g || !p) return true;
      if (g.action !== p.action || g.status !== p.status) return true;
      const gSeries = g.series || [];
      const pSeries = p.series || [];
      if (gSeries.length !== pSeries.length) return true;
      for (let j = 0; j < gSeries.length; j++) {
        const gS = gSeries[j];
        const pS = pSeries[j];
        if (!gS || !pS) return true;
        if (gS.id !== pS.id) return true;
      }
    }
    return false;
  }

  useEffect(() => {
    if (shouldSyncLocal(globalImports, prevGlobalRef.current)) {
      setLocalImports(
        globalImports.map((i) => ({
          ...i,
          series: i.series ? i.series.map((s) => ({ ...s })) : [],
        }))
      );
      prevGlobalRef.current = globalImports;
    }
  }, [globalImports]);

  const updateImport = useCallback(
    (path: string, updates: Partial<ImportInfo>) => {
      setLocalImports((prev) => {
        const updated = prev.map((item) =>
          item.path === path ? { ...item, ...updates } : item
        );
        onAnyImportChange(updated);
        return updated;
      });
    },
    [onAnyImportChange]
  );

  const updateStatus = useCallback(
    (path: string, status: ImportStatus) => {
      updateImport(path, { status });
    },
    [updateImport]
  );

  const updateAction = useCallback(
    (path: string, action: Action) => {
      const status =
        action === Action.Add ? ImportStatus.Import : ImportStatus.Skip;
      updateImport(path, { action, status });
    },
    [updateImport]
  );

  const updateChapter = useCallback(
    (path: string, continueAfterChapter: number) => {
      updateImport(path, { continueAfterChapter });
    },
    [updateImport]
  );

  const updateProviderToggle = useCallback(
    (path: string, seriesIndex: number) => {
      setLocalImports((prev) => {
        const updated = prev.map((item) => {
          if (item.path !== path || !item.series) return item;
          return {
            ...item,
            series: item.series.map((series, idx) =>
              idx === seriesIndex
                ? { ...series, preferred: !series.preferred }
                : series
            ),
          };
        });
        onAnyImportChange(updated);
        return updated;
      });
    },
    [onAnyImportChange]
  );

  const updateSeriesProperty = useCallback(
    (
      path: string,
      seriesIndex: number,
      property: "useCover" | "isStorage" | "useTitle",
      value: boolean
    ) => {
      setLocalImports((prev) => {
        const updated = prev.map((item) => {
          if (item.path !== path || !item.series) return item;
          return {
            ...item,
            series: item.series.map((series, idx) =>
              idx === seriesIndex ? { ...series, [property]: value } : series
            ),
          };
        });
        onAnyImportChange(updated);
        return updated;
      });
    },
    [onAnyImportChange]
  );

  const replaceImport = useCallback(
    (updatedImport: ImportInfo) => {
      setLocalImports((prev) => {
        const updated = prev.map((item) =>
          item.path === updatedImport.path ? updatedImport : item
        );
        onAnyImportChange(updated);
        return updated;
      });
    },
    [onAnyImportChange]
  );

  return {
    localImports,
    setLocalImports,
    updateStatus,
    updateAction,
    updateChapter,
    updateProviderToggle,
    updateSeriesProperty,
    replaceImport,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ConfirmImportsStep({
  setError,
  setIsLoading,
  setCanProgress,
}: ConfirmImportsStepProps) {
  const [activeTab, setActiveTab] = useState<TabId>("import");

  const { data: importsData, isLoading: importsLoading, refetch } =
    useSetupWizardImports();
  const importMutation = useSetupWizardImportSeries();
  const updateMutation = useSetupWizardUpdateImport();

  // ── Global (API) state ────────────────────────────────────────────────────
  const [globalImports, setGlobalImports] = useState<ImportInfo[]>([]);
  useEffect(() => {
    if (importsData) setGlobalImports(importsData);
  }, [importsData]);

  // ── Dual state hook ───────────────────────────────────────────────────────
  const {
    localImports,
    setLocalImports,
    updateStatus: handleStatusChange,
    updateAction: handleActionChange,
    updateProviderToggle: handleProviderToggle,
    updateChapter: handleChapterChange,
    updateSeriesProperty: handleSeriesPropertyChange,
    replaceImport: handleReplaceImport,
  } = useDualImportState(globalImports, setGlobalImports);

  // ── Debounced per-import backend sync (unchanged logic) ───────────────────
  const debounceTimeoutsRef = useRef<{
    [path: string]: ReturnType<typeof setTimeout> | number;
  }>({});

  const updateImportField = useCallback(
    (path: string, field: string, value: unknown, seriesIndex?: number) => {
      setGlobalImports((prev) => {
        const importToUpdate = prev.find((item) => item.path === path);
        if (!importToUpdate) return prev;

        let updatedImport: ImportInfo;

        if (seriesIndex !== undefined && importToUpdate.series) {
          updatedImport = {
            ...importToUpdate,
            series: importToUpdate.series.map((series, idx) =>
              idx === seriesIndex ? { ...series, [field]: value } : series
            ),
          };
        } else if (field === "" && typeof value === "object" && value !== null) {
          updatedImport = { ...(value as ImportInfo) };
        } else {
          updatedImport = { ...importToUpdate, [field]: value };
        }

        const newImports = prev.map((item) =>
          item.path === path ? updatedImport : item
        );

        // Debounce backend update
        if (debounceTimeoutsRef.current[path]) {
          clearTimeout(debounceTimeoutsRef.current[path]);
        }
        debounceTimeoutsRef.current[path] = setTimeout(() => {
          updateMutation.mutate(updatedImport, {
            onError: () => {
              setError("Failed to update import. Please try again.");
              refetch();
            },
          });
          delete debounceTimeoutsRef.current[path];
        }, 5000);

        return newImports;
      });
    },
    [updateMutation, setError, refetch]
  );

  // ── Fetch on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    refetch().catch((error) => {
      console.error("Failed to fetch imports:", error);
      setError("Failed to load imports. Please try again.");
    });
  }, [refetch, setError]);

  // ── Loading + progress states ─────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(importsLoading || importMutation.isPending);
    // A valid import is one that won't produce a broken payload: Import-status items
    // must have at least one series marked preferred; all other statuses are valid as-is.
    const validImports = globalImports.filter(
      (item) =>
        item.status !== ImportStatus.Import ||
        item.series?.some((s) => s.preferred === true)
    );
    setCanProgress(
      globalImports.length > 0 &&
        !importsLoading &&
        !importMutation.isPending &&
        validImports.length === globalImports.length
    );
  }, [
    importsLoading,
    importMutation.isPending,
    globalImports,
    setIsLoading,
    setCanProgress,
  ]);

  // ── Filtered arrays ───────────────────────────────────────────────────────
  const importsToProcess = useMemo(
    () => globalImports.filter((item) => item.status === ImportStatus.Import),
    [globalImports]
  );
  const skippedImports = useMemo(
    () => globalImports.filter((item) => item.status === ImportStatus.Skip),
    [globalImports]
  );
  const unchangedImports = useMemo(
    () =>
      globalImports.filter((item) => item.status === ImportStatus.DoNotChange),
    [globalImports]
  );
  const completedImports = useMemo(
    () =>
      globalImports.filter((item) => item.status === ImportStatus.Completed),
    [globalImports]
  );

  // ── Reviewed-counter values ───────────────────────────────────────────────
  const reviewedCount = useMemo(
    () =>
      globalImports.filter(
        (item) =>
          item.status !== ImportStatus.Import
      ).length,
    [globalImports]
  );

  // ── Items for active tab ──────────────────────────────────────────────────
  const activeItems = useMemo(() => {
    switch (activeTab) {
      case "import":    return importsToProcess;
      case "completed": return completedImports;
      case "unchanged": return unchangedImports;
      case "skip":      return skippedImports;
      default:          return importsToProcess;
    }
  }, [activeTab, importsToProcess, completedImports, unchangedImports, skippedImports]);

  const activeEmptyMessage = useMemo(() => {
    switch (activeTab) {
      case "skip":      return "No series marked to skip";
      case "import":    return "No series marked for import";
      default:          return "No items to display";
    }
  }, [activeTab]);

  // ── Tab-specific button visibility ────────────────────────────────────────
  const showSearchButton = activeTab === "skip";
  const showSkipButton   = activeTab === "import" || activeTab === "completed";
  const showAddButton    = activeTab === "skip";

  // ── Mutation-active guard — disables all card action buttons while pending ──
  const isUpdating = updateMutation.isPending || importMutation.isPending;

  // ── Loading / empty guards ────────────────────────────────────────────────
  if (importsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading imports…</div>
      </div>
    );
  }

  if (globalImports.length === 0) {
    return (
      <div className="text-center space-y-4">
        <div className="text-muted-foreground">Loading Series</div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ImportsContext.Provider value={{ updateImportField }}>
      <CoverPopoverHost>
        <div className="iw-confirm-root">
          <StickyHead
            activeTab={activeTab}
            onTabChange={setActiveTab}
            importCount={importsToProcess.length}
            completedCount={completedImports.length}
            unchangedCount={unchangedImports.length}
            skippedCount={skippedImports.length}
            reviewedCount={reviewedCount}
            totalCount={globalImports.length}
            readyCount={importsToProcess.length}
          />

          <CardsScroll
            items={activeItems}
            onStatusChange={handleStatusChange}
            onActionChange={handleActionChange}
            onProviderToggle={handleProviderToggle}
            onChapterChange={handleChapterChange}
            onSeriesPropertyChange={handleSeriesPropertyChange}
            showActionCombobox={false}
            isUpdating={isUpdating}
            showSearchButton={showSearchButton}
            showSkipButton={showSkipButton}
            showAddButton={showAddButton}
            emptyMessage={activeEmptyMessage}
          />
        </div>
      </CoverPopoverHost>
    </ImportsContext.Provider>
  );
}
