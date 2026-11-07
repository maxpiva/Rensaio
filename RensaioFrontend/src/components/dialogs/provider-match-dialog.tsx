"use client";

import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Globe, Link2, Plus } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { type ProviderMatch, type ProviderMatchChapter, type MatchInfo, NEW_PROVIDER_SENTINEL } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** The backend has sent PascalCase property names in the past; both shapes are accepted. */
type LegacyProviderMatch = ProviderMatch & {
  Chapters?: ProviderMatchChapter[];
  MatchInfos?: MatchInfo[];
};

/** Column widths shared by the list header and each row (desktop). */
const COLS = {
  filename: "sm:w-[35%]",
  name: "sm:w-[35%]",
  source: "sm:w-[20%]",
  number: "sm:w-[10%]",
} as const;

// Memoized row component to prevent unnecessary re-renders
const ChapterRow = memo(({
  chapter,
  index,
  isSelected,
  onMouseDown,
  onMouseEnter,
  onChapterChange,
  renderProviderWithFlag
}: {
  chapter: ProviderMatchChapter;
  index: number;
  isSelected: boolean;
  onMouseDown: (index: number) => void;
  onMouseEnter: (index: number) => void;
  onChapterChange: (index: number, field: keyof ProviderMatchChapter, value: string | number | null) => void;
  renderProviderWithFlag: (matchInfoId: string | null | undefined) => React.ReactNode;
}) => {
  const fieldLabel = "paper-eyebrow mb-1 block text-[10px] sm:hidden";
  const cellInput =
    "h-8 bg-paper text-[13px] sm:h-7 sm:border-transparent sm:bg-transparent sm:px-2 sm:hover:border-rule-2 sm:focus-visible:bg-paper";

  return (
    <div
      aria-selected={isSelected}
      role="option"
      className={cn(
        "relative flex cursor-pointer flex-col gap-2 border-b border-rule px-3 py-3 transition-colors last:border-b-0 sm:flex-row sm:items-center sm:gap-3 sm:py-1.5 sm:pl-11 sm:pr-3",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:transition-colors",
        isSelected
          ? "bg-accent-soft before:bg-primary"
          : "hover:bg-hover before:bg-transparent",
      )}
      onMouseDown={() => onMouseDown(index)}
      onMouseEnter={() => onMouseEnter(index)}
    >
      <span
        aria-hidden
        className={cn(
          "absolute right-3 top-3 font-mono text-[10.5px] tabular-nums sm:left-3 sm:right-auto sm:top-1/2 sm:-translate-y-1/2",
          isSelected ? "text-accent-ink" : "text-ink-3",
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className={cn("w-full min-w-0", COLS.filename)}>
        <span className={fieldLabel}>Filename</span>
        <Input
          className={cn(cellInput, "font-mono sm:text-[12px]")}
          value={chapter.filename}
          onChange={(e) => onChapterChange(index, 'filename', e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className={cn("w-full min-w-0", COLS.name)}>
        <span className={fieldLabel}>Name</span>
        <Input
          value={chapter.chapterName}
          onChange={(e) => onChapterChange(index, 'chapterName', e.target.value)}
          className={cellInput}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex w-full items-end gap-2 sm:contents">
        <div className={cn("min-w-0 flex-1 sm:flex-none", COLS.source)}>
          <span className={fieldLabel}>Source</span>
          <div
            className={cn(
              "pointer-events-none flex h-11 min-w-0 select-none items-center rounded-md border px-2.5 text-[12.5px] sm:h-7",
              chapter.matchInfoId
                ? "border-rule-2 bg-paper-2 text-ink"
                : "border-dashed border-warn/45 bg-warn-soft text-warn",
            )}
          >
            {renderProviderWithFlag(chapter.matchInfoId)}
          </div>
        </div>
        <div className={cn("w-24 shrink-0", COLS.number)}>
          <span className={fieldLabel}>Number</span>
          <Input
            type="number"
            step="0.1"
            value={chapter.chapterNumber === 0 ? "" : (chapter.chapterNumber ?? "")}
            onChange={(e) => onChapterChange(index, 'chapterNumber', e.target.value ? parseFloat(e.target.value) : null)}
            className={cn(cellInput, "text-right font-mono tabular-nums")}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </div>
  );
});

ChapterRow.displayName = 'ChapterRow';

interface ProviderMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerMatch: ProviderMatch | null;
  onSave: (updatedMatch: ProviderMatch) => void;
  isLoading?: boolean;
  isLoadingData?: boolean;
  deletedProviderStates?: Record<string, boolean>;
}

export function ProviderMatchDialog({
  open,
  onOpenChange,
  providerMatch,
  onSave,
  isLoading = false,
  isLoadingData = false,
  deletedProviderStates = {}
}: ProviderMatchDialogProps) {
  const [chapters, setChapters] = useState<ProviderMatchChapter[]>([]);
  const [selectedChapterIndexes, setSelectedChapterIndexes] = useState<Set<number>>(new Set());
  const [selectedMatchInfoId, setSelectedMatchInfoId] = useState<string>("");
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeStep, setRangeStep] = useState<string>("1");
  const [isPainting, setIsPainting] = useState<boolean>(false);
  const [paintMode, setPaintMode] = useState<'select' | 'deselect'>('select');
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const [autoScrollInterval, setAutoScrollInterval] = useState<NodeJS.Timeout | null>(null);

  // New provider creation state
  const [showNewProviderForm, setShowNewProviderForm] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderScanlator, setNewProviderScanlator] = useState("");
  const [newProviderLanguage, setNewProviderLanguage] = useState("en");

  // Use a ref to track painting state for auto-scroll interval
  const isPaintingRef = useRef<boolean>(false);
  // Track the last painted index to fill gaps when dragging quickly
  const lastPaintedIndexRef = useRef<number | null>(null);

  // Initialize state when providerMatch changes
  useEffect(() => {
    // Handle both lowercase and uppercase property names from backend
    const legacy: LegacyProviderMatch | null = providerMatch;
    const chapters = providerMatch?.chapters ?? legacy?.Chapters;
    if (providerMatch && chapters) {
      setChapters([...chapters]);
      setSelectedChapterIndexes(new Set());
      setSelectedMatchInfoId("");
      setRangeStart("");
      setRangeStep("1");
      setShowNewProviderForm(false);
      setNewProviderName("");
      setNewProviderScanlator("");
      setNewProviderLanguage("en");
    }
  }, [providerMatch]);

  // Update range start when selection changes
  useEffect(() => {
    if (selectedChapterIndexes.size > 0) {
      const firstSelectedIndex = Math.min(...selectedChapterIndexes);
      const firstChapter = chapters[firstSelectedIndex];
      if (firstChapter?.chapterNumber) {
        setRangeStart(firstChapter.chapterNumber.toString());
      }
    }
  }, [selectedChapterIndexes, chapters]);

  const handleChapterChange = useCallback((index: number, field: keyof ProviderMatchChapter, value: string | number | null) => {
    setChapters(prev => {
      const updatedChapters = [...prev];
      updatedChapters[index] = {
        ...updatedChapters[index],
        [field]: value
      } as ProviderMatchChapter;
      return updatedChapters;
    });
  }, []);

  const handleMouseDown = useCallback((index: number) => {
    setSelectedChapterIndexes(prev => {
      const isSelected = prev.has(index);
      const newSelection = new Set(prev);
      
      if (isSelected) {
        newSelection.delete(index);
        setPaintMode('deselect');
      } else {
        newSelection.add(index);
        setPaintMode('select');
      }
        setIsPainting(true);
      isPaintingRef.current = true;
      lastPaintedIndexRef.current = index;
      return newSelection;
    });
  }, []);

  const handleMouseEnter = useCallback((index: number) => {
    if (!isPainting) return;
    
    setSelectedChapterIndexes(prev => {
      const newSelection = new Set(prev);
      
      // Fill in any gaps between the last painted index and current index
      const lastIndex = lastPaintedIndexRef.current;
      if (lastIndex !== null && lastIndex !== index) {
        const start = Math.min(lastIndex, index);
        const end = Math.max(lastIndex, index);
        
        // Fill in all indexes between start and end (inclusive)
        for (let i = start; i <= end; i++) {
          if (paintMode === 'select') {
            newSelection.add(i);
          } else {
            newSelection.delete(i);
          }
        }
      } else {
        // No gap to fill, just handle the current index
        if (paintMode === 'select') {
          newSelection.add(index);
        } else {
          newSelection.delete(index);
        }
      }
      
      // Update the last painted index
      lastPaintedIndexRef.current = index;
      
      return newSelection;
    });
  }, [isPainting, paintMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPainting || !scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const mouseY = e.clientY;
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
      const SCROLL_ZONE = 40; // pixels from edge to trigger scroll
    const SCROLL_SPEED = 3; // pixels per frame
    
    // Only auto-scroll if we're actively painting
    if (!isPainting) {
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        setAutoScrollInterval(null);
      }
      return;
    }
    
    // Check if mouse is near top edge
    if (mouseY < rect.top + SCROLL_ZONE && scrollTop > 0) {
      if (!autoScrollInterval) {
        const interval = setInterval(() => {
          // Double-check that we're still painting before scrolling
          if (!isPaintingRef.current || scrollContainer.scrollTop <= 0) {
            clearInterval(interval);
            setAutoScrollInterval(null);
            return;
          }
          scrollContainer.scrollTop -= SCROLL_SPEED;
        }, 16); // ~60fps
        setAutoScrollInterval(interval);
      }
    }
    // Check if mouse is near bottom edge
    else if (mouseY > rect.bottom - SCROLL_ZONE && scrollTop < scrollHeight - clientHeight) {
      if (!autoScrollInterval) {
        const interval = setInterval(() => {
          // Double-check that we're still painting before scrolling
          if (!isPaintingRef.current || scrollContainer.scrollTop >= scrollContainer.scrollHeight - scrollContainer.clientHeight) {
            clearInterval(interval);
            setAutoScrollInterval(null);
            return;
          }
          scrollContainer.scrollTop += SCROLL_SPEED;
        }, 16); // ~60fps
        setAutoScrollInterval(interval);
      }
    }
    // Stop auto-scrolling if mouse is not in scroll zones OR not painting
    else {
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        setAutoScrollInterval(null);
      }
    }
  }, [isPainting, scrollContainer, autoScrollInterval]);

  const handleMouseUp = useCallback(() => {
    setIsPainting(false);
    isPaintingRef.current = false;
    lastPaintedIndexRef.current = null;
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      setAutoScrollInterval(null);
    }
  }, [autoScrollInterval]);

  // Add global mouse up listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsPainting(false);
      isPaintingRef.current = false;
      lastPaintedIndexRef.current = null;
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        setAutoScrollInterval(null);
      }
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [autoScrollInterval]);

  // Cleanup auto-scroll interval on unmount
  useEffect(() => {
    return () => {
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
      }
    };
  }, [autoScrollInterval]);

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        setSelectedChapterIndexes(new Set(chapters.map((_, index) => index)));
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, chapters]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedChapterIndexes(new Set(chapters.map((_, index) => index)));
    } else {
      setSelectedChapterIndexes(new Set());
    }
  };

  const handleMatchSelected = () => {
    if (!selectedMatchInfoId) return;

    const updatedChapters = [...chapters];
    selectedChapterIndexes.forEach(index => {
      updatedChapters[index] = {
        ...updatedChapters[index],
        matchInfoId: selectedMatchInfoId
      } as ProviderMatchChapter;
    });
    setChapters(updatedChapters);
  };

  const handleFillRange = () => {
    const start = parseFloat(rangeStart);
    const step = parseFloat(rangeStep);

    if (isNaN(start) || isNaN(step)) return;

    const updatedChapters = [...chapters];
    const sortedIndexes = Array.from(selectedChapterIndexes).sort((a, b) => a - b);
    
    sortedIndexes.forEach((index, i) => {
      updatedChapters[index] = {
        ...updatedChapters[index],
        chapterNumber: start + (i * step)
      } as ProviderMatchChapter;
    });
    
    setChapters(updatedChapters);
  };

  // Handle selection of "Create New Provider" from the dropdown
  const handleProviderSelect = useCallback((value: string) => {
    if (value === "__new__") {
      setShowNewProviderForm(true);
      setSelectedMatchInfoId("");
    } else {
      setSelectedMatchInfoId(value);
      setShowNewProviderForm(false);
    }
  }, []);

  // Confirm creation of new provider
  const handleNewProviderConfirm = useCallback(() => {
    if (!newProviderName.trim()) return;
    // Use the sentinel as the matchInfoId - the backend will create the provider
    setSelectedMatchInfoId(NEW_PROVIDER_SENTINEL);
    setShowNewProviderForm(false);
  }, [newProviderName]);

  // Cancel new provider creation
  const handleNewProviderCancel = useCallback(() => {
    setShowNewProviderForm(false);
    setNewProviderName("");
    setNewProviderScanlator("");
    setNewProviderLanguage("en");
  }, []);

  // Get the correct property names (handle both cases)
  const legacyMatch: LegacyProviderMatch | null = providerMatch;
  const backendChapters = providerMatch?.chapters ?? legacyMatch?.Chapters;
  const backendMatchInfos = providerMatch?.matchInfos ?? legacyMatch?.MatchInfos;

  // Filter out deleted providers from the available match infos
  const availableMatchInfos = React.useMemo((): MatchInfo[] => {
    if (!backendMatchInfos) return [];
    
    return backendMatchInfos.filter((matchInfo) => {
      // Check if this provider is marked as deleted using the matchInfo.id
      const isDeleted = deletedProviderStates[matchInfo.id] === true;
      return !isDeleted;
    });
  }, [backendMatchInfos, deletedProviderStates]);

  const getMatchInfo = useCallback((matchInfoId: string | null | undefined): MatchInfo | null | undefined => {
    // Handle the sentinel (new provider) case
    if (matchInfoId === NEW_PROVIDER_SENTINEL) {
      return {
        id: NEW_PROVIDER_SENTINEL,
        provider: newProviderName || "New Provider",
        scanlator: newProviderScanlator,
        language: newProviderLanguage
      };
    }
    // Use filtered available match infos instead of backend match infos
    if (!matchInfoId) return null;
    return availableMatchInfos.find((m) => m.id === matchInfoId);
  }, [availableMatchInfos, newProviderName, newProviderScanlator, newProviderLanguage]);

  const renderProviderWithFlag = useCallback((matchInfoId: string | null | undefined) => {
    const matchInfo = getMatchInfo(matchInfoId);
    if (!matchInfo) {
      return (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">Unknown</span>
        </div>
      );
    }

    const language = matchInfo.language?.length ? matchInfo.language : "all";
    
    return (
      <div className="flex min-w-0 items-center gap-2">
        {language === "all" ? (
          <Globe size={14} className="shrink-0 text-ink-3" />
        ) : (
          <ReactCountryFlag
            countryCode={getCountryCodeForLanguage(language)}
            svg
            style={{
              width: "16px",
              height: "12px",
              flexShrink: 0,
            }}
            title={`${language.toUpperCase()}`}
          />
        )}
        <span className="truncate">{matchInfo.provider}{(matchInfo.provider!=matchInfo.scanlator && matchInfo.scanlator) ? ` • ${matchInfo.scanlator}` : ''}</span>
      </div>
    );
  }, [getMatchInfo]);

  // A chapter is valid if it has a matchInfoId or is assigned to the sentinel (new provider)
  const canSave = chapters.every(chapter => {
    if (!chapter.matchInfoId) return false;
    if (chapter.matchInfoId === NEW_PROVIDER_SENTINEL) {
      // When using sentinel, ensure we have provider metadata
      return newProviderName.trim().length > 0;
    }
    return true;
  });

  const handleSave = () => {
    if (!providerMatch || !canSave) return;

    // Build the matchInfos list, including the sentinel entry if needed
    const hasNewProvider = chapters.some(ch => ch.matchInfoId === NEW_PROVIDER_SENTINEL);
    const matchInfos: MatchInfo[] = backendMatchInfos ? [...backendMatchInfos] : [];

    if (hasNewProvider) {
      // Add the sentinel MatchInfo so the backend knows what provider to create
      matchInfos.push({
        id: NEW_PROVIDER_SENTINEL,
        provider: newProviderName,
        scanlator: newProviderScanlator,
        language: newProviderLanguage
      });
    }

    const updatedMatch: ProviderMatch = {
      ...providerMatch,
      matchInfos,
      chapters
    };
    onSave(updatedMatch);
  };

  const allSelected = selectedChapterIndexes.size === chapters.length && chapters.length > 0;
  const trayLabel = "paper-eyebrow shrink-0 text-[10px] sm:w-[84px]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[calc(100vw-16px)] max-w-[calc(100vw-16px)] flex-col gap-3 overflow-x-hidden overflow-y-auto p-3 sm:h-[88vh] sm:overflow-y-hidden sm:max-h-[88vh] sm:w-[92vw] sm:max-w-6xl sm:gap-4 sm:p-6">
        <DialogHeader className="shrink-0 pr-12">
          <DialogTitle className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-ink">
              <Link2 className="h-4 w-4" />
            </span>
            Match Source to Chapters
          </DialogTitle>
        </DialogHeader>

        {/* Show loading state when data is being fetched */}
        {isLoadingData ? (
          <div role="status" aria-busy="true" className="flex min-h-64 flex-1 flex-col overflow-hidden rounded-lg border border-rule-2 bg-paper-1">
            <div className="border-b border-rule px-4 py-5 text-center">
              <div className="font-serif text-[19px] text-ink">Loading match data...</div>
              <div className="mt-1 text-[13px] text-ink-3">Please wait while we fetch the sources information.</div>
            </div>
            <div aria-hidden className="flex-1 divide-y divide-rule">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="skeleton-shimmer h-3 w-6 rounded-[2px]" />
                  <div className="skeleton-shimmer h-6 flex-[3.5] rounded-[3px]" />
                  <div className="skeleton-shimmer hidden h-6 flex-[3.5] rounded-[3px] sm:block" />
                  <div className="skeleton-shimmer hidden h-6 flex-[2] rounded-[3px] sm:block" />
                  <div className="skeleton-shimmer h-6 w-14 rounded-[3px]" />
                </div>
              ))}
            </div>
          </div>
        ) : !providerMatch || !backendChapters ? (
          <div role="alert" className="flex min-h-64 flex-1 items-center justify-center rounded-lg border border-bad/30 bg-bad-soft px-6">
            <div className="text-center">
              <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-bad" />
              <div className="font-serif text-[20px] text-bad">Failed to load match data</div>
              <div className="mt-1 text-[13px] text-ink-2">Please try again.</div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* Chapter list container — owns its own scrolling, never overlaps the controls */}
            <div className="flex min-h-[176px] flex-1 flex-col overflow-hidden rounded-lg border border-rule-2 bg-paper-1 shadow-paper sm:min-h-0">
              <div className="shrink-0 border-b border-rule-2 bg-paper-2/70 px-3 py-2.5">
                <div className="relative flex items-center gap-3 sm:pl-8">
                  <span className="flex items-center sm:absolute sm:left-0 sm:top-1/2 sm:-translate-y-1/2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all chapters"
                    />
                  </span>
                  <span className="paper-eyebrow text-[10px] sm:hidden">Select all</span>
                  <span className="ml-auto font-mono text-[11px] text-ink-3 sm:hidden">
                    {chapters.length} ch.
                  </span>
                  <div className={cn("paper-eyebrow hidden text-[10px] sm:block sm:pl-2", COLS.filename)}>Filename</div>
                  <div className={cn("paper-eyebrow hidden text-[10px] sm:block sm:pl-2", COLS.name)}>Name</div>
                  <div className={cn("paper-eyebrow hidden text-[10px] sm:block", COLS.source)}>Source</div>
                  <div className={cn("paper-eyebrow hidden text-right text-[10px] sm:block sm:pr-2", COLS.number)}>Number</div>
                </div>
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                ref={setScrollContainer}
              >
                <div className="select-none" role="listbox" aria-multiselectable="true" aria-label="Chapters">
                  {chapters.map((chapter, index) => (
                    <ChapterRow
                      key={index}
                      chapter={chapter}
                      index={index}
                      isSelected={selectedChapterIndexes.has(index)}
                      onMouseDown={handleMouseDown}
                      onMouseEnter={handleMouseEnter}
                      onChapterChange={handleChapterChange}
                      renderProviderWithFlag={renderProviderWithFlag}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom control area — separate solid container, sits below the list */}
            <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-rule-2 bg-paper-1 p-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-6 lg:gap-y-3">
              <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <Label className={trayLabel}>Providers</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <Select
                    value={selectedMatchInfoId === NEW_PROVIDER_SENTINEL ? "__new__" : selectedMatchInfoId}
                    onValueChange={handleProviderSelect}
                  >
                    <SelectTrigger className="min-w-0 flex-1 sm:w-56 sm:flex-none" aria-label="Source to assign">
                      <SelectValue placeholder="Select source">
                        {selectedMatchInfoId && renderProviderWithFlag(selectedMatchInfoId)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableMatchInfos.filter((matchInfo) => matchInfo.id).map((matchInfo) => (
                        <SelectItem key={matchInfo.id} value={matchInfo.id}>
                          {renderProviderWithFlag(matchInfo.id)}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">
                        <div className="flex items-center gap-2 text-accent-ink">
                          <Plus size={14} />
                          <span>Create New Provider</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleMatchSelected}
                    disabled={!selectedMatchInfoId || selectedChapterIndexes.size === 0 || selectedMatchInfoId === "__new__"}
                    className="shrink-0"
                  >
                    Match
                  </Button>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <Label className={cn(trayLabel, "lg:w-auto")}>Range Fill</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Start"
                    aria-label="Range start"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="w-full min-w-0 font-mono sm:w-24"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Step"
                    aria-label="Range step"
                    value={rangeStep}
                    onChange={(e) => setRangeStep(e.target.value)}
                    className="w-full min-w-0 font-mono sm:w-20"
                  />
                  <Button
                    variant="outline"
                    onClick={handleFillRange}
                    disabled={!rangeStart || !rangeStep || selectedChapterIndexes.size === 0}
                    className="shrink-0"
                  >
                    Fill
                  </Button>
                </div>
              </div>

              {/* New provider creation form - shown when "Create New Provider" is selected */}
              {showNewProviderForm && (
                <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2.5 rounded-md border border-dashed border-accent-line bg-paper p-3 motion-safe:animate-paper-rise sm:flex sm:flex-row sm:flex-wrap sm:items-end sm:gap-4 lg:basis-full">
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <Label htmlFor="pmd-new-name" className="paper-eyebrow text-[10px]">Name</Label>
                    <Input
                      id="pmd-new-name"
                      placeholder="Provider name"
                      value={newProviderName}
                      onChange={(e) => setNewProviderName(e.target.value)}
                      className="w-full sm:w-48"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pmd-new-scanlator" className="paper-eyebrow text-[10px]">Scanlator</Label>
                    <Input
                      id="pmd-new-scanlator"
                      placeholder="Scanlator (optional)"
                      value={newProviderScanlator}
                      onChange={(e) => setNewProviderScanlator(e.target.value)}
                      className="w-full sm:w-40"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pmd-new-lang" className="paper-eyebrow text-[10px]">Language</Label>
                    <Input
                      id="pmd-new-lang"
                      placeholder="en"
                      value={newProviderLanguage}
                      onChange={(e) => setNewProviderLanguage(e.target.value)}
                      className="w-full font-mono sm:w-20"
                    />
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-2 sm:flex sm:items-end">
                    <Button
                      onClick={handleNewProviderConfirm}
                      disabled={!newProviderName.trim()}
                      variant="default"
                    >
                      Create
                    </Button>
                    <Button
                      onClick={handleNewProviderCancel}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="shrink-0 pt-3 max-sm:grid max-sm:grid-cols-2 sm:items-center">
          <div className="flex items-center justify-center font-mono text-[11.5px] text-ink-3 max-sm:col-span-2 sm:mr-auto sm:justify-start">
            <span className="tabular-nums">({selectedChapterIndexes.size} of {chapters.length} selected)</span>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || isLoading}
          >
            {isLoading ? "Saving..." : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
