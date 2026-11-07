"use client";

import React, { useState } from 'react';
import { LazyImage } from "@/components/ui/lazy-image";
import { type Provider } from "@/lib/api/types";
import { formatThumbnailUrl } from "./lib";

interface SourceThumbProps {
  extension: Provider;
  /** 'sm' = 44px (mobile), 'md' = 48px (desktop) */
  size: 'sm' | 'md';
}

/**
 * Deterministic hash of a package name string → integer 0–11.
 * Used to pick a stable ink colour for the fallback monogram.
 */
function hashPackage(pkg: string): number {
  let h = 0;
  for (let i = 0; i < pkg.length; i++) {
    h = (Math.imul(31, h) + pkg.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 12;
}

const FALLBACK_SRC = '/rensaio.png';

/** Paper monogram inks: muted, print-like, legible with white text. */
const MONOGRAM_INKS = [
  'hsl(350 62% 42%)', 'hsl(22 70% 42%)', 'hsl(265 42% 46%)', 'hsl(200 60% 36%)',
  'hsl(160 52% 30%)', 'hsl(215 22% 38%)', 'hsl(38 64% 36%)', 'hsl(330 44% 42%)',
  'hsl(185 48% 32%)', 'hsl(0 0% 28%)', 'hsl(240 30% 44%)', 'hsl(95 34% 32%)',
];

/** Two-letter monogram from the source name ("Asura Scans" → "AS"). */
function monogram(name: string | undefined): string {
  const words = (name ?? '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function SourceThumb({ extension, size }: SourceThumbProps) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = formatThumbnailUrl(extension.thumbnailUrl);
  const isFallback = thumbnailUrl === FALLBACK_SRC;
  const showGradient = isFallback || imageError;

  const px = size === 'sm' ? 40 : 44;

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-md border border-rule bg-paper-2"
      style={{
        width: px,
        height: px,
        ...(showGradient ? { background: MONOGRAM_INKS[hashPackage(extension.package)] } : {}),
      }}
    >
      {showGradient ? (
        <span
          className="absolute inset-0 flex items-center justify-center font-mono text-[12.5px] font-bold tracking-wide text-white"
          aria-hidden="true"
        >
          {monogram(extension.name)}
        </span>
      ) : (
        <LazyImage
          src={thumbnailUrl}
          alt={`${extension.name} icon`}
          className="absolute inset-0 h-full w-full object-cover"
          fallbackSrc={FALLBACK_SRC}
          loading="lazy"
          onError={() => setImageError(true)}
        />
      )}
    </div>
  );
}
