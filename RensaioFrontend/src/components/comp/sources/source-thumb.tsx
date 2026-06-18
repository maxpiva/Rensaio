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
 * Used to pick a stable gradient class for the fallback placeholder.
 */
function hashPackage(pkg: string): number {
  let h = 0;
  for (let i = 0; i < pkg.length; i++) {
    h = (Math.imul(31, h) + pkg.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 12;
}

const FALLBACK_SRC = '/kaizoku.net.png';

export function SourceThumb({ extension, size }: SourceThumbProps) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = formatThumbnailUrl(extension.thumbnailUrl);
  const isFallback = thumbnailUrl === FALLBACK_SRC;
  const showGradient = isFallback || imageError;

  const px = size === 'sm' ? 44 : 48;
  const fontSize = size === 'sm' ? '17px' : '19px';
  const gradientClass = `src-g-${hashPackage(extension.package)}`;
  const letter = (extension.name?.[0] ?? '?').toUpperCase();

  return (
    <div
      className={`src-thumb ${showGradient ? gradientClass : ''}`}
      style={{ width: px, height: px, flexShrink: 0 }}
    >
      {showGradient ? (
        <span className="src-thumb-letter" style={{ fontSize }}>
          {letter}
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
