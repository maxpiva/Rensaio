import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, Power, PowerOff, Search, Trash2 } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type ProviderExtendedInfo, type ProviderMatch } from "@/lib/api/types";
import { getStatusDisplay } from "@/lib/utils/series-status";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { ProviderMatchDialog } from "@/components/dialogs/provider-match-dialog";
import { useSetProviderMatch } from "@/lib/api/hooks/useSeries";

// ──────────────────────────────────────────────────────────────────────────────
// Small relative-time helper (mirrors the format used in the cinematic mockup)
// ──────────────────────────────────────────────────────────────────────────────
function formatRelative(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const normalized =
    dateString.includes("Z") ||
    dateString.includes("+") ||
    dateString.includes("-", 10)
      ? dateString
      : dateString + "Z";
  const t = new Date(normalized).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ──────────────────────────────────────────────────────────────────────────────
// PillToggle — replacement for the trio of <Switch> controls (Perm/Cover/Title)
// ──────────────────────────────────────────────────────────────────────────────
function PillToggle({
  label,
  shortLabel,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  shortLabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        checked
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border/40 bg-foreground/[0.04] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          checked
            ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.7)]"
            : "bg-foreground/30"
        }`}
      />
      {shortLabel ? (
        <>
          <span className="lg:hidden">{shortLabel}</span>
          <span className="hidden lg:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ProviderCard
// ──────────────────────────────────────────────────────────────────────────────
export const ProviderCard = ({
  provider,
  useCover,
  useTitle,
  useStorage,
  fromChapter,
  seriesId,
  onUseCoverChange,
  onUseTitleChange,
  onUseStorageChange,
  onDisabledChange,
  onDeleteProvider,
  onFromChapterChange,
  deletedProviderStates,
  canEdit = true,
}: {
  provider: ProviderExtendedInfo;
  useCover: boolean;
  useTitle: boolean;
  useStorage: boolean;
  fromChapter: string;
  seriesId: string;
  onUseCoverChange: (providerId: string, enabled: boolean) => void;
  onUseTitleChange: (providerId: string, enabled: boolean) => void;
  onUseStorageChange: (providerId: string, enabled: boolean) => void;
  onDisabledChange: (providerId: string, disabled: boolean) => void;
  onDeleteProvider: (providerId: string) => void;
  onFromChapterChange: (providerId: string, value: string) => void;
  deletedProviderStates: Record<string, boolean>;
  canEdit?: boolean;
}) => {
  const [isEnabled, setIsEnabled] = useState(
    !provider.isDisabled && !provider.isUninstalled,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setIsEnabled(!provider.isDisabled && !provider.isUninstalled);
  }, [provider.isDisabled, provider.isUninstalled, provider.id, provider.provider]);

  const hasUnknownThumbnail =
    provider.thumbnailUrl?.toLowerCase().includes("unknown") ?? false;
  const isUnknown = provider.isUnknown;
  const isDisabled = provider.isDisabled;

  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [providerMatch, setProviderMatch] = useState<ProviderMatch | null>(null);
  const [isLoadingMatch, setIsLoadingMatch] = useState(false);
  const [localFromChapter, setLocalFromChapter] = useState(fromChapter);

  useEffect(() => {
    setLocalFromChapter(fromChapter);
  }, [fromChapter]);

  // Auto-disable cover when thumbnail is unknown
  useEffect(() => {
    if (hasUnknownThumbnail && useCover) {
      onUseCoverChange(provider.id, false);
    }
  }, [hasUnknownThumbnail, useCover, onUseCoverChange, provider.id]);

  const setMatchMutation = useSetProviderMatch();

  const handleEnableDisable = () => {
    const newDisabledState = isEnabled; // toggling
    onDisabledChange(provider.id, newDisabledState);
  };

  const handleMatch = async () => {
    if (isUnknown) {
      setMatchDialogOpen(true);
      setIsLoadingMatch(true);
      try {
        const { seriesService } = await import(
          "@/lib/api/services/seriesService"
        );
        const matchData = await seriesService.getMatch(provider.id);
        setProviderMatch(matchData);
      } catch (error) {
        console.error("Failed to fetch match data:", error);
        setProviderMatch(null);
      } finally {
        setIsLoadingMatch(false);
      }
    }
  };

  const handleMatchSave = (updatedMatch: ProviderMatch) => {
    setMatchMutation.mutate(updatedMatch, {
      onSuccess: () => {
        setMatchDialogOpen(false);
        queryClient.invalidateQueries({
          queryKey: ["series", "detail", seriesId],
        });
        queryClient.invalidateQueries({ queryKey: ["series", "library"] });
      },
      onError: (error) => {
        console.error("Failed to save match:", error);
      },
    });
  };

  const handleDelete = () => setConfirmDelete(true);
  const confirmDeleteHandler = () => {
    onDeleteProvider(provider.id);
    setConfirmDelete(false);
  };

  const handleFromChapterBlur = () => {
    if (localFromChapter !== fromChapter) {
      onFromChapterChange(provider.id, localFromChapter);
    }
  };

  const handleFromChapterKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  const status = getStatusDisplay(provider.status);
  const relativeTime = formatRelative(provider.lastChangeUTC);

  const providerLabel = provider.url ? (
    <a
      href={provider.url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-foreground hover:text-primary hover:underline"
    >
      {provider.provider}
    </a>
  ) : (
    <span className="font-medium text-foreground">{provider.provider}</span>
  );

  return (
    <div
      className={`group relative rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border ${
        isDisabled ? "opacity-60" : ""
      } ${isUnknown ? "border-amber-500/40 bg-amber-500/[0.04]" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-3 lg:flex-nowrap lg:gap-4">
        {/* Thumbnail */}
        <div className="shrink-0">
          <img
            src={formatThumbnailUrl(provider.thumbnailUrl)}
            alt={provider.title}
            className="h-[84px] w-14 rounded-md object-cover ring-1 ring-white/[0.06] sm:h-24 sm:w-16"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (
                target.src !==
                window.location.origin + "/kaizoku.net.png"
              ) {
                target.src = "/kaizoku.net.png";
              }
            }}
          />
        </div>

        {/* Center column */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div
            className="truncate text-sm font-medium leading-tight"
            title={provider.title}
          >
            {provider.title}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {providerLabel}

            {provider.scanlator && provider.scanlator !== provider.provider && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {provider.scanlator}
              </span>
            )}

            <ReactCountryFlag
              countryCode={getCountryCodeForLanguage(provider.lang)}
              svg
              style={{
                width: "16px",
                height: "12px",
                borderRadius: "2px",
                border: "1px solid hsl(var(--border))",
                flexShrink: 0,
              }}
              title={provider.lang.toUpperCase()}
            />

            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${status.color}`}
              />
              {status.text}
            </span>

            {provider.isUninstalled && (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Uninstalled
              </span>
            )}

            {useStorage && !isUnknown && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                title="Permanent source — its files are kept as the series' storage copy"
              >
                <Archive className="h-3 w-3" />
                Permanent
              </span>
            )}
          </div>

          <div className="text-xs tabular-nums text-muted-foreground">
            Ch. {provider.chapterList}
            {relativeTime && (
              <>
                <span className="mx-1.5 text-foreground/30">·</span>
                updated {relativeTime}
              </>
            )}
          </div>
        </div>

        {/* Right controls */}
        {canEdit && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-border/40 pt-3 lg:w-auto lg:shrink-0 lg:flex-nowrap lg:flex-row lg:items-center lg:border-t-0 lg:pt-0">
            {!isUnknown && (
              <>
                <div className="flex flex-wrap items-center gap-1">
                  <PillToggle
                    label="Permanent Source"
                    shortLabel="Perm"
                    checked={useStorage}
                    onChange={(v) => onUseStorageChange(provider.id, v)}
                    disabled={isDisabled}
                  />
                  <PillToggle
                    label="Use as Cover"
                    shortLabel="Cover"
                    checked={useCover}
                    onChange={(v) => onUseCoverChange(provider.id, v)}
                    disabled={isDisabled || hasUnknownThumbnail}
                  />
                  <PillToggle
                    label="Use as Title"
                    shortLabel="Title"
                    checked={useTitle}
                    onChange={(v) => onUseTitleChange(provider.id, v)}
                    disabled={isDisabled}
                  />
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground lg:border-l lg:border-border/40 lg:pl-2">
                  <span className="uppercase tracking-wide">After Ch.</span>
                  <input
                    type="number"
                    value={localFromChapter}
                    onChange={(e) => setLocalFromChapter(e.target.value)}
                    onBlur={handleFromChapterBlur}
                    onKeyDown={handleFromChapterKeyDown}
                    disabled={isDisabled}
                    min={0}
                    step={1}
                    placeholder="0"
                    className="h-7 w-16 rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-50"
                  />
                </div>
              </>
            )}

            {/* Icon button cluster */}
            <div className="ml-auto flex items-center gap-1 lg:ml-0 lg:border-l lg:border-border/40 lg:pl-2">
              {!isUnknown && !provider.isUninstalled && (
                <button
                  type="button"
                  onClick={handleEnableDisable}
                  title={isEnabled ? "Disable" : "Enable"}
                  aria-label={isEnabled ? "Disable source" : "Enable source"}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isEnabled
                      ? "border-green-500/40 bg-green-500/[0.06] text-green-500 hover:bg-green-500/[0.14] active:bg-green-500/[0.20]"
                      : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-foreground/[0.08] active:bg-foreground/[0.12]"
                  }`}
                >
                  {isEnabled ? (
                    <Power className="h-4 w-4" />
                  ) : (
                    <PowerOff className="h-4 w-4" />
                  )}
                </button>
              )}

              {isUnknown && (
                <button
                  type="button"
                  onClick={handleMatch}
                  disabled={isLoadingMatch}
                  title="Search match"
                  aria-label="Search match"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-foreground/[0.03] text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleDelete}
                title="Delete source"
                aria-label="Delete source"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-foreground/[0.03] text-destructive/70 transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Provider Match Dialog */}
      <ProviderMatchDialog
        open={matchDialogOpen}
        onOpenChange={setMatchDialogOpen}
        providerMatch={providerMatch}
        onSave={handleMatchSave}
        isLoading={setMatchMutation.isPending}
        isLoadingData={isLoadingMatch}
        deletedProviderStates={deletedProviderStates}
      />

      {/* Confirm delete dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this source?</DialogTitle>
            <DialogDescription>
              {provider.scanlator
                ? `Remove ${provider.provider} (${provider.scanlator}) from this series`
                : `Remove ${provider.provider} from this series`}
              . This won&apos;t delete downloaded files.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteHandler}>
              Remove Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
