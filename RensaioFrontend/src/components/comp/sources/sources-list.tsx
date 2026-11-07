"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { type Provider, NsfwVisibility } from "@/lib/api/types";
import { type MultiSelectOption } from "@/components/ui/multi-select";
import { Input } from "@/components/ui/input";
import { providerService } from "@/lib/api/services/providerService";
import { useSettings } from "@/lib/api/hooks/useSettings";
import { useContributionUpload } from "@/lib/api/hooks/useContributionUpload";
import { useToast } from "@/hooks/use-toast";
import { useContributionEnabled } from "@/hooks/use-contribution-enabled";
import { ProviderPreferencesRequester } from "@/components/comp/provider-preferences-requester";
import {
  getExtensionLanguages,
  isExtensionNsfw,
} from "./lib";
import { SourcesToolbar, type SortOption } from "./sources-toolbar";
import { SourcesSection } from "./sources-section";
import { SourceRow } from "./source-row";

/** Number of rows visible before "Show all" is displayed */
const INITIAL_LIMIT = 24;

interface SourcesListProps {
  /** Search term driven by the global command-bar search (useSearch context). Optional in embedded mode. */
  searchTerm?: string;
  /** Clears the global search term — called after install/uninstall and from the empty state. */
  clearSearch?: () => void;
  /**
   * Embedded/wizard mode. There is no global command bar inside dialogs, so the
   * list renders its own search field and an optional description, and emits
   * lifecycle callbacks so a host (e.g. the setup wizard) can gate progress.
   */
  embedded?: boolean;
  /** Optional description rendered above the search field in embedded mode. */
  description?: React.ReactNode;
  /** Fires whenever the loaded provider set changes (e.g. after install/uninstall). */
  onExtensionsChange?: (extensions: Provider[]) => void;
  /** Fires on load/install errors (null clears). */
  onError?: (error: string | null) => void;
  /** Fires when the initial load starts/finishes. */
  onLoadingChange?: (loading: boolean) => void;
}

export function SourcesList({
  searchTerm,
  clearSearch,
  embedded = false,
  description,
  onExtensionsChange,
  onError,
  onLoadingChange,
}: SourcesListProps) {
  // ── Embedded search (no global command bar inside dialogs) ───────────────────
  const [internalSearch, setInternalSearch] = useState('');
  const effectiveSearchTerm = embedded ? internalSearch : (searchTerm ?? '');
  const doClearSearch = embedded ? () => setInternalSearch('') : clearSearch;
  // ── Data state ──────────────────────────────────────────────────────────────
  const [extensions, setExtensions] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Action loading state ─────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isUploadingApk, setIsUploadingApk] = useState(false);

  // ── Preferences dialog ───────────────────────────────────────────────────────
  const [showPreferencesFor, setShowPreferencesFor] = useState<{
    pkgName: string;
    name: string;
  } | null>(null);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [hideNsfw, setHideNsfw] = useState(true);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>('name-asc');

  // ── "Show all" expansion ─────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<{ installed: boolean; available: boolean }>({
    installed: false,
    available: false,
  });

  // ── Toast notifications ──────────────────────────────────────────────────────
  const { toast } = useToast();

  // ── NSFW visibility from settings ────────────────────────────────────────────
  const { data: settings } = useSettings();
  const nsfwVisibility = settings?.nsfwVisibility ?? NsfwVisibility.HideByDefault;

  // ── Contribution export to cloud ────────────────────────────────────────────
  const contributionUpload = useContributionUpload();

  // Only offered when contributions are enabled, the Contributor Id is configured,
  // AND that Id has been verified against the contribution database.
  const contributionAvailable = useContributionEnabled();

  // Fire-and-forget: enqueue the upload and confirm immediately. The export
  // runs in a background process server-side.
  const handleExportToCloud = () => {
    contributionUpload.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: 'Contribution export queued',
          description: 'Your contributions are being uploaded to the cloud in the background.',
        });
      },
      onError: (error) => {
        console.error('Failed to queue contribution export:', error);
        toast({
          title: 'Contribution export failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      },
    });
  };

  // Sync NSFW toggle from settings on mount
  useEffect(() => {
    if (nsfwVisibility === NsfwVisibility.AlwaysHide) {
      setHideNsfw(true);
    } else if (nsfwVisibility === NsfwVisibility.Show) {
      setHideNsfw(false);
    } else {
      // HideByDefault – start hidden
      setHideNsfw(true);
    }
  }, [nsfwVisibility]);

  // ── Hidden file input for APK upload ────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load providers on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const loadExtensions = async () => {
      try {
        setLoading(true);
        onError?.(null);
        const data = await providerService.getProviders();
        setExtensions(data);
      } catch (error) {
        console.error('Failed to load extensions:', error);
        toast({ title: 'Failed to load sources', variant: 'destructive' });
        onError?.('Failed to load sources. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    void loadExtensions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lifecycle callbacks for embedded hosts (e.g. setup wizard) ───────────────
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    onExtensionsChange?.(extensions);
  }, [extensions, onExtensionsChange]);

  // ── Language options (derived from full extensions list) ─────────────────────
  const availableLanguageOptions = useMemo<MultiSelectOption[]>(() => {
    const langs = extensions
      .flatMap((ext) => getExtensionLanguages(ext))
      .filter(Boolean);
    return Array.from(new Set(langs))
      .sort()
      .map((lang) => ({ value: lang, label: lang.toUpperCase() }));
  }, [extensions]);

  // ── Installed extensions — sorted only, never filtered ──────────────────────
  // The toolbar filters (search, NSFW, language) apply only to the Available
  // list. Filtering already-installed sources is confusing and can hide a
  // source the user is trying to find/uninstall, so the Installed list always
  // shows everything that's installed (just ordered by the sort control).
  const filteredInstalledExtensions = useMemo(() => {
    const list = extensions.filter((ext) => ext.isInstaled);
    return [...list].sort((a, b) =>
      sort === 'name-asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    );
  }, [extensions, sort]);

  // ── Available extensions — filtered by search + NSFW + language ─────────────
  const filteredAvailableExtensions = useMemo(() => {
    let list = extensions.filter((ext) => !ext.isInstaled);

    // Search filter
    if (effectiveSearchTerm.trim()) {
      const term = effectiveSearchTerm.toLowerCase();
      list = list.filter(
        (ext) =>
          ext.name.toLowerCase().includes(term) ||
          getExtensionLanguages(ext).some((lang) =>
            lang.toLowerCase().includes(term)
          )
      );
    }

    if (hideNsfw) {
      list = list.filter((ext) => !isExtensionNsfw(ext));
    }
    if (selectedLanguages.length > 0) {
      list = list.filter((ext) =>
        getExtensionLanguages(ext).some((lang) => selectedLanguages.includes(lang))
      );
    }

    // Sort
    list = [...list].sort((a, b) =>
      sort === 'name-asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    );
    return list;
  }, [extensions, effectiveSearchTerm, hideNsfw, selectedLanguages, sort]);

  // ── Sliced display lists (respects INITIAL_LIMIT / expand) ──────────────────
  const visibleInstalled = expanded.installed
    ? filteredInstalledExtensions
    : filteredInstalledExtensions.slice(0, INITIAL_LIMIT);

  const visibleAvailable = expanded.available
    ? filteredAvailableExtensions
    : filteredAvailableExtensions.slice(0, INITIAL_LIMIT);

  // ── Install handler ──────────────────────────────────────────────────────────
  const handleInstall = async (pkgName: string) => {
    try {
      setActionLoading(pkgName);
      await providerService.installProvider(pkgName);

      // Optimistic update
      setExtensions((prev) =>
        prev.map((ext) =>
          ext.package === pkgName ? { ...ext, isInstaled: true } : ext
        )
      );
      doClearSearch?.();

      // Open preferences for newly installed extension
      const installed = extensions.find((ext) => ext.package === pkgName);
      if (installed) {
        setShowPreferencesFor({ pkgName: installed.package, name: installed.name });
      }
    } catch (error) {
      console.error('Failed to install extension:', error);
      toast({ title: 'Failed to install source', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Uninstall handler ────────────────────────────────────────────────────────
  const handleUninstall = async (pkgName: string) => {
    try {
      setActionLoading(pkgName);
      await providerService.uninstallProvider(pkgName);

      // Optimistic update
      setExtensions((prev) =>
        prev.map((ext) =>
          ext.package === pkgName ? { ...ext, isInstaled: false } : ext
        )
      );
      doClearSearch?.();
    } catch (error) {
      console.error('Failed to uninstall extension:', error);
      toast({ title: 'Failed to uninstall source', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Version changed handler (refresh the full list) ─────────────────────────
  const handleVersionChanged = useCallback(async () => {
    try {
      const data = await providerService.getProviders();
      setExtensions(data);
    } catch (error) {
      console.error('Failed to refresh extensions after version change:', error);
      toast({ title: 'Failed to refresh sources', variant: 'destructive' });
    }
  }, [toast]);

  // ── APK install ──────────────────────────────────────────────────────────────
  const handleInstallFromApk = async (file: File) => {
    try {
      setIsUploadingApk(true);
      const pkgName = await providerService.installProviderFromFile(file);

      if (pkgName) {
        const updatedExtensions = await providerService.getProviders();
        setExtensions(updatedExtensions);

        const newExtension = updatedExtensions.find(
          (ext) => ext.package === pkgName
        );
        if (newExtension) {
          setShowPreferencesFor({
            pkgName: newExtension.package,
            name: newExtension.name,
          });
        }
      }
    } catch (error) {
      console.error('Failed to install APK:', error);
      toast({ title: 'Failed to install APK', variant: 'destructive' });
    } finally {
      setIsUploadingApk(false);
    }
  };

  const handleApkButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file?.name.endsWith('.apk')) {
      void handleInstallFromApk(file);
    }
    // Reset so same file can be selected again
    event.target.value = '';
  };

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading sources">
        <div className="flex items-center gap-3 pb-1">
          <Skeleton className="h-5 w-24" />
          <span aria-hidden className="h-px flex-1 bg-rule" />
        </div>
        <div className="overflow-hidden rounded-lg border border-rule bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-rule px-3 py-3 last:border-b-0 md:gap-4 md:px-4">
              <Skeleton className="h-10 w-10 rounded-md md:h-11 md:w-11" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40 max-w-[60%]" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-[30px] w-20 rounded-[5px]" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading sources…</span>
      </div>
    );
  }

  // ── "Show all" labels ────────────────────────────────────────────────────────
  const installedRemaining =
    filteredInstalledExtensions.length - INITIAL_LIMIT;
  const availableRemaining =
    filteredAvailableExtensions.length - INITIAL_LIMIT;

  return (
    <div className="space-y-8">
      {/* Embedded header: description + search field (no global command bar in dialogs) */}
      {embedded && (
        <div className="space-y-3">
          {description && (
            <p className="text-sm leading-relaxed text-ink-3">
              {description}
            </p>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              value={internalSearch}
              onChange={(e) => setInternalSearch(e.target.value)}
              placeholder="Search sources…"
              className="pl-9"
            />
          </div>
        </div>
      )}

      {/* Installed section */}
      {filteredInstalledExtensions.length > 0 && (
        <SourcesSection
          id="installed-sources"
          title="Installed"
          count={filteredInstalledExtensions.length}
          showAllLabel={
            !expanded.installed && installedRemaining > 0
              ? `Show all ${filteredInstalledExtensions.length} installed sources`
              : undefined
          }
          onShowAll={
            !expanded.installed && installedRemaining > 0
              ? () => setExpanded((prev) => ({ ...prev, installed: true }))
              : undefined
          }
        >
          {visibleInstalled.map((ext) => (
            <SourceRow
              key={ext.package}
              extension={ext}
              mode="installed"
              onUninstall={(pkgName) => void handleUninstall(pkgName)}
              isLoading={actionLoading === ext.package}
              showNsfwIndicator={true}
              onVersionChanged={handleVersionChanged}
            />
          ))}
        </SourcesSection>
      )}

      {/* Filter toolbar — between Installed and Available, since filters apply only to Available */}
      <SourcesToolbar
        hideNsfw={hideNsfw}
        setHideNsfw={setHideNsfw}
        selectedLanguages={selectedLanguages}
        setSelectedLanguages={setSelectedLanguages}
        availableLanguageOptions={availableLanguageOptions}
        sort={sort}
        setSort={setSort}
        onInstallFromApk={handleApkButtonClick}
        nsfwVisibility={nsfwVisibility}
        onExportToCloud={contributionAvailable ? handleExportToCloud : undefined}
        exportingToCloud={contributionUpload.isPending}
      />

      {/* Available section */}
      {filteredAvailableExtensions.length > 0 && (
        <SourcesSection
          id="available-sources"
          title="Available"
          count={filteredAvailableExtensions.length}
          showAllLabel={
            !expanded.available && availableRemaining > 0
              ? `Browse all ${filteredAvailableExtensions.length} available sources`
              : undefined
          }
          onShowAll={
            !expanded.available && availableRemaining > 0
              ? () => setExpanded((prev) => ({ ...prev, available: true }))
              : undefined
          }
        >
          {visibleAvailable.map((ext) => (
            <SourceRow
              key={ext.package}
              extension={ext}
              mode="available"
              onInstall={(pkgName) => void handleInstall(pkgName)}
              isLoading={actionLoading === ext.package}
              showNsfwIndicator={true}
            />
          ))}
        </SourcesSection>
      )}

      {/* Empty state */}
      {filteredInstalledExtensions.length === 0 &&
        filteredAvailableExtensions.length === 0 && (
          <div className="rounded-lg border border-dashed border-rule-2 px-6 py-14 text-center text-sm text-ink-2">
            <p className="mb-1 font-serif text-xl text-ink">
              {effectiveSearchTerm.trim() ? "Nothing on the shelf." : "No sources yet."}
            </p>
            {effectiveSearchTerm.trim() ? (
              <>
                No sources found matching &ldquo;{effectiveSearchTerm}&rdquo;.{' '}
                <button
                  onClick={() => doClearSearch?.()}
                  className="font-semibold text-accent-ink underline underline-offset-2 hover:no-underline"
                >
                  View all sources
                </button>
              </>
            ) : (
              'No sources available.'
            )}
          </div>
        )}

      {/* APK upload indicator */}
      {isUploadingApk && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-ink-2" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-accent-ink" aria-hidden />
          Installing APK…
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".apk"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Auto-open preferences after install */}
      {showPreferencesFor && (
        <ProviderPreferencesRequester
          open={true}
          onOpenChange={(open) => !open && setShowPreferencesFor(null)}
          pkgName={showPreferencesFor.pkgName}
          providerName={showPreferencesFor.name}
        />
      )}
    </div>
  );
}
