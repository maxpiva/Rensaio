"use client";

import React from "react";
import { useImportWizard } from "@/components/providers/import-wizard-provider";

// Import step components (reusing from setup wizard)
import { ImportLocalStep } from "../setup-wizard/steps/import-local-step";
import { ConfirmImportsStep } from "../setup-wizard/steps/confirm-imports-step";
import { ScheduleUpdatesStep } from "../setup-wizard/steps/schedule-updates-step";
import { FinishStep } from "../setup-wizard/steps/finish-step";

import { WizardShell, type WizardStep } from "./wizard-shell";

const WIZARD_STEPS: WizardStep[] = [
  {
    id: "import",
    label: "Import",
    eyebrow: "Step 01 · Scan",
    title: "Import Local Files",
    description: "Scan your archives and select series to import.",
  },
  {
    id: "confirm",
    label: "Review",
    eyebrow: "Step 02 · Review",
    title: "Confirm Imports",
    description: "Review and match each detected series before importing.",
  },
  {
    id: "schedule",
    label: "Schedule",
    eyebrow: "Step 03 · Configure",
    title: "Schedule Updates",
    description: "Configure automatic update schedules for your series.",
  },
  {
    id: "finish",
    label: "Finish",
    eyebrow: "Step 04 · Complete",
    title: "Finish",
    description: "Your series are being imported into the library.",
  },
];

export function ImportWizard() {
  const { isWizardActive, currentStep, totalSteps, nextStep, previousStep, completeWizard, cancelWizard } =
    useImportWizard();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [canProgress, setCanProgress] = React.useState(false);
  const [disableDownloads, setDisableDownloads] = React.useState(false);

  if (!isWizardActive) {
    return null;
  }

  const handleNext =
    currentStep === totalSteps - 1
      ? () => void completeWizard()
      : () => void nextStep();

  const handlePrevious = () => previousStep();
  const handleClose = () => cancelWizard();

  return (
    <WizardShell
      open={true}
      onOpenChange={(open) => {
        if (!open) cancelWizard();
      }}
      currentStep={currentStep}
      steps={WIZARD_STEPS}
      canPrevious={currentStep > 0}
      canNext={canProgress}
      isLoading={isLoading}
      onPrevious={handlePrevious}
      onNext={handleNext}
      onClose={handleClose}
    >
      {error && (
        <div className="mb-4 list-disc space-y-1 rounded-lg border bg-destructive/10 p-2 text-[0.8rem] font-medium text-destructive">
          {error}
        </div>
      )}

      {currentStep === 0 && (
        <ImportLocalStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
          forceRescan
        />
      )}

      {currentStep === 1 && (
        <ConfirmImportsStep
          key={`confirm-imports-step-${currentStep}`}
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
        />
      )}

      {currentStep === 2 && (
        <ScheduleUpdatesStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
          onDownloadOptionChange={setDisableDownloads}
        />
      )}

      {currentStep === 3 && (
        <FinishStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
          disableDownloads={disableDownloads}
        />
      )}
    </WizardShell>
  );
}
