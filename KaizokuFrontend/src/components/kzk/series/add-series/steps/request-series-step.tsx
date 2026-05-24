"use client";

import { type AddSeriesState } from "@/components/kzk/series/add-series";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type LinkedSeries } from "@/lib/api/types";
import React from "react";
import Image from "next/image";
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";

/**
 * Simplified confirm step for users who can only request (not add) series.
 * Shows a preview of the selected series and an optional note field.
 */
export function RequestSeriesStep({
  formState,
  setCanProgress,
  requestNote,
  onRequestNoteChange,
}: {
  formState: AddSeriesState;
  setCanProgress: React.Dispatch<React.SetStateAction<boolean>>;
  requestNote: string;
  onRequestNoteChange: (note: string) => void;
}) {
  // ── selectedSeries derivation (verbatim) ──────────────────────────────────
  const selectedSeries = React.useMemo(() => {
    return formState.allLinkedSeries.filter((series: LinkedSeries) =>
      formState.selectedLinkedSeries.includes(series.mihonId ?? series.providerId),
    );
  }, [formState.allLinkedSeries, formState.selectedLinkedSeries]);

  // ── setCanProgress effect (verbatim) ──────────────────────────────────────
  React.useEffect(() => {
    setCanProgress(selectedSeries.length > 0);
  }, [selectedSeries.length, setCanProgress]);

  if (selectedSeries.length === 0) {
    return (
      <div className="mt-4 rounded-md border bg-secondary p-4 text-center">
        <p className="text-sm text-muted-foreground">
          No series selected. Go back and select a series to request.
        </p>
      </div>
    );
  }

  const primary = selectedSeries[0]!;

  return (
    <div className="flex flex-col gap-4">
      {/* Two-column layout */}
      <div className="cmd-confirm">
        {/* ── Left: series preview ── */}
        <div>
          {/* Cover */}
          <div className="confirm-cv relative">
            <Image
              src={formatThumbnailUrl(primary.thumbnailUrl)}
              alt={primary.title}
              fill
              sizes="(max-width: 640px) 240px, 200px"
              className="object-cover"
            />
          </div>

          {/* Title */}
          <div className="confirm-title mt-2">{primary.title}</div>

          {/* Provider + lang line */}
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <ReactCountryFlag
              countryCode={getCountryCodeForLanguage(primary.lang)}
              svg
              style={{ width: "16px", height: "12px" }}
              title={primary.lang.toUpperCase()}
            />
            {primary.provider} · {primary.lang.toUpperCase()}
          </p>
        </div>

        {/* ── Right: request note ── */}
        <div className="flex flex-col gap-3">
          <div>
            <div className="stage-label" style={{ marginBottom: 6 }}>
              <span className="eyebrow">A NOTE FOR THE ADMIN</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Optional context</p>
            <Textarea
              id="request-note"
              value={requestNote}
              onChange={(e) => onRequestNoteChange(e.target.value)}
              placeholder="Any additional context about this request..."
              rows={4}
              className="bg-card"
            />
          </div>

          {/* Additional selected sources */}
          {selectedSeries.length > 1 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                Also requesting:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedSeries.slice(1).map((series) => (
                  <Badge
                    key={series.mihonId ?? series.providerId}
                    variant="secondary"
                    className="text-xs"
                  >
                    {series.provider} ({series.lang.toUpperCase()})
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
