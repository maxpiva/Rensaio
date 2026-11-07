"use client";
import { type AddSeriesState } from "@/components/comp/series/add-series";
import { SearchSeriesStep } from "@/components/comp/series/add-series/steps/search-series-step";
import { ConfirmSeriesStep } from "@/components/comp/series/add-series/steps/confirm-series-step";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAddSeries } from "@/lib/api/hooks/useSeries";
import { useAugmentSeries } from "@/lib/api/hooks/useSearch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { type LinkedSeries, type FullSeries, type ExistingSource, type AugmentedResponse, type AugmentSourceError } from "@/lib/api/types";

/** Find the first series whose language matches the user's preferred languages. */
function findPreferredSeriesIndex(series: FullSeries[], preferredLanguages: string[] | undefined | null): number {
  if (!Array.isArray(series) || series.length === 0) return 0;
  if (!Array.isArray(preferredLanguages) || preferredLanguages.length === 0) return 0;
  for (const preferredLang of preferredLanguages) {
    if (typeof preferredLang === 'string') {
      const matchingIndex = series.findIndex(s =>
        typeof s.lang === 'string' &&
        s.lang.toLowerCase() === preferredLang.toLowerCase()
      );
      if (matchingIndex !== -1) return matchingIndex;
    }
  }
  return 0;
}

export interface AddSeriesStepsProps {
  onFinish: () => void;
  title?: string;
  existingSources?: ExistingSource[];
  seriesId?: string;
  isAddSourcesMode?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddSeriesSteps({
  onFinish,
  title,
  existingSources,
  seriesId,
  isAddSourcesMode = false,
  onOpenChange,
}: AddSeriesStepsProps) {
  const [formState, setFormState] = React.useState<AddSeriesState>({
    selectedLinkedSeries: [],
    searchKeyword: title ?? "",
    allLinkedSeries: [],
    fullSeries: [],
    originalAugmentedResponse: undefined,
    storagePath: undefined,
  });
  const [error, setError] = React.useState<string | null>(null);
  // The search step already renders its own query error inline; remember it so
  // the dialog-level alert doesn't print the same message a second time.
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const setSearchStepError = React.useCallback<React.Dispatch<React.SetStateAction<string | null>>>((value) => {
    setError(value);
    setSearchError(value);
  }, []);
  const [isLoading, setIsLoading] = React.useState(false);
  const [canProgress, setCanProgress] = React.useState(false);
  const [pendingNextStep, setPendingNextStep] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(0);

  const addSeries = useAddSeries();
  const augmentSeries = useAugmentSeries();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  React.useEffect(() => {
    if (pendingNextStep && formState.fullSeries.length > 0) {
      setPendingNextStep(false);
      setCurrentStep((step) => step + 1);
    }
  }, [pendingNextStep, formState.fullSeries]);

  const handleSubmit = async () => {
    try {
      const selectedSeries = formState.fullSeries.filter((series: FullSeries) => series.isSelected);

      if (!formState.originalAugmentedResponse) {
        throw new Error('Original augmented response not found');
      }
      const finalAugmentedResponse: AugmentedResponse = {
        ...formState.originalAugmentedResponse,
        series: selectedSeries,
        storageFolderPath: formState.storagePath?.length
          ? formState.storagePath
          : formState.originalAugmentedResponse.storageFolderPath,
        existingSeries: isAddSourcesMode || formState.originalAugmentedResponse.existingSeries,
        existingSeriesId: (isAddSourcesMode && seriesId) ? seriesId : formState.originalAugmentedResponse.existingSeriesId,
      };

      await addSeries.mutateAsync(finalAugmentedResponse);

      if (isAddSourcesMode && seriesId) {
        await queryClient.invalidateQueries({ queryKey: ['series', 'detail', seriesId] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['series', 'library'] });
      }

      onOpenChange?.(false);
      onFinish();
    } catch (err) {
      console.error('Failed to add series:', err);
      const msg = err instanceof Error ? err.message : 'Failed to add series.';
      setError(msg);
      toast({ title: 'Failed to add series', description: msg, variant: 'destructive' });
    }
  };

  const formatSourceErrors = (errors: AugmentSourceError[]): string =>
    errors
      .map((e) => (e.provider ? `${e.provider}: ${e.reason}` : e.reason))
      .join(" ");

  const handleNext = async () => {
    setError(null);
    try {
      const allLinkedSeries = formState.allLinkedSeries;
      const selectedLinked: LinkedSeries[] = allLinkedSeries.filter((series: LinkedSeries) =>
        formState.selectedLinkedSeries.includes(series.mihonId ?? series.providerId)
      );
      const augmentedResponse = await augmentSeries.mutateAsync(selectedLinked);

      const sourceErrors = augmentedResponse.sourceErrors ?? [];
      if (!augmentedResponse.series || augmentedResponse.series.length === 0) {
        const detail = sourceErrors.length > 0
          ? formatSourceErrors(sourceErrors)
          : "None of the selected sources returned any details.";
        setError(detail);
        toast({ title: "Couldn't fetch series details", description: detail, variant: "destructive" });
        return;
      }
      if (sourceErrors.length > 0) {
        toast({
          title: "Some sources were skipped",
          description: formatSourceErrors(sourceErrors),
          variant: "destructive",
        });
      }

      if (isAddSourcesMode && seriesId) {
        augmentedResponse.existingSeries = true;
        augmentedResponse.existingSeriesId = seriesId;
      }

      const preferredIndex = isAddSourcesMode ? 0 : findPreferredSeriesIndex(augmentedResponse.series, augmentedResponse.preferredLanguages);
      const fullSeriesWithDefaults: FullSeries[] = augmentedResponse.series.map((series: FullSeries, index: number): FullSeries => ({
        ...series,
        isStorage: isAddSourcesMode ? false : index === preferredIndex,
        useCover: isAddSourcesMode ? false : index === preferredIndex,
        useTitle: isAddSourcesMode ? false : index === preferredIndex,
      }));

      setFormState((prev: AddSeriesState): AddSeriesState => ({
        ...prev,
        fullSeries: fullSeriesWithDefaults,
        originalAugmentedResponse: augmentedResponse,
        storagePath: augmentedResponse.storageFolderPath,
      }));
      setPendingNextStep(true);
    } catch (err) {
      console.error('Failed to augment series:', err);
      const msg = err instanceof Error ? err.message : 'Failed to fetch series details.';
      setError(msg);
      toast({ title: 'Failed to fetch series details', description: msg, variant: 'destructive' });
    }
  };

  const handlePrev = () => {
    setCurrentStep((step) => Math.max(0, step - 1));
  };

  const isPending = Boolean(augmentSeries.isPending) || Boolean(addSeries.isPending);
  const isStage0 = currentStep === 0;

  const getButtonLabel = (): { label: string; icon: React.ReactNode } => {
    if (!isStage0) {
      if (isAddSourcesMode) return { label: "Add Sources", icon: isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" /> };
      return { label: "Add Series", icon: isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" /> };
    }
    return { label: "Next", icon: isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" /> };
  };

  const getStageLabel = (): string => {
    if (isStage0) return "STAGE 01 / SEARCH";
    return "STAGE 02 / CONFIRM";
  };

  const getLeftMetaCopy = (): string => {
    if (isStage0) {
      return `${formState.allLinkedSeries.length} results · ${formState.selectedLinkedSeries.length} selected`;
    }
    const validSelected = formState.fullSeries.filter((s: FullSeries) => s.isSelected);
    const totalChapters = validSelected.reduce((sum: number, s: FullSeries) => sum + (s.chapterCount ?? 0), 0);
    return `${validSelected.length} sources · ${totalChapters} chapters`;
  };

  const { label, icon } = getButtonLabel();
  const stageNumber = isStage0 ? 0 : 1;

  return (
    <div className="relative flex max-h-[86dvh] flex-col overflow-hidden rounded-xl border border-rule-2 bg-paper text-ink shadow-lift">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="relative shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
        <button
          type="button"
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-4 sm:top-4 sm:h-9 sm:w-9"
          aria-label="Close"
          onClick={() => onOpenChange?.(false)}
        >
          <X className="h-4 w-4" />
        </button>

        <p className="paper-eyebrow pr-12 text-accent-ink">{getStageLabel()}</p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 pr-12">
          <DialogTitle className="paper-display text-[26px] leading-[1.05] tracking-[-0.02em] sm:text-[30px]">
            Add <em>{isAddSourcesMode ? "sources" : "series"}</em>
          </DialogTitle>
          {title && isAddSourcesMode && (
            <span className="min-w-0 truncate font-serif text-[15px] italic text-ink-2">{title}</span>
          )}
        </div>

        {/* Two-stage track: done = ink, current = crimson, upcoming = hairline */}
        <div className="mt-4 grid grid-cols-2 gap-1.5" aria-hidden="true">
          {[0, 1].map((step) => (
            <span
              key={step}
              className={cn(
                "h-[3px] rounded-full transition-colors duration-300",
                step < stageNumber && "bg-ink",
                step === stageNumber && "bg-primary",
                step > stageNumber && "bg-rule-2",
              )}
            />
          ))}
        </div>
      </header>

      {/* ── Stage body (each step owns its own scroll area) ───────── */}
      <div
        key={stageNumber}
        className="flex min-h-0 flex-1 flex-col motion-safe:animate-paper-rise"
      >
        {isStage0 ? (
          <SearchSeriesStep
            formState={formState}
            setFormState={setFormState}
            setError={setSearchStepError}
            setIsLoading={setIsLoading}
            setCanProgress={setCanProgress}
            existingSources={existingSources}
          />
        ) : (
          <ConfirmSeriesStep
            formState={formState}
            setFormState={setFormState}
            setError={setError}
            setIsLoading={setIsLoading}
            setCanProgress={setCanProgress}
            isAddSourcesMode={isAddSourcesMode}
            existingSources={existingSources}
          />
        )}
      </div>

      {error && !(isStage0 && error === searchError) && (
        <div
          role="alert"
          className="mx-5 mb-3 flex shrink-0 items-start gap-2 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] leading-snug text-bad sm:mx-7"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="flex shrink-0 flex-col gap-2.5 border-t border-rule bg-paper-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 tabular-nums" aria-live="polite">
          {getLeftMetaCopy()}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="max-sm:flex-1"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          <Button
            type="button"
            className="gap-1.5 max-sm:flex-[2] sm:min-w-[8.5rem]"
            onClick={isStage0 ? handleNext : handleSubmit}
            disabled={!canProgress || isLoading || isPending}
          >
            {icon}
            {label}
          </Button>
        </div>
      </footer>
    </div>
  );
}
