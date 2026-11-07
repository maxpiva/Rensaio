"use client";

import * as React from "react";
import { Pencil, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SeriesExtendedInfo } from "@/lib/api/types";

export interface EditSeriesDialogProps {
  open: boolean;
  series: SeriesExtendedInfo;
  /** True while the save mutation is in flight (folder move may take a moment). */
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the next values. The caller decides whether to clear useTitle flags. */
  onSave: (values: { title: string; type: string; storagePath: string }) => void;
}

/**
 * Edit the series title, type, and relative storage path.
 *
 * - **Title**: overriding the title makes it a *manual* title — every source is detached
 *   as the "use as title" provider, and no metadata refresh will overwrite it. Re-selecting
 *   a source as the title provider later overwrites the manual title again.
 * - **Type**: free-form (Manga / Manhwa / Manhua quick picks). Persisted as-is.
 * - **Storage path**: RELATIVE to the configured storage folder (e.g. `Manga/One Piece`).
 *   Changing it physically moves the folder on disk (with rollback on failure), so it
 *   requires no running downloads.
 */
export function EditSeriesDialog({
  open,
  series,
  isSaving,
  onOpenChange,
  onSave,
}: EditSeriesDialogProps) {
  const [title, setTitle] = React.useState(series.title ?? "");
  const [type, setType] = React.useState(series.type ?? "");
  const [storagePath, setStoragePath] = React.useState(series.storagePath ?? "");
  const [pathTouched, setPathTouched] = React.useState(false);

  // Re-seed local state each time the dialog opens with a (possibly refreshed) series.
  React.useEffect(() => {
    if (open) {
      setTitle(series.title ?? "");
      setType(series.type ?? "");
      setStoragePath(series.storagePath ?? "");
      setPathTouched(false);
    }
  }, [open, series]);

  const handleSave = () => {
    const trimmedTitle = title.trim();
    const trimmedType = type.trim();
    const trimmedPath = storagePath.trim();
    if (!trimmedTitle) return; // title is required
    if (!trimmedPath) return; // path is required
    onSave({ title: trimmedTitle, type: trimmedType, storagePath: trimmedPath });
  };

  const typePills = ["Manga", "Manhwa", "Manhua","Comic"].filter((t) =>
    !type.toLowerCase().includes(t.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-ink">
              <Pencil className="h-4 w-4" />
            </span>
            Edit Series
          </DialogTitle>
          <DialogDescription>
            Update the series title, type, and where its files are stored. Changing the
            storage path moves the folder on disk, make sure no downloads are running.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="edit-series-title" className="text-sm font-medium">
              Title
            </Label>
            <Input
              id="edit-series-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The series display title"
            />
            <p className="text-xs leading-relaxed text-ink-3">
              Overriding the title detaches every source from &ldquo;use as title&rdquo;, the title
              becomes manual and metadata refreshes won&rsquo;t overwrite it. Re-picking a
              source as the title provider restores its title.
            </p>
          </div>

          {/* Type */}
          <div className="grid gap-2">
            <Label htmlFor="edit-series-type" className="text-sm font-medium">
              Type
            </Label>
            <Input
              id="edit-series-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Manga / Manhwa / Manhua / …"
            />
            {typePills.length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {typePills.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setType(preset)}
                    aria-pressed={type === preset}
                    className={`inline-flex h-7 items-center rounded-full border px-3 text-[12px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-accent-soft max-sm:h-10 max-sm:px-3.5 ${
                      type === preset
                        ? "border-accent-line bg-accent-soft text-accent-ink"
                        : "border-rule-2 bg-paper text-ink-2 hover:border-rule-3 hover:text-ink"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Storage path */}
          <div className="grid gap-2">
            <Label htmlFor="edit-series-path" className="text-sm font-medium">
              Storage Path
            </Label>
            <div className="relative">
              <FolderOpen className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <Input
                id="edit-series-path"
                value={storagePath}
                onChange={(e) => {
                  setStoragePath(e.target.value);
                  setPathTouched(true);
                }}
                className="pl-9 font-mono sm:text-[13px]"
                placeholder="Manga/One Piece"
              />
            </div>
            <p className="text-xs leading-relaxed text-ink-3">
              Relative to the configured storage folder. Changing it moves the whole folder
              (and its files) to the new location; the operation rolls back if it fails.
            </p>
            {pathTouched && storagePath.trim() !== (series.storagePath ?? "") && (
              <p className="flex items-center gap-1.5 rounded-md border border-warn/35 bg-warn-soft px-2.5 py-1.5 text-xs font-medium text-warn">
                Moving files — the old folder will be cleaned up when empty.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !storagePath.trim()}
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving…
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}