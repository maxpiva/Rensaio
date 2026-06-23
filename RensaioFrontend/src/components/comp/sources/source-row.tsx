"use client";

import React from 'react';
import ReactCountryFlag from "react-country-flag";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type Provider } from "@/lib/api/types";
import {
  getPrimaryLanguage,
  getExtensionLanguages,
  getExtensionVersion,
  isExtensionNsfw,
} from "./lib";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { SourceThumb } from "./source-thumb";
import { RowActionsInstalled } from "./row-actions-installed";
import { RowActionsAvailable } from "./row-actions-available";

interface SourceRowProps {
  extension: Provider;
  mode: 'installed' | 'available';
  onInstall?: (pkgName: string) => void;
  onUninstall?: (pkgName: string) => void;
  isLoading?: boolean;
  showNsfwIndicator?: boolean;
}

function formatLanguageMeta(extension: Provider): string {
  const langs = getExtensionLanguages(extension);
  const version = getExtensionVersion(extension);
  const versionStr = version ? `v${version}` : '';

  let langStr = '';
  if (langs.length === 0) {
    langStr = '';
  } else if (langs.length === 1) {
    langStr = langs[0] ?? '';
  } else if (langs.length <= 3) {
    langStr = langs.join(', ');
  } else {
    langStr = `Multi (${langs.length})`;
  }

  if (versionStr && langStr) return `${versionStr} · ${langStr}`;
  if (versionStr) return versionStr;
  return langStr;
}

export function SourceRow({
  extension,
  mode,
  onInstall,
  onUninstall,
  isLoading = false,
  showNsfwIndicator = true,
}: SourceRowProps) {
  const primaryLanguage = getPrimaryLanguage(extension);
  const countryCode = getCountryCodeForLanguage(primaryLanguage);
  const isNsfw = showNsfwIndicator && isExtensionNsfw(extension);
  const meta = formatLanguageMeta(extension);

  const isFailing =
    mode === 'installed' &&
    (extension.isBroken || extension.isDead);

  const rowContent = (
    <div
      className={`src-row${isFailing ? ' is-failing' : ''}`}
    >
      {/* Thumbnail — responsive size via CSS classes on wrapper */}
      <div className="md:hidden">
        <SourceThumb extension={extension} size="sm" />
      </div>
      <div className="hidden md:block">
        <SourceThumb extension={extension} size="md" />
      </div>

      {/* Middle: name + meta */}
      <div className="flex-1 min-w-0">
        {/* Line 1: name + flag + badges */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {isFailing && <span className="dot-fail" aria-hidden="true" />}
          <span className="font-semibold text-[14px] md:text-[15px] truncate text-foreground">
            {extension.name}
          </span>
          <ReactCountryFlag
            countryCode={countryCode}
            svg
            style={{ width: '16px', height: '12px', flexShrink: 0 }}
            title={`${primaryLanguage.toUpperCase()} (${countryCode})`}
          />
          {isNsfw && <span className="nsfw-pill">18+</span>}
        </div>

        {/* Line 2: version · languages (muted) */}
        {meta && (
          <div className="text-[12px] md:text-[13px] text-muted-foreground truncate mt-0.5">
            {meta}
          </div>
        )}
      </div>

      {/* Right: action area */}
      <div className="flex items-center gap-1.5 shrink-0">
        {mode === 'installed' && onUninstall ? (
          <RowActionsInstalled
            extension={extension}
            onUninstall={onUninstall}
            isLoading={isLoading}
          />
        ) : mode === 'available' && onInstall ? (
          <RowActionsAvailable
            extension={extension}
            onInstall={onInstall}
            isLoading={isLoading}
          />
        ) : null}
      </div>
    </div>
  );

  // Wrap failing installed rows in a Tooltip to expose the error message
  if (isFailing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {rowContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Source is broken or unreachable
        </TooltipContent>
      </Tooltip>
    );
  }

  return rowContent;
}
