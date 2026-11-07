"use client";

import React from 'react';
import { AlertTriangle, CheckCircle2, Octagon } from 'lucide-react';
import { HealthStatusLevel } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface AlertBadgeProps {
  level: HealthStatusLevel;
  className?: string;
}

const LEVEL_META = {
  [HealthStatusLevel.Green]: { label: 'Healthy', Icon: CheckCircle2, text: 'text-ok', tag: 'bg-ok-soft text-ok' },
  [HealthStatusLevel.Yellow]: { label: 'Warning', Icon: AlertTriangle, text: 'text-warn', tag: 'bg-warn-soft text-warn' },
  [HealthStatusLevel.Red]: { label: 'Critical', Icon: Octagon, text: 'text-bad', tag: 'bg-bad-soft text-bad' },
} as const;

/** Icon-only level marker. Carries an accessible name so it never relies on colour. */
export function AlertBadge({ level, className = "" }: AlertBadgeProps) {
  const { label, Icon, text } = LEVEL_META[level] ?? LEVEL_META[HealthStatusLevel.Red];
  return <Icon role="img" aria-label={label} className={cn('h-3.5 w-3.5 shrink-0', text, className)} />;
}

/** Icon + label status tag. */
export function AlertBadgeWithLabel({ level, className }: { level: HealthStatusLevel; className?: string }) {
  const { label, Icon, tag } = LEVEL_META[level] ?? LEVEL_META[HealthStatusLevel.Red];
  return (
    <span
      className={cn(
        'inline-flex h-[22px] flex-none items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 text-[11.5px] font-semibold leading-none',
        tag,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
