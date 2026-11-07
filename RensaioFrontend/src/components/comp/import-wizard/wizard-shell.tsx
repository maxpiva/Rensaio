"use client";

import React from "react";
import { AlertCircle, ArrowRight, Check, ChevronLeft, LoaderCircle, X } from "lucide-react";

import { BrandSeal, BrandWordmark } from "@/components/comp/layout/brand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ProgressPill, type ProgressPillStep } from "./progress-pill";

export interface WizardStep extends ProgressPillStep {
  title: string;
  eyebrow: string;
  description?: string;
}

interface WizardShellProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  currentStep: number; // 0-based
  steps: WizardStep[];
  canPrevious: boolean;
  canNext: boolean;
  isLoading: boolean;
  nextLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  onClose?: () => void;
  /**
   * When false the wizard cannot be dismissed: the close button is hidden and
   * escape / outside-click are swallowed. Used by the mandatory first-time
   * setup flow. Defaults to true (the import wizard is freely dismissable).
   */
  dismissable?: boolean;
  /** Small mono line under the brand in the step rail. */
  kicker?: string;
  children: React.ReactNode;
}

/** "Step 03 · Scan" → folio number + label; anything else is shown as-is. */
function splitEyebrow(eyebrow?: string): { no?: string; label: string } {
  const m = eyebrow?.match(/^Step\s+(\d+)\s*·\s*(.+)$/);
  return m ? { no: m[1], label: m[2] ?? "" } : { label: eyebrow ?? "" };
}

/**
 * Paper wizard shell (setup wizard + import wizard).
 *
 * Desktop (≥1024px): a centred spread. A 260px rail lists every step with its
 * description, done/current markers and a connecting rule; the main page has
 * the folio + serif title, the scrolling step content and a footer bar.
 * Phone/tablet: full screen. The rail becomes a progress-bar header, the
 * footer is pinned with full-width Back / Continue buttons above the safe area.
 */
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
  dismissable = true,
  kicker,
  children,
}: WizardShellProps) {
  const total = steps.length;
  const isLastStep = currentStep === total - 1;
  const step = steps[currentStep];
  const { no, label } = splitEyebrow(step?.eyebrow);
  const pct = Math.round(((currentStep + 1) / total) * 100);

  const resolvedNextLabel = (nextLabel ?? (isLastStep ? "Finish" : "Continue")).replace(/\s*→\s*$/, "");
  const showClose = dismissable && !!onClose;

  return (
    <Dialog open={open} onOpenChange={dismissable ? onOpenChange : undefined} modal>
      <DialogContent
        className={cn(
          // Phone/tablet: full screen sheet
          "outline-none focus-visible:outline-none left-0 top-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-paper p-0 sm:max-h-none sm:w-screen sm:p-0",
          // Desktop: centred spread
          "lg:left-1/2 lg:top-1/2 lg:h-[min(860px,calc(100dvh-48px))] lg:w-[min(1120px,calc(100vw-48px))] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl lg:border lg:border-rule-2 lg:shadow-lift",
          "[&>button:last-child]:hidden",
        )}
        overlayClassName="bg-scrim backdrop-blur-[3px]"
        onInteractOutside={(e) => {
          // Non-dismissable (first-time setup): never close on outside click.
          if (!dismissable) {
            e.preventDefault();
            return;
          }
          // Prevent accidental close on desktop; allow on mobile
          if (!window.matchMedia("(max-width: 640px)").matches) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={dismissable ? undefined : (e) => e.preventDefault()}
      >
        {/* ── Step rail (desktop) ───────────────────────────────────── */}
        <aside
          aria-label="Wizard steps"
          className="hidden w-[260px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper-1 px-[18px] py-6 lg:flex"
        >
          <div className="mb-5 flex items-center gap-[11px] px-2">
            <BrandSeal />
            <span className="flex min-w-0 flex-col gap-1">
              <BrandWordmark />
              <span className="font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.16em] text-ink-3">
                {kicker ?? (dismissable ? "Import library" : "First-run setup")}
              </span>
            </span>
          </div>

          <ol className="flex flex-col gap-0.5">
            {steps.map((s, i) => {
              const done = i < currentStep;
              const cur = i === currentStep;
              return (
                <li
                  key={s.id}
                  aria-current={cur ? "step" : undefined}
                  className={cn(
                    "relative grid grid-cols-[26px_minmax(0,1fr)] items-start gap-2.5 rounded-[5px] px-2 py-[9px]",
                    cur && "bg-hover",
                    i < total - 1 &&
                      "after:absolute after:bottom-[-7px] after:left-[20.5px] after:top-[37px] after:w-[1.5px] after:bg-rule-2",
                    done && "after:bg-ink",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-[26px] w-[26px] place-items-center rounded-full border-[1.5px] font-mono text-[11px] font-semibold transition-colors duration-300",
                      done
                        ? "border-ink bg-ink text-paper"
                        : cur
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-rule-2 bg-paper text-ink-3",
                    )}
                  >
                    {done ? <Check className="h-[13px] w-[13px] stroke-[2.4]" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <b className={cn("mt-[3px] block text-[13.5px] font-semibold", cur ? "text-ink" : "text-ink-2")}>
                      {s.title}
                      {done && <span className="sr-only"> (done)</span>}
                    </b>
                    {s.description && (
                      <small className="mt-0.5 block text-[11.5px] leading-[1.4] text-ink-3">{s.description}</small>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-auto flex flex-col gap-2 border-t border-rule px-2 pt-[18px]">
            <span className="paper-eyebrow">Progress</span>
            <span className="font-mono text-[11.5px] text-ink-2">
              {currentStep + 1} / {total} · {pct}%
            </span>
            <span className="block h-1 overflow-hidden rounded-[2px] bg-paper-3" aria-hidden>
              <span
                className="block h-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </span>
          </div>
        </aside>

        {/* ── Main page ─────────────────────────────────────────────── */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Phone / tablet progress header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-rule bg-paper-1 px-4 pb-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-6 lg:hidden">
            <ProgressPill steps={steps} currentStep={currentStep} className="flex-1" />
            {showClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-mr-2 shrink-0"
                aria-label="Close import wizard"
                onClick={onClose}
              >
                <X aria-hidden />
              </Button>
            )}
          </div>

          {showClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 z-10 hidden lg:inline-flex"
              aria-label="Close import wizard"
              onClick={onClose}
            >
              <X aria-hidden />
            </Button>
          )}

          {/* Masthead */}
          <header
            key={step?.id}
            className="mx-4 shrink-0 rule-double-b pb-3.5 pt-4 motion-safe:animate-paper-rise sm:mx-6 lg:mx-11 lg:pb-4 lg:pr-12 lg:pt-[30px]"
          >
            <div className="mb-2.5 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-ink-3 lg:mb-3">
              {no && <b className="font-bold text-accent-ink">{no}</b>}
              {no && <i aria-hidden className="h-px w-[22px] bg-rule-2" />}
              <span className="truncate">{label}</span>
            </div>
            <DialogTitle asChild>
              <h2 className="paper-display text-[30px] leading-[0.98] text-ink sm:text-[36px] lg:text-[42px]">
                {step?.title}
              </h2>
            </DialogTitle>
            {step?.description ? (
              <DialogDescription className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.55] text-ink-2 lg:mt-3 lg:text-[14px]">
                {step.description}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{step?.title}</DialogDescription>
            )}
          </header>

          {/* Step content */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-6 pt-4 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] sm:px-6 lg:px-11 lg:pb-8 lg:pt-5">
            {children}
          </div>

          {/* Footer */}
          <footer className="flex shrink-0 items-center gap-2.5 border-t border-rule bg-paper-1 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5 sm:px-6 lg:px-11 lg:py-3">
            <span className="mr-auto hidden font-mono text-[11.5px] font-medium text-ink-3 sm:inline">
              Step <b className="font-semibold text-ink">{currentStep + 1}</b> of {total}
            </span>

            {canPrevious ? (
              <Button
                type="button"
                variant="outline"
                className="max-sm:flex-1"
                onClick={onPrevious}
                disabled={isLoading}
              >
                <ChevronLeft aria-hidden />
                Back
              </Button>
            ) : dismissable ? (
              <Button
                type="button"
                variant="outline"
                className="max-sm:flex-1"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
            ) : null}

            <Button
              type="button"
              className="min-w-[132px] max-sm:flex-1"
              onClick={onNext}
              disabled={!canNext || isLoading}
            >
              {isLoading && <LoaderCircle className="animate-spin" aria-hidden />}
              {resolvedNextLabel}
              {!isLoading && !isLastStep && <ArrowRight aria-hidden />}
              {!isLoading && isLastStep && <Check aria-hidden />}
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Paper error note shown at the top of a wizard step. */
export function WizardError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-md border border-bad/30 bg-bad-soft px-3.5 py-3 text-[13px] leading-[1.5] text-ink motion-safe:animate-paper-rise"
    >
      <AlertCircle className="mt-px h-4 w-4 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
