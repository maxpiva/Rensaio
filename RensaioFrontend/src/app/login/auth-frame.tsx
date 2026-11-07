'use client';

import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

import { BrandSeal, BrandWordmark } from '@/components/comp/layout/brand';
import { cn } from '@/lib/utils';

/**
 * Paper auth frame shared by /login, /user-select and /auth/set-password.
 *
 * Desktop: a two-column spread. The left page is the masthead, a stack of
 * screentone "print plates" with the vertical 連載王 imprint, and a serif
 * tag-line; the right page holds the form, centred.
 * Phone: the left page collapses into a short masthead strip above the form.
 * Both fill the viewport height.
 */
export function AuthFrame({
  tagline,
  children,
}: {
  /** Serif line under the plates. An <em> renders italic crimson. */
  tagline?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-paper text-ink lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:grid-rows-1">
      <aside className="paper-grain relative flex flex-col overflow-hidden border-b border-rule bg-paper-2 px-5 pb-[18px] pt-4 lg:border-b-0 lg:border-r lg:px-12 lg:py-11">
        <div className="relative flex items-center gap-3 rule-double-b pb-3 lg:pb-4">
          <BrandSeal className="lg:h-9 lg:w-9 lg:text-[20px]" />
          <BrandWordmark className="text-[24px] lg:text-[30px]" />
          <p className="ml-auto text-right font-mono text-[9.5px] font-medium uppercase leading-[1.5] tracking-[0.14em] text-ink-3 lg:text-[10px]">
            連載 · Series desk
            <br className="hidden sm:block" />
            <span className="hidden sm:inline">Self-hosted edition</span>
          </p>
        </div>

        <PrintPlates />

        <p className="relative mt-3 max-w-[22ch] font-serif text-[21px] leading-[1.15] tracking-[-0.02em] lg:mt-0 lg:text-[30px] [&_em]:italic [&_em]:text-accent-ink">
          {tagline ?? (
            <>
              Every chapter, <em>pressed</em> the moment it drops.
            </>
          )}
        </p>
        <p className="relative mt-3.5 hidden font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-3 lg:block">
          Rensaiō · self-hosted manga library
        </p>
      </aside>

      <main className="flex items-start justify-center overflow-auto px-5 pb-10 pt-[22px] sm:items-center sm:px-10 sm:py-10">
        {children}
      </main>
    </div>
  );
}

/* Decorative collage: offset, rotated plates with manga screentone fills.
   Hidden from assistive tech and on small screens. */
const PLATES: {
  x: string;
  y: string;
  w: number;
  r: number;
  tone: 'ink' | 'accent' | 'paper' | 'warm';
  label: string;
}[] = [
  { x: '4%', y: '2%', w: 150, r: -6, tone: 'ink', label: 'No. 01' },
  { x: '36%', y: '14%', w: 126, r: 5, tone: 'accent', label: 'No. 12' },
  { x: '0%', y: '50%', w: 114, r: 4, tone: 'warm', label: 'No. 07' },
  { x: '30%', y: '46%', w: 138, r: -3, tone: 'paper', label: 'No. 24' },
  { x: '60%', y: '38%', w: 106, r: 8, tone: 'ink', label: 'No. 31' },
];

const TONE: Record<(typeof PLATES)[number]['tone'], string> = {
  ink: 'bg-ink text-paper [--dot:color-mix(in_oklab,var(--paper)_22%,transparent)]',
  accent:
    'bg-primary text-primary-foreground [--dot:color-mix(in_oklab,white_26%,transparent)]',
  warm: 'bg-warn-soft text-ink [--dot:color-mix(in_oklab,var(--warn)_45%,transparent)]',
  paper: 'bg-paper-1 text-ink [--dot:color-mix(in_oklab,var(--ink)_20%,transparent)]',
};

function PrintPlates() {
  return (
    <div aria-hidden="true" className="relative my-[26px] mb-[22px] hidden min-h-[300px] flex-1 lg:block">
      {PLATES.map((p, i) => (
        <div
          key={i}
          className="absolute motion-safe:animate-paper-rise"
          style={{
            left: p.x,
            top: p.y,
            width: p.w,
            transform: `rotate(${p.r}deg)`,
            animationDelay: `${120 + i * 70}ms`,
          }}
        >
          <div
            className={cn(
              'relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-[3px] p-2.5 shadow-print ring-1 ring-rule-2',
              TONE[p.tone],
            )}
          >
            {/* screentone */}
            <span
              className="pointer-events-none absolute inset-0 opacity-90"
              style={{
                backgroundImage: 'radial-gradient(var(--dot) 1.1px, transparent 1.4px)',
                backgroundSize: '6px 6px',
                maskImage: 'linear-gradient(160deg, transparent 18%, black 72%)',
                WebkitMaskImage: 'linear-gradient(160deg, transparent 18%, black 72%)',
              }}
            />
            <span className="relative font-mono text-[9px] font-semibold uppercase tracking-[0.18em] opacity-80">
              {p.label}
            </span>
            <span className="relative block h-[3px] w-1/2 bg-current opacity-60" />
          </div>
        </div>
      ))}
      <div className="absolute right-0 top-0 font-jp text-[66px] font-semibold leading-none tracking-[0.12em] text-ink opacity-90 [writing-mode:vertical-rl]">
        連載王
      </div>
    </div>
  );
}

/** Folio + serif display heading + deck, the top of every auth form. */
export function AuthHeading({
  folio = '01',
  eyebrow,
  title,
  description,
  id,
}: {
  folio?: string;
  eyebrow: string;
  /** Display heading. An <em> renders italic crimson. */
  title: ReactNode;
  description?: ReactNode;
  id?: string;
}) {
  return (
    <header className="mb-[26px]">
      <div className="mb-3 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-ink-3">
        <b className="font-bold text-accent-ink">{folio}</b>
        <i aria-hidden="true" className="h-px w-[22px] bg-rule-2" />
        {eyebrow}
      </div>
      <h1
        id={id}
        className="paper-display text-[34px] leading-[0.98] text-ink sm:text-[42px] [&_em]:italic [&_em]:text-accent-ink"
      >
        {title}
      </h1>
      {description && (
        <p className="mt-2.5 max-w-[62ch] text-[14px] leading-[1.55] text-ink-2">{description}</p>
      )}
    </header>
  );
}

/** Inline alert note (failed login, invalid link, validation). */
export function AuthNote({
  children,
  tone = 'bad',
  className,
}: {
  children: ReactNode;
  tone?: 'bad' | 'info';
  className?: string;
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-[13px] leading-[1.5] motion-safe:animate-paper-rise',
        tone === 'bad'
          ? 'border-bad/30 bg-bad-soft text-ink'
          : 'border-info/30 bg-info-soft text-ink',
        className,
      )}
    >
      <AlertCircle
        aria-hidden="true"
        className={cn('mt-px h-4 w-4 shrink-0', tone === 'bad' ? 'text-bad' : 'text-info')}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** "or" divider between the password form and single sign-on. */
export function OrRule() {
  return (
    <div className="my-[18px] flex items-center gap-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3 before:h-px before:flex-1 before:bg-rule-2 after:h-px after:flex-1 after:bg-rule-2">
      or
    </div>
  );
}
