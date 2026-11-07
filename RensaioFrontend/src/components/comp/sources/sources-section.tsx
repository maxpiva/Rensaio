"use client";

import React, { useId } from 'react';
import { ArrowRight } from "lucide-react";

interface SourcesSectionProps {
  title: string;
  count: number;
  showAllLabel?: string;
  onShowAll?: () => void;
  children: React.ReactNode;
  id?: string;
}

export function SourcesSection({
  title,
  count,
  showAllLabel,
  onShowAll,
  children,
  id,
}: SourcesSectionProps) {
  const generatedId = useId();
  const headingId = id ? `${id}-heading` : `${generatedId}-heading`;

  return (
    <section id={id} aria-labelledby={headingId} className="space-y-0">
      {/* Section header: serif title, mono count, trailing hairline */}
      <div className="flex items-center gap-3 pb-3">
        <h2
          id={headingId}
          className="flex items-baseline gap-2 font-serif text-[21px] leading-none tracking-[-0.01em] text-ink md:text-[23px]"
        >
          {title}
          <span className="font-mono text-[11.5px] tracking-normal text-ink-3">{count}</span>
        </h2>
        <span aria-hidden className="h-px flex-1 bg-rule" />
      </div>

      {/* Hairline-ruled list panel */}
      <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-paper">
        {children}

        {/* Optional "Show all" footer */}
        {onShowAll && showAllLabel && (
          <button
            className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-rule bg-paper-1 text-[13px] font-semibold text-accent-ink transition-colors hover:bg-hover outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
            onClick={onShowAll}
            type="button"
          >
            {showAllLabel}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
