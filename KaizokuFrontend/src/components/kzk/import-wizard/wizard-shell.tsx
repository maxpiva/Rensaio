"use client";

import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LoaderCircle, X } from "lucide-react";
import { ProgressPill, type ProgressPillStep } from "./progress-pill";

export interface WizardStep extends ProgressPillStep {
  title: string;
  eyebrow: string;
  description?: string;
}

interface WizardShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStep: number; // 0-based
  steps: WizardStep[];
  canPrevious: boolean;
  canNext: boolean;
  isLoading: boolean;
  nextLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function WizardShell({
  open,
  onOpenChange,
  currentStep,
  steps,
  canPrevious,
  canNext,
  isLoading,
  nextLabel,
  onPrevious,
  onNext,
  onClose,
  children,
}: WizardShellProps) {
  const total = steps.length;
  const isLastStep = currentStep === total - 1;
  const step = steps[currentStep];

  const resolvedNextLabel = nextLabel ?? (isLastStep ? "Finish" : "Continue →");

  const pillSteps: ProgressPillStep[] = steps.map((s) => ({
    id: s.id,
    label: s.label,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent
        className="iw-modal bg-transparent border-0 shadow-none p-0 max-h-none overflow-visible w-screen sm:w-[min(720px,calc(100vw-48px))] max-w-none top-0 sm:top-[6vh] translate-y-0 [&>button]:hidden"
        overlayClassName="bg-[hsl(240_10%_4%/0.85)] backdrop-blur-xl"
        onInteractOutside={(e) => {
          // Prevent accidental close on desktop; allow on mobile
          if (!window.matchMedia("(max-width: 640px)").matches) {
            e.preventDefault();
          }
        }}
      >
        {/* Spotlight radial glow behind the modal */}
        <div className="iw-spotlight" aria-hidden />

        {/* Glass shell */}
        <div className="cmd-card iw-shell">
          {/* Top hairline is rendered by cmd-card::before */}

          {/* Header: progress pill + close */}
          <div className="iw-header">
            <ProgressPill steps={pillSteps} currentStep={currentStep} />

            <button
              type="button"
              className="iw-close cmd-close"
              aria-label="Close import wizard"
              onClick={onClose}
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          {/* Hero band: eyebrow + Fraunces title */}
          <div className="iw-hero">
            <div className="iw-eyebrow">{step?.eyebrow}</div>
            <h1 className="iw-title">{step?.title}</h1>
            {step?.description && (
              <p className="iw-desc">{step.description}</p>
            )}
          </div>

          {/* Step content */}
          <div className="iw-content">
            {children}
          </div>

          {/* Footer */}
          <footer className="iw-footer">
            {/* Back / Cancel */}
            {canPrevious ? (
              <button
                type="button"
                className="iw-back-btn"
                onClick={onPrevious}
                disabled={isLoading}
              >
                ← Back
              </button>
            ) : (
              <button
                type="button"
                className="iw-back-btn"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </button>
            )}

            {/* Step meta */}
            <div className="iw-step-meta">
              Step <strong>{currentStep + 1}</strong> of {total}
            </div>

            {/* Continue / Finish */}
            <button
              type="button"
              className="iw-primary-btn"
              onClick={onNext}
              disabled={!canNext || isLoading}
            >
              {isLoading ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden />
              ) : null}
              {resolvedNextLabel}
            </button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
