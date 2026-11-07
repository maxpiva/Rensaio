"use client";

import React, { useState, useCallback } from 'react';
import ReactCountryFlag from "react-country-flag";
import { Wrench, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
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
  isActiveEntryLocal,
  getEntryCount,
} from "./lib";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { SourceThumb } from "./source-thumb";
import { RowActionsInstalled } from "./row-actions-installed";
import { RowActionsAvailable } from "./row-actions-available";
import { VersionSelectorDialog } from "./version-selector-dialog";
import { providerService } from "@/lib/api/services/providerService";
import { useToast } from "@/hooks/use-toast";

interface SourceRowProps {
  extension: Provider;
  mode: 'installed' | 'available';
  onInstall?: (pkgName: string) => void;
  onUninstall?: (pkgName: string) => void;
  isLoading?: boolean;
  showNsfwIndicator?: boolean;
  /** Called after a version switch completes so the parent can refresh its list */
  onVersionChanged?: () => void;
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
  onVersionChanged,
}: SourceRowProps) {
  const { toast } = useToast();
  const primaryLanguage = getPrimaryLanguage(extension);
  const countryCode = getCountryCodeForLanguage(primaryLanguage);
  const isNsfw = showNsfwIndicator && isExtensionNsfw(extension);
  const meta = formatLanguageMeta(extension);
  const isFailing =
    mode === 'installed' &&
    (extension.isBroken || extension.isDead);

  // -- Version selector state --
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionSubmitting, setVersionSubmitting] = useState(false);

  const isLocalEntry = mode === 'installed' && isActiveEntryLocal(extension);
  const entryCount = mode === 'installed' ? getEntryCount(extension) : 0;
  const showWrench = mode === 'installed' && entryCount > 1;

  const handleVersionConfirm = useCallback(async (version: string, autoUpdate: boolean) => {
    setVersionSubmitting(true);
    try {
      await providerService.setProviderVersion(extension.package, version, autoUpdate);
      toast({ title: `Version set to v${version}`, variant: 'success' });
      setVersionDialogOpen(false);
      onVersionChanged?.();
    } catch (err) {
      console.error('Failed to set version:', err);
      toast({ title: 'Failed to set version', variant: 'destructive' });
    } finally {
      setVersionSubmitting(false);
    }
  }, [extension.package, onVersionChanged, toast]);

  const rowContent = (
    <div
      className={cn(
        "relative flex items-center gap-3 border-b border-rule px-3 py-2.5 transition-colors last:border-b-0 hover:bg-hover md:gap-4 md:px-4 md:py-3",
        isFailing &&
          "bg-bad-soft/50 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-bad",
      )}
    >
      {/* Thumbnail — responsive size via wrapper visibility */}
      <div className="md:hidden">
        <SourceThumb extension={extension} size="sm" />
      </div>
      <div className="hidden md:block">
        <SourceThumb extension={extension} size="md" />
      </div>

      {/* Middle: name + meta */}
      <div className="min-w-0 flex-1">
        {/* Line 1: name + flag + badges */}
        <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
          <span className="truncate text-[14px] font-semibold text-ink md:text-[14.5px]">
            {extension.name}
          </span>
          <ReactCountryFlag
            countryCode={countryCode}
            svg
            style={{ width: '16px', height: '12px', flexShrink: 0, borderRadius: 2 }}
            title={`${primaryLanguage.toUpperCase()} (${countryCode})`}
          />
          {isNsfw && (
            <span className="shrink-0 rounded-[3px] border border-bad/35 px-1 py-px font-mono text-[10px] font-semibold leading-none text-bad">
              18+
            </span>
          )}
          {isFailing && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-bad-soft px-1.5 py-0.5 text-[11px] font-semibold leading-none text-bad">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Failing
            </span>
          )}
        </div>

        {/* Line 2: version · languages (mono) + Local badge + wrench */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {meta ? (
            <span className="truncate font-mono text-[11.5px] text-ink-3 md:text-[12px]">
              {meta}
            </span>
          ) : null}
          {isLocalEntry && (
            <span className="shrink-0 whitespace-nowrap rounded-[4px] bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold leading-none text-warn">
              Local
            </span>
          )}
          {showWrench && (
            <button
              className="-my-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40 max-sm:-my-3 max-sm:h-11 max-sm:w-11"
              onClick={() => setVersionDialogOpen(true)}
              aria-label={`Select version for ${extension.name}`}
            >
              <Wrench className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Right: action area */}
      <div className="flex shrink-0 items-center gap-1.5">
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

  return (
    <>
      {/* Wrap failing installed rows in a Tooltip to expose the error message */}
      {isFailing ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {rowContent}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            Source is broken or unreachable
          </TooltipContent>
        </Tooltip>
      ) : (
        rowContent
      )}

      {/* Version selector dialog */}
      {mode === 'installed' && (
        <VersionSelectorDialog
          extension={extension}
          open={versionDialogOpen}
          onOpenChange={setVersionDialogOpen}
          onConfirm={handleVersionConfirm}
          isSubmitting={versionSubmitting}
        />
      )}
    </>
  );
}
