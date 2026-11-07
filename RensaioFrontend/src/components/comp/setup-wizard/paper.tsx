"use client";

import React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Small Paper building blocks shared by the setup + import wizard steps.
 * Local to the wizard on purpose (the shared ui/* primitives are owned by the
 * foundation); they only compose foundation tokens.
 */

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent";

const NOTE_TONE: Record<Tone, string> = {
  neutral: "border-rule-2 bg-paper-2 [&>svg]:text-ink-2",
  ok: "border-ok/30 bg-ok-soft [&>svg]:text-ok",
  warn: "border-warn/35 bg-warn-soft [&>svg]:text-warn",
  bad: "border-bad/35 bg-bad-soft [&>svg]:text-bad",
  info: "border-info/30 bg-info-soft [&>svg]:text-info",
  accent: "border-accent-line bg-accent-soft [&>svg]:text-accent-ink",
};

const NOTE_ICON: Record<Tone, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  neutral: Info,
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: AlertCircle,
  info: Info,
  accent: Info,
};

/** Inline callout. Bold text inside reads in full ink. */
export function PaperNote({
  tone = "neutral",
  icon,
  role,
  className,
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  role?: "alert" | "status";
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = NOTE_ICON[tone];
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-3 rounded-md border px-3.5 py-3 text-[13px] leading-[1.55] text-ink-2 [&_b]:font-semibold [&_b]:text-ink [&_strong]:font-semibold [&_strong]:text-ink [&>svg]:mt-0.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
        NOTE_TONE[tone],
        className,
      )}
    >
      {icon ?? <Icon aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const TAG_TONE: Record<Tone, string> = {
  neutral: "border-rule-2 text-ink-2",
  ok: "border-ok/30 bg-ok-soft text-ok",
  warn: "border-warn/30 bg-warn-soft text-warn",
  bad: "border-bad/30 bg-bad-soft text-bad",
  info: "border-info/30 bg-info-soft text-info",
  accent: "border-accent-line bg-accent-soft text-accent-ink",
};

/** 22px status tag ("Done", "3 matches", "Not matched"). */
export function PaperTag({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[4px] border px-[7px] text-[11.5px] font-semibold leading-none [&_svg]:h-3 [&_svg]:w-3 [&_svg]:stroke-2",
        TAG_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Thin progress bar (crimson fill). */
export function PaperBar({
  value,
  size = "md",
  tone = "accent",
  className,
  label,
}: {
  value: number;
  size?: "md" | "lg";
  tone?: "accent" | "ok" | "bad" | "ink";
  className?: string;
  /** Accessible name; omit to hide the bar from assistive tech. */
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[2px] bg-paper-3",
        size === "lg" ? "h-1.5" : "h-1",
        className,
      )}
      {...(label
        ? { role: "progressbar", "aria-label": label, "aria-valuenow": Math.round(pct), "aria-valuemin": 0, "aria-valuemax": 100 }
        : { "aria-hidden": true })}
    >
      <i
        className={cn(
          "block h-full transition-[width] duration-500 ease-out",
          tone === "accent" && "bg-primary",
          tone === "ok" && "bg-ok",
          tone === "bad" && "bg-bad",
          tone === "ink" && "bg-ink-2",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Raised paper panel. */
export function PaperPanel({
  className,
  children,
  as: As = "div",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "ul" | "ol" }) {
  return (
    <As
      className={cn("rounded-md border border-rule bg-paper-1 shadow-paper", className)}
      {...rest}
    >
      {children}
    </As>
  );
}

/** Small serif section label used inside steps. */
export function StepLabel({
  as: As = "h3",
  className,
  children,
}: {
  as?: "h2" | "h3" | "h4";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <As className={cn("paper-eyebrow mb-2.5 block text-ink-2", className)}>{children}</As>
  );
}

/** Intro paragraph at the top of a step. */
export function StepIntro({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("max-w-[68ch] text-[13.5px] leading-[1.55] text-ink-2", className)}>{children}</p>
  );
}
