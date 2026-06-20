"use client";

import React from "react";
import { useSetupWizard } from "@/components/providers/setup-wizard-provider";

// Import step components
import { PreferencesStep } from "./steps/preferences-step";
import { AddProvidersStep } from "./steps/add-providers-step";
import { ImportLocalStep } from "./steps/import-local-step";
import { ConfirmImportsStep } from "./steps/confirm-imports-step";
import { ScheduleUpdatesStep } from "./steps/schedule-updates-step";
import { FinishStep } from "./steps/finish-step";
import { IdentifyUserStep } from "./steps/identify-user-step";

import {
  WizardShell,
  type WizardStep,
} from "@/components/comp/import-wizard/wizard-shell";

// Setup-wizard steps reuse the redesigned glass WizardShell (same shell as the
// import wizard). `label` is the short token shown in the progress pill; `title`
// is the full hero heading. Order matches the provider's TOTAL_STEPS = 7.
const WIZARD_STEPS: WizardStep[] = [
  {
    id: "preferences",
    label: "Prefs",
    eyebrow: "Step 01 · Configure",
    title: "Preferences",
    description: "Configure your core settings before importing.",
  },
  {
    id: "providers",
    label: "Sources",
    eyebrow: "Step 02 · Install",
    title: "Add Sources",
    description: "Install the manga sources you want to track.",
  },
  {
    id: "import",
    label: "Scan",
    eyebrow: "Step 03 · Scan",
    title: "Import Local Files",
    description: "Scan your archives, install sources, and match series.",
  },
  {
    id: "confirm",
    label: "Review",
    eyebrow: "Step 04 · Review",
    title: "Confirm Imports",
    description: "Review and match each detected series before importing.",
  },
  {
    id: "schedule",
    label: "Schedule",
    eyebrow: "Step 05 · Schedule",
    title: "Schedule Summary",
    description: "Check the incoming update schedule for your series.",
  },
  {
    id: "finish",
    label: "Import",
    eyebrow: "Step 06 · Import",
    title: "Finish Import",
    description: "Your selected series are being imported into the library.",
  },
  {
    id: "user",
    label: "User",
    eyebrow: "Step 07 · Account",
    title: "User Setup",
    description: "Create or identify the administrator account.",
  },
];

export function SetupWizard() {
  const {
    isWizardActive,
    currentStep,
    totalSteps,
    nextStep,
    previousStep,
    completeWizard,
  } = useSetupWizard();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [canProgress, setCanProgress] = React.useState(false);
  const [disableDownloads, setDisableDownloads] = React.useState(false);
  const [autoCreatedUsers, setAutoCreatedUsers] = React.useState<string[]>([]);

  // Reset canProgress when entering a new step to prevent stale state.
  React.useEffect(() => {
    setCanProgress(false);
  }, [currentStep]);

  if (!isWizardActive) {
    return null;
  }

  const isLastStep = currentStep === totalSteps - 1;
  const handleNext = isLastStep
    ? () => void completeWizard()
    : () => void nextStep();

  return (
    <WizardShell
      open={true}
      currentStep={currentStep}
      steps={WIZARD_STEPS}
      canPrevious={currentStep > 0}
      canNext={canProgress}
      isLoading={isLoading}
      nextLabel={isLastStep ? "Finish" : "Continue →"}
      onPrevious={() => previousStep()}
      onNext={handleNext}
      // First-time setup is mandatory: no close / escape / outside-click dismissal.
      dismissable={false}
    >
      {error && (
        <div className="mb-4 list-disc space-y-1 rounded-lg border bg-destructive/10 p-2 text-[0.8rem] font-medium text-destructive">
          {error}
        </div>
      )}

      {currentStep === 0 && (
        <PreferencesStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
        />
      )}

      {currentStep === 1 && (
        <AddProvidersStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
        />
      )}

      {currentStep === 2 && (
        <ImportLocalStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
        />
      )}

      {currentStep === 3 && (
        <ConfirmImportsStep
          key={`confirm-imports-step-${currentStep}`}
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
        />
      )}

      {currentStep === 4 && (
        <ScheduleUpdatesStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
          onDownloadOptionChange={setDisableDownloads}
        />
      )}

      {currentStep === 5 && (
        <FinishStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
          disableDownloads={disableDownloads}
          onUsersDetected={(users) => setAutoCreatedUsers(users)}
        />
      )}

      {currentStep === 6 && (
        <IdentifyUserStep
          setError={setError}
          setIsLoading={setIsLoading}
          setCanProgress={setCanProgress}
          autoCreatedUsers={autoCreatedUsers}
        />
      )}
    </WizardShell>
  );
}
