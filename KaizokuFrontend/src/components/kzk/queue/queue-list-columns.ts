import type { DownloadInfo } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

export const COLUMN_WIDTHS = {
  thumbnail: 48,
  // title is the flex column — it consumes remaining space
  title: 0,
  source: 180,
  time: 80,
  retries: 80,
  actions: 100,
} as const;

export const ROW_HEIGHT = 56;
export const HEADER_HEIGHT = 36;

// ---------------------------------------------------------------------------
// Sorting types
// ---------------------------------------------------------------------------

export type SortKey = 'title' | 'source' | 'time' | 'retries' | null;
export type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// UTC date normalization (shared helper — original lives in page.tsx)
// ---------------------------------------------------------------------------

export function normalizeUtcString(dateString: string): string {
  return dateString.includes('Z') ||
    dateString.includes('+') ||
    dateString.includes('-', 10)
    ? dateString
    : dateString + 'Z';
}

function getTimeValue(item: DownloadInfo): number {
  const raw = item.downloadDateUTC || item.scheduledDateUTC;
  if (!raw) return 0;
  const parsed = Date.parse(normalizeUtcString(raw));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareStrings(a: string | undefined, b: string | undefined): number {
  const av = (a ?? '').toLocaleLowerCase();
  const bv = (b ?? '').toLocaleLowerCase();
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

function compareNumbers(a: number | undefined, b: number | undefined): number {
  const av = a ?? 0;
  const bv = b ?? 0;
  return av - bv;
}

// ---------------------------------------------------------------------------
// Sort primitives
// ---------------------------------------------------------------------------

export function compareDownloads(
  a: DownloadInfo,
  b: DownloadInfo,
  key: SortKey,
  dir: SortDir,
): number {
  if (key === null) return 0;

  let cmp = 0;
  switch (key) {
    case 'title':
      cmp = compareStrings(a.title, b.title);
      break;
    case 'source':
      cmp = compareStrings(a.provider, b.provider);
      if (cmp === 0) cmp = compareStrings(a.scanlator, b.scanlator);
      break;
    case 'time':
      cmp = compareNumbers(getTimeValue(a), getTimeValue(b));
      break;
    case 'retries':
      cmp = compareNumbers(a.retries, b.retries);
      break;
    default:
      cmp = 0;
  }

  return dir === 'asc' ? cmp : -cmp;
}

export function sortDownloads(
  items: DownloadInfo[],
  key: SortKey,
  dir: SortDir,
): DownloadInfo[] {
  if (key === null) return items;
  return [...items].sort((a, b) => compareDownloads(a, b, key, dir));
}
