"use client";
import { type AddSeriesState } from "@/components/kzk/series/add-series";
import { SearchSeriesStep } from "@/components/kzk/series/add-series/steps/search-series-step";
import { ConfirmSeriesStep } from "@/components/kzk/series/add-series/steps/confirm-series-step";
import { RequestSeriesStep } from "@/components/kzk/series/add-series/steps/request-series-step";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Plus,
  Send,
  X,
} from "lucide-react";
import React from "react";
import { useAddSeries } from "@/lib/api/hooks/useSeries";
import { useAugmentSeries } from "@/lib/api/hooks/useSearch";
import { useCreateRequest, useApproveRequest } from "@/lib/api/hooks/useRequests";
import { usePermission } from "@/hooks/use-permission";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { type LinkedSeries, type FullSeries, type ExistingSource, type AugmentedResponse } from "@/lib/api/types";

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
  approveRequestId?: string;
  preloadedLinkedSeries?: LinkedSeries[];
  onOpenChange?: (open: boolean) => void;
}

export function AddSeriesSteps({
  onFinish,
  title,
  existingSources,
  seriesId,
  isAddSourcesMode = false,
  approveRequestId,
  preloadedLinkedSeries,
  onOpenChange,
}: AddSeriesStepsProps) {
  const canAddSeries = usePermission('canAddSeries');
  const isApproveMode = !!(approveRequestId && preloadedLinkedSeries);
  const isRequestMode = !canAddSeries && !isAddSourcesMode && !isApproveMode;

  const [formState, setFormState] = React.useState<AddSeriesState>({
    selectedLinkedSeries: [],
    searchKeyword: title || "",
    allLinkedSeries: [],
    fullSeries: [],
    originalAugmentedResponse: undefined,
    storagePath: undefined,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [canProgress, setCanProgress] = React.useState(false);
  const [pendingNextStep, setPendingNextStep] = React.useState(false);
  const [requestNote, setRequestNote] = React.useState("");
  const [currentStep, setCurrentStep] = React.useState(0);

  const addSeries = useAddSeries();
  const augmentSeries = useAugmentSeries();
  const createRequest = useCreateRequest();
  const approveRequest = useApproveRequest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  React.useEffect(() => {
    if (pendingNextStep && formState.fullSeries.length > 0) {
      setPendingNextStep(false);
      setCurrentStep((step) => step + 1);
    }
  }, [pendingNextStep, formState.fullSeries]);

  // Approve mode: auto-augment preloaded linked series on mount
  const hasAugmentedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isApproveMode || !preloadedLinkedSeries || hasAugmentedRef.current) return;
    hasAugmentedRef.current = true;

    const doAugment = async () => {
      try {
        setIsLoading(true);
        const augmentedResponse = await augmentSeries.mutateAsync(preloadedLinkedSeries);

        const preferredIndex = findPreferredSeriesIndex(augmentedResponse.series, augmentedResponse.preferredLanguages);
        const fullSeriesWithDefaults: FullSeries[] = augmentedResponse.series.map((series: FullSeries, index: number): FullSeries => ({
          ...series,
          isStorage: index === preferredIndex,
          useCover: index === preferredIndex,
          useTitle: index === preferredIndex,
        }));

        setFormState((prev: AddSeriesState): AddSeriesState => ({
          ...prev,
          fullSeries: fullSeriesWithDefaults,
          originalAugmentedResponse: augmentedResponse,
          storagePath: augmentedResponse.storageFolderPath,
        }));
      } catch (err) {
        console.error('Failed to augment series for approval:', err);
        setError('Failed to load series details. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    doAugment();
  }, [isApproveMode, preloadedLinkedSeries]);

  const handleSubmit = async () => {
    if (isRequestMode) {
      try {
        const selectedLinked = formState.allLinkedSeries.filter((series: LinkedSeries) =>
          formState.selectedLinkedSeries.includes(series.mihonId ?? series.providerId)
        );

        const primary = selectedLinked[0];
        if (selectedLinked.length === 0 || !primary) return;

        await createRequest.mutateAsync({
          title: primary.title,
          description: requestNote || undefined,
          thumbnailUrl: primary.thumbnailUrl ?? undefined,
          providerData: JSON.stringify(selectedLinked),
        });

        toast({
          title: 'Request submitted',
          description: `"${primary.title}" has been requested.`,
          variant: 'success',
        });
        onOpenChange?.(false);
        onFinish();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to submit request.';
        if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exist')) {
          toast({ title: 'Already requested', description: 'This manga has already been requested.', variant: 'destructive' });
        } else {
          toast({ title: 'Failed to submit request', description: msg, variant: 'destructive' });
        }
      }
    } else {
      try {
        const selectedSeries = formState.fullSeries.filter((series: FullSeries) => series.isSelected);

        if (!formState.originalAugmentedResponse) {
          throw new Error('Original augmented response not found');
        }
        const finalAugmentedResponse: AugmentedResponse = {
          ...formState.originalAugmentedResponse,
          series: selectedSeries,
          storageFolderPath: formState.storagePath || formState.originalAugmentedResponse.storageFolderPath,
          existingSeries: isAddSourcesMode || formState.originalAugmentedResponse.existingSeries,
          existingSeriesId: (isAddSourcesMode && seriesId) ? seriesId : formState.originalAugmentedResponse.existingSeriesId,
        };

        await addSeries.mutateAsync(finalAugmentedResponse);

        if (isApproveMode && approveRequestId) {
          try {
            await approveRequest.mutateAsync({ id: approveRequestId });
          } catch (err) {
            console.error('Series added but failed to update request status:', err);
          }
        }

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
    }
  };

  const handleNext = async () => {
    if (isRequestMode) {
      setCurrentStep(1);
    } else {
      try {
        const allLinkedSeries = formState.allLinkedSeries;
        const selectedLinked: LinkedSeries[] = allLinkedSeries.filter((series: LinkedSeries) =>
          formState.selectedLinkedSeries.includes(series.mihonId ?? series.providerId)
        );
        const augmentedResponse = await augmentSeries.mutateAsync(selectedLinked);

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
      }
    }
  };

  const handlePrev = () => {
    setCurrentStep((step) => Math.max(0, step - 1));
  };

  const isPending = Boolean(augmentSeries.isPending) || Boolean(addSeries.isPending) || Boolean(createRequest.isPending) || Boolean(approveRequest.isPending);
  const isStage0 = currentStep === 0 && !isApproveMode;

  const getButtonLabel = (): { label: string; icon: React.ReactNode } => {
    if (!isStage0) {
      if (isRequestMode) return { label: "Request Series", icon: isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" /> };
      if (isApproveMode) return { label: "Approve & Add", icon: isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" /> };
      if (isAddSourcesMode) return { label: "Add Sources", icon: isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" /> };
      return { label: "Add Series", icon: isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" /> };
    }
    return { label: "Next", icon: isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" /> };
  };

  const getStageLabel = (): string => {
    if (isApproveMode) return "STAGE / APPROVE & ADD";
    if (isStage0) return "STAGE 01 / SEARCH";
    if (isRequestMode) return "STAGE 02 / REQUEST";
    return "STAGE 02 / CONFIRM";
  };

  const getLeftMetaCopy = (): string => {
    if (isStage0) {
      return `${formState.allLinkedSeries.length} results · ${formState.selectedLinkedSeries.length} selected`;
    }
    if (isRequestMode) {
      return `${formState.selectedLinkedSeries.length} sources selected`;
    }
    const validSelected = formState.fullSeries.filter((s: FullSeries) => s.isSelected);
    const totalChapters = validSelected.reduce((sum: number, s: FullSeries) => sum + (s.chapterCount ?? 0), 0);
    return `${validSelected.length} sources · ${totalChapters} chapters`;
  };

  const { label, icon } = getButtonLabel();

  return (
    <div className="cmd-card">
      <button
        type="button"
        className="cmd-close"
        aria-label="Close"
        onClick={() => onOpenChange?.(false)}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="stage-label">
        <span className="eyebrow">{getStageLabel()}</span>
        {title && isAddSourcesMode && (
          <span style={{ fontSize: "11px", color: "hsl(var(--as-fg-muted))", marginLeft: "8px", fontStyle: "italic" }}>{title}</span>
        )}
      </div>
      <div className="editorial-rule" />

      {isStage0 ? (
        <div className="stage-enter">
          <SearchSeriesStep
            formState={formState}
            setFormState={setFormState}
            setError={setError}
            setIsLoading={setIsLoading}
            setCanProgress={setCanProgress}
            existingSources={existingSources}
          />
        </div>
      ) : (
        <div className="stage-enter">
          {isRequestMode ? (
            <RequestSeriesStep
              formState={formState}
              setCanProgress={setCanProgress}
              requestNote={requestNote}
              onRequestNoteChange={setRequestNote}
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
      )}

      {error && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded text-destructive text-sm" style={{ background: "hsla(0 0% 100% / 0.04)", border: "1px solid hsla(0 84% 60% / 0.25)" }}>
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="cta-row">
        <div className="left-meta font-mono">
          {getLeftMetaCopy()}
        </div>
        <div className="cta-buttons">
          <button
            type="button"
            className="btn-ghost"
            onClick={handlePrev}
            disabled={currentStep === 0 || isApproveMode}
          >
            Back
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={isStage0 ? handleNext : handleSubmit}
            disabled={!canProgress || isLoading || isPending}
          >
            {icon}
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}
