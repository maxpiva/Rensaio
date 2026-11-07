"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Paper editorial page header ("masthead").
 *
 *   01 ── LIBRARY                                   [actions…]  │書
 *   Your shelf, *in print.*                                      │庫
 *   Deck text, up to ~62ch.                                      [連]
 *   32 SERIES · 4 UPDATING · …   (mono meta)
 *   ════════════════════════════════════════════  (double rule)
 *
 * Usage:
 *   <PageHeader
 *     folio="01"
 *     eyebrow="Library"
 *     title="Your shelf,"
 *     accent="in print."
 *     description="Everything you follow, newest chapter first."
 *     meta={[`${total} series`, `${updating} updating`]}
 *     actions={<AddSeries />}
 *     tate="書庫"
 *   />
 *
 * - `title` is the serif display line. `accent` is appended in italic
 *   crimson (`accent-ink`); or put an `<em>` inside `title` yourself.
 * - `meta` accepts one node or an array (rendered mono, dot-separated).
 * - `actions` sit bottom-right on desktop and wrap under the title on phone.
 * - `tate` is optional vertical Japanese text with a hanko seal (desktop only,
 *   decorative, aria-hidden).
 * - `children` render under the header row, inside the rule (tabs, filters).
 * - `size="md"` is a smaller title for dense or nested pages.
 */
export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Mono eyebrow / kicker, e.g. "Library". */
  eyebrow?: React.ReactNode;
  /** Short crimson folio number before the eyebrow, e.g. "01". */
  folio?: React.ReactNode;
  /** Serif display title. */
  title: React.ReactNode;
  /** Italic crimson word(s) appended to the title. */
  accent?: React.ReactNode;
  /** Deck / lede paragraph under the title. */
  description?: React.ReactNode;
  /** Mono meta line: counts, paths, timestamps. */
  meta?: React.ReactNode | React.ReactNode[];
  /** Right-aligned actions (buttons). */
  actions?: React.ReactNode;
  /** Decorative vertical Japanese text (desktop only). */
  tate?: string;
  /** Title scale. Default "lg". */
  size?: "lg" | "md";
  /** Heading element for the title. Default "h1". */
  as?: "h1" | "h2";
  /** Animate in on mount (rise + fade). Default true. */
  animate?: boolean;
}

export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  (
    {
      eyebrow,
      folio,
      title,
      accent,
      description,
      meta,
      actions,
      tate,
      size = "lg",
      as: Heading = "h1",
      animate = true,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const metaItems = (Array.isArray(meta) ? meta : meta != null ? [meta] : []).filter(
      (m) => m !== null && m !== undefined && m !== false && m !== "",
    );

    return (
      <header
        ref={ref}
        className={cn(
          "relative mb-4 border-b-[3px] border-double border-rule-3 pb-3.5 pt-1 sm:mb-[22px] sm:pb-4",
          animate && "motion-safe:animate-paper-rise",
          className,
        )}
        {...props}
      >
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
          <div className="min-w-0">
            {(!!eyebrow || !!folio) && (
              <div className="mb-[9px] flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-ink-3 sm:mb-3">
                {folio ? <b className="font-bold text-accent-ink">{folio}</b> : null}
                {folio && eyebrow ? <i aria-hidden="true" className="h-px w-[22px] bg-rule-2" /> : null}
                {eyebrow ? <span className="min-w-0 truncate">{eyebrow}</span> : null}
              </div>
            )}
            <Heading
              className={cn(
                "font-serif font-normal text-ink [font-optical-sizing:auto] text-balance",
                size === "lg"
                  ? "text-[36px] leading-[0.98] tracking-[-0.03em] sm:text-[42px] xl:text-[50px]"
                  : "text-[28px] leading-[1.02] tracking-[-0.025em] sm:text-[32px]",
                "[&_em]:italic [&_em]:text-accent-ink",
              )}
            >
              {title}
              {accent ? (
                <>
                  {" "}
                  <em className="italic text-accent-ink">{accent}</em>
                </>
              ) : null}
            </Heading>
            {description ? (
              <p className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.55] text-ink-2 sm:mt-3 sm:text-sm">
                {description}
              </p>
            ) : null}
            {metaItems.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3 sm:text-xs">
                {metaItems.map((m, i) => (
                  <React.Fragment key={i}>
                    {i > 0 ? (
                      <span aria-hidden="true" className="text-rule-2">
                        ·
                      </span>
                    ) : null}
                    <span className="tabular-nums">{m}</span>
                  </React.Fragment>
                ))}
              </div>
            ) : null}
          </div>

          {(!!actions || !!tate) && (
            <div className="flex items-end gap-4 md:justify-end">
              {actions ? (
                <div className="flex flex-wrap items-center gap-2 pb-0.5 md:justify-end">
                  {actions}
                </div>
              ) : null}
              {tate ? (
                <div
                  aria-hidden="true"
                  className="hidden min-h-[76px] items-center gap-2.5 border-l border-rule-2 pl-3 pt-0.5 font-jp text-[17px] font-medium leading-none tracking-[0.32em] text-ink-2 [writing-mode:vertical-rl] lg:flex"
                >
                  {tate}
                  <span className="grid h-6 w-6 rotate-3 place-items-center rounded-[3px] bg-primary font-jp text-[13px] font-bold tracking-normal text-primary-foreground shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.3)] [writing-mode:horizontal-tb]">
                    連
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
      </header>
    );
  },
);
PageHeader.displayName = "PageHeader";

/**
 * Serif section heading with a mono count and a trailing hairline:
 *   Reading now  12 ───────────────
 */
export function SectionHeading({
  title,
  count,
  actions,
  className,
  as: Heading = "h2",
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-3", className)}>
      <Heading className="font-serif text-[22px] font-normal leading-none tracking-[-0.02em] text-ink sm:text-2xl">
        {title}
      </Heading>
      {count !== undefined && count !== null ? (
        <span className="font-mono text-[11px] font-medium tabular-nums text-ink-3">{count}</span>
      ) : null}
      <span aria-hidden="true" className="h-px flex-1 bg-rule" />
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
