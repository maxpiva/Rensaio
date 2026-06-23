"use client";

import React from "react";
import { Check, ChevronRight } from "lucide-react";

export interface ProgressPillStep {
  id: string;
  label: string;
}

interface ProgressPillProps {
  steps: ProgressPillStep[];
  currentStep: number; // 0-based
}

export function ProgressPill({ steps, currentStep }: ProgressPillProps) {
  const total = steps.length;
  // percentage through the wizard: e.g. step 1 of 4 = 25%, step 2 of 4 = 50%
  const pct = Math.round(((currentStep + 1) / total) * 100);
  const activeStep = steps[currentStep];
  const stepNum = String(currentStep + 1).padStart(2, "0");
  const stepLabel = activeStep?.label.toUpperCase() ?? "";

  return (
    <>
      {/* Desktop: N-segment bar — hidden on ≤640px via CSS. Column count is driven
          inline so the stepper fits any number of steps (4 for import, 7 for setup). */}
      <div
        className="iw-stepper"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        aria-label="Wizard progress"
      >
        {/* Visually-hidden full progress announcement for screen readers on desktop */}
        <span className="sr-only">
          Step {currentStep + 1} of {total}: {activeStep?.label}
        </span>
        {steps.map((step, i) => {
          const isComplete = i < currentStep;
          const isActive = i === currentStep;
          const isPending = i > currentStep;
          const segClass = [
            "iw-segment",
            isComplete ? "is-complete" : "",
            isActive ? "is-active" : "",
            isPending ? "is-pending" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={step.id} className={segClass}>
              <div className="iw-segment-bar" />
              <div className="iw-segment-label">
                {isComplete ? (
                  <Check className="iw-segment-check" aria-hidden />
                ) : (
                  <span className="iw-segment-num" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                )}
                <span>{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: compact pill + hairline — shown only on ≤640px via CSS */}
      {/* aria-hidden removed: this is the only visible progress landmark on mobile */}
      <div className="iw-mobile-stepper" aria-label="Wizard progress">
        {/* Visually-hidden full progress announcement for screen readers on mobile */}
        <span className="sr-only">
          Step {currentStep + 1} of {total}: {activeStep?.label}
        </span>
        <div className="iw-mobile-current" aria-hidden="true">
          <span className="iw-mobile-pct">{stepNum}</span>
          <span>·</span>
          <span>{stepLabel}</span>
          <ChevronRight className="iw-mobile-caret" aria-hidden />
        </div>
        <div className="iw-mobile-hair" aria-hidden="true">
          <span
            className="iw-mobile-hair-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </>
  );
}
