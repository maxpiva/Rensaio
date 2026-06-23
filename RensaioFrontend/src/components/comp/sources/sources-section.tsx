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
      {/* Section header */}
      <div className="flex items-center justify-between pb-2.5 pt-0">
        <h2 id={headingId} className="flex items-center gap-2.5 text-[17px] md:text-[18px] font-bold tracking-tight text-foreground">
          {title}
          <span
            className="text-[12px] font-semibold px-2 py-0.5 rounded-full border"
            style={{
              background: 'hsla(0 0% 100% / 0.05)',
              borderColor: 'hsla(0 0% 100% / 0.06)',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            {count}
          </span>
        </h2>
      </div>

      {/* Bordered list card */}
      <div className="src-list">
        {children}

        {/* Optional "Show all" footer */}
        {onShowAll && showAllLabel && (
          <button
            className="src-show-all"
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
