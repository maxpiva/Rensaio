import { SeriesStatus } from "@/lib/api/types";

/**
 * Paper/Ink tone classes for a series status. Mirrors the hues of
 * `getStatusDisplay` (green / blue / purple / red / amber / grey) but uses the
 * theme's semantic tokens so it reads correctly in both Paper and Ink.
 */
export interface StatusTone {
  /** Solid fill (dots, strips, chips with `text-paper`). */
  fill: string;
  /** Text colour. */
  text: string;
  /** Soft chip: tinted background + border + text. */
  chip: string;
}

export function getStatusTone(status: SeriesStatus | undefined | null): StatusTone {
  switch (status) {
    case SeriesStatus.ONGOING:
      return { fill: "bg-ok", text: "text-ok", chip: "border-ok/30 bg-ok-soft text-ok" };
    case SeriesStatus.COMPLETED:
    case SeriesStatus.PUBLISHING_FINISHED:
      return { fill: "bg-info", text: "text-info", chip: "border-info/30 bg-info-soft text-info" };
    case SeriesStatus.LICENSED:
      return {
        fill: "bg-accent-ink",
        text: "text-accent-ink",
        chip: "border-accent-line bg-accent-soft text-accent-ink",
      };
    case SeriesStatus.CANCELLED:
      return { fill: "bg-bad", text: "text-bad", chip: "border-bad/30 bg-bad-soft text-bad" };
    case SeriesStatus.ON_HIATUS:
      return { fill: "bg-warn", text: "text-warn", chip: "border-warn/30 bg-warn-soft text-warn" };
    default:
      return { fill: "bg-ink-3", text: "text-ink-3", chip: "border-rule-2 bg-paper-2 text-ink-3" };
  }
}
