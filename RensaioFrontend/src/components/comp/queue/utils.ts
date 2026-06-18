// ---------------------------------------------------------------------------
// UTC date normalization
// ---------------------------------------------------------------------------

/**
 * Appends 'Z' to a UTC date string that lacks an explicit timezone suffix so
 * that `Date.parse` and `new Date()` treat it as UTC rather than local time.
 */
export function normalizeUtcString(dateString: string): string {
  return dateString.includes('Z') ||
    dateString.includes('+') ||
    dateString.includes('-', 10)
    ? dateString
    : dateString + 'Z';
}

// ---------------------------------------------------------------------------
// Relative time formatting
// ---------------------------------------------------------------------------

/**
 * Formats a Date into a concise relative time string for display in the
 * queue row time slot.
 *
 * Rules:
 *   < 60 s      → "just now"
 *   < 60 m      → "Xm ago"
 *   same day, < 24 h → "Xh ago"
 *   yesterday   → "yesterday"
 *   within last 7 days → weekday short ("Tue")
 *   older       → locale short date ("May 12")
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  // < 60 seconds
  if (diff < 60_000) {
    return 'just now';
  }

  // < 60 minutes → "Xm ago"
  if (diff < 60 * 60_000) {
    const m = Math.floor(diff / 60_000);
    return `${m}m ago`;
  }

  // Within same calendar day, up to 24 h → "Xh ago"
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  if (date >= todayMidnight && diff < 24 * 60 * 60_000) {
    const h = Math.floor(diff / (60 * 60_000));
    return `${h}h ago`;
  }

  // Yesterday midnight
  const yesterdayMidnight = new Date(todayMidnight);
  yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);

  if (date >= yesterdayMidnight && date < todayMidnight) {
    return 'yesterday';
  }

  // Within last 7 days → short weekday name
  const weekStart = new Date(todayMidnight);
  weekStart.setDate(weekStart.getDate() - 6);

  if (date >= weekStart) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  // Older → short locale date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Date bucket helpers for time grouping
// ---------------------------------------------------------------------------

export type DateBucket = 'today' | 'yesterday' | 'this-week' | 'earlier';

/**
 * Returns the bucket a sortTime (ms epoch) falls into.
 * Active / queued items with sortTime === 0 are always bucketed as 'today'.
 */
export function getDateBucket(sortTime: number): DateBucket {
  if (sortTime === 0) return 'today';

  const now = new Date();

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  const yesterdayMidnight = new Date(todayMidnight);
  yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);

  const weekStart = new Date(todayMidnight);
  weekStart.setDate(weekStart.getDate() - 6);

  const ts = sortTime;
  if (ts >= todayMidnight.getTime()) return 'today';
  if (ts >= yesterdayMidnight.getTime()) return 'yesterday';
  if (ts >= weekStart.getTime()) return 'this-week';
  return 'earlier';
}

export const BUCKET_LABELS: Record<DateBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'Earlier this week',
  earlier: 'Earlier',
};
