'use client';

import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Paper dialog heading for the user dialogs: an inked icon tile, a mono
 * eyebrow and a serif title whose subject (the username) is set in italic.
 */
export function UsersDialogHeading({
  icon: Icon,
  action,
  subject,
  description,
  tone = 'default',
}: {
  icon: LucideIcon;
  /** Leading words of the title, e.g. "Edit User:". */
  action: string;
  /** Italic subject, usually the username. */
  subject?: string;
  description: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <DialogHeader className="flex-row items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
          tone === 'danger'
            ? 'border-bad/30 bg-bad-soft text-bad'
            : 'border-rule bg-paper-2 text-ink-2',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="paper-eyebrow">Users</p>
        <DialogTitle className="break-words">
          {action}
          {subject ? (
            <>
              {' '}
              <em className="font-serif italic">{subject}</em>
            </>
          ) : null}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </div>
    </DialogHeader>
  );
}

/** Inline error callout used inside the user dialogs and forms. */
export function UsersErrorNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-bad/25 bg-bad-soft p-3 text-sm text-bad',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Mono uppercase field label, matching the Paper form style. */
export const usersFieldLabel = 'font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3';
