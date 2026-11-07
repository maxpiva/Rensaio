"use client";

import React from "react";

import { cn } from "@/lib/utils";

export interface ProgressPillStep {
  id: string;
  label: string;
}

interface ProgressPillProps {
  steps: ProgressPillStep[];
  currentStep: number; // 0-based
  className?: string;
}

/**
 * Compact wizard progress: a mono "Step 03 of 07 · Scan" kicker over one
 * hairline bar per step (done = ink, current = crimson, pending = paper).
 * The desktop wizard shows the full step rail instead; this is the phone and
 * tablet header. Column count follows the step count (4 for import, 7 setup).
 */
export function ProgressPill({ steps, currentStep, className }: ProgressPillProps) {
  const total = steps.length;
  const activeStep = steps[currentStep];
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className={cn("min-w-0", className)} aria-label="Wizard progress" role="group">
      <span className="sr-only">
        Step {currentStep + 1} of {total}: {activeStep?.label}
      </span>
      <div
        aria-hidden="true"
        className="flex min-w-0 items-baseline gap-1.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-ink-3"
      >
        <span className="shrink-0">
          Step <b className="font-bold text-accent-ink">{pad(currentStep + 1)}</b> of {pad(total)}
        </span>
        <span className="shrink-0">·</span>
        <span className="truncate text-ink">{activeStep?.label}</span>
      </div>
      <div
        aria-hidden="true"
        className="mt-2 grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => (
          <i
            key={step.id}
            className={cn(
              "block h-1 rounded-[2px] transition-colors duration-300",
              i < currentStep ? "bg-ink" : i === currentStep ? "bg-primary" : "bg-paper-3",
            )}
          />
        ))}
      </div>
    </div>
  );
}
