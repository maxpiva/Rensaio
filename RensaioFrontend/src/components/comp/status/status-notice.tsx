"use client";

import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Paper empty / error block used by the status panels. */
export function StatusNotice({
  tone = 'ok',
  title,
  body,
  action,
}: {
  tone?: 'ok' | 'bad';
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = tone === 'bad' ? AlertTriangle : CheckCircle2;
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className="flex flex-col items-center rounded-lg border border-dashed border-rule-2 bg-paper-1/60 px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mb-4 grid h-12 w-12 place-items-center rounded-full border',
          tone === 'bad' ? 'border-bad/30 bg-bad-soft text-bad' : 'border-ok/30 bg-ok-soft text-ok',
        )}
      >
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-serif text-[20px] leading-tight text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
