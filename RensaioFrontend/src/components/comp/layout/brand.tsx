"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Rensaiō brand: a slightly rotated crimson hanko seal (連, "serial") and the
 * serif wordmark with a crimson ō.
 */
export function BrandSeal({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-[30px] w-[30px] shrink-0 -rotate-[4deg] place-items-center rounded-[4px] bg-primary font-jp text-[17px] font-bold leading-none text-primary-foreground",
        "shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.28),inset_0_0_0_3px_hsl(var(--primary))]",
        className,
      )}
    >
      連
    </span>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-serif text-[22px] font-medium leading-none tracking-[-0.02em] text-ink",
        className,
      )}
    >
      Rensai<span className="text-accent-ink">ō</span>
    </span>
  );
}

/** Sidebar / phone top-bar brand link to the library. */
export function Brand({
  compact = false,
  className,
}: {
  /** Phone top bar: smaller seal and wordmark, no sub-line. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/library"
      aria-label="Rensaiō home"
      className={cn(
        "flex min-w-0 items-center gap-[11px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <BrandSeal className={compact ? "h-[26px] w-[26px] text-[15px]" : undefined} />
      <span className="flex min-w-0 flex-col gap-1">
        <BrandWordmark className={compact ? "text-[20px]" : undefined} />
        {!compact && (
          <span className="font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.16em] text-ink-3">
            連載 · Series desk
          </span>
        )}
      </span>
    </Link>
  );
}
