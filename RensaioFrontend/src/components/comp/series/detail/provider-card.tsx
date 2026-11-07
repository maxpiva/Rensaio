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
import { useToast } from "@/hooks/use-toast";
import { getStatusTone } from "./status-tone";

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
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-accent-soft max-sm:h-11 max-sm:px-3.5 ${
        checked
          ? "border-accent-line bg-accent-soft text-accent-ink"
          : "border-rule-2 bg-paper text-ink-3 hover:border-rule-3 hover:text-ink"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 rounded-full transition-colors ${
          checked ? "bg-accent-ink" : "bg-ink-3/40"
        }`}
      />
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
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
  const { toast } = useToast();
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
        void queryClient.invalidateQueries({
          queryKey: ["series", "detail", seriesId],
        });
        void queryClient.invalidateQueries({ queryKey: ["series", "library"] });
      },
      onError: (error) => {
        console.error("Failed to save match:", error);
        toast({
          title: "Failed to save match",
          description: error instanceof Error ? error.message : "Could not save the match. Please try again.",
          variant: "destructive",
        });
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
  const tone = getStatusTone(provider.status);
  const relativeTime = formatRelative(provider.lastChangeUTC);

  const providerLabel = provider.url ? (
    <a
      href={provider.url}
      target="_blank"
      rel="noreferrer"
      className="rounded-sm font-semibold text-ink underline-offset-[3px] outline-none hover:text-accent-ink hover:underline focus-visible:underline"
    >
      {provider.provider}
    </a>
  ) : (
    <span className="font-semibold text-ink">{provider.provider}</span>
  );

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border outline-none transition-colors active:scale-95 focus-visible:ring-[3px] focus-visible:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50 max-sm:h-11 max-sm:w-11";

  return (
    <div
      className={`group relative flex flex-col rounded-lg border bg-paper-1 p-3.5 shadow-paper transition-[border-color,opacity] sm:p-4 ${
        isUnknown
          ? "border-warn/45 bg-[linear-gradient(0deg,var(--warn-soft),var(--warn-soft)),var(--paper-1)]"
          : "border-rule-2 hover:border-rule-3"
      } ${isDisabled ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3.5">
        {/* Thumbnail */}
        <div className="shrink-0">
          <img
            src={formatThumbnailUrl(provider.thumbnailUrl)}
            alt={provider.title}
            className="h-[84px] w-14 rounded-[3px] bg-paper-2 object-cover shadow-paper ring-1 ring-ink/10 sm:h-24 sm:w-16"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (
                target.src !==
                window.location.origin + "/rensaio.png"
              ) {
                target.src = "/rensaio.png";
              }
            }}
          />
        </div>

        {/* Info column */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div
            className="line-clamp-2 font-serif text-[17px] leading-tight tracking-[-0.01em] text-ink"
            title={provider.title}
          >
            {provider.title}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-ink-2">
            {providerLabel}

            {provider.scanlator && provider.scanlator !== provider.provider && (
              <span className="max-w-full truncate rounded-[3px] bg-paper-2 px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">
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
                border: "1px solid var(--rule-2)",
                flexShrink: 0,
              }}
              title={provider.lang.toUpperCase()}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${tone.chip}`}>
              <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${tone.fill}`} />
              {status.text}
            </span>

            {provider.isUninstalled && (
              <span className="inline-flex items-center gap-1 rounded-[3px] border border-bad/30 bg-bad-soft px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-bad">
                <AlertTriangle className="h-3 w-3" />
                Uninstalled
              </span>
            )}

            {useStorage && !isUnknown && (
              <span
                className="inline-flex items-center gap-1 rounded-[3px] border border-accent-line bg-accent-soft px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-ink"
                title="Permanent source — its files are kept as the series' storage copy"
              >
                <Archive className="h-3 w-3" />
                Permanent
              </span>
            )}
          </div>

          <div className="font-mono text-[11.5px] tabular-nums text-ink-3">
            Ch. {provider.chapterList}
            {relativeTime && (
              <>
                <span aria-hidden="true" className="mx-1.5 text-rule-3">·</span>
                updated {relativeTime}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      {canEdit && (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-dashed border-rule-2 pt-3.5">
          {!isUnknown && (
            <div className="flex w-full flex-wrap items-center gap-1.5">
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
          )}

          {!isUnknown && (
            <label className="flex items-center gap-2">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">After Ch.</span>
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
                className="h-9 w-20 rounded-md border border-input bg-paper px-2.5 font-mono text-[13px] tabular-nums text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-3/70 focus-visible:border-accent-ink focus-visible:ring-[3px] focus-visible:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50 max-sm:h-11"
              />
            </label>
          )}

          {isUnknown && (
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium text-warn">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Unassigned — search for a match</span>
            </p>
          )}

          {/* Icon button cluster */}
          <div className="ml-auto flex items-center gap-1.5">
            {!isUnknown && !provider.isUninstalled && (
              <button
                type="button"
                onClick={handleEnableDisable}
                title={isEnabled ? "Disable" : "Enable"}
                aria-label={isEnabled ? "Disable source" : "Enable source"}
                aria-pressed={isEnabled}
                className={`${iconBtn} ${
                  isEnabled
                    ? "border-ok/35 bg-ok-soft text-ok hover:border-ok/60"
                    : "border-rule-2 bg-paper text-ink-3 hover:bg-hover hover:text-ink"
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
                className={`${iconBtn} border-accent-line bg-accent-soft text-accent-ink hover:border-accent-ink`}
              >
                <Search className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleDelete}
              title="Delete source"
              aria-label="Delete source"
              className={`${iconBtn} border-rule-2 bg-paper text-ink-3 hover:border-bad/40 hover:bg-bad-soft hover:text-bad`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
            <DialogTitle className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-bad-soft text-bad">
                <Trash2 className="h-4 w-4" />
              </span>
              Remove this source?
            </DialogTitle>
            <DialogDescription>
              {provider.scanlator
                ? `Remove ${provider.provider} (${provider.scanlator}) from this series`
                : `Remove ${provider.provider} from this series`}
              . This won&apos;t delete downloaded files.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
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
