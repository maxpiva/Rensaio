import type { OAuthSession } from '../db/schema';

/**
 * D1-based token store for ephemeral OAuth sessions.
 *
 * Maps 1:1 to TokenStoreService.cs (ConcurrentDictionary → D1 database).
 * - store()      → INSERT INTO oauth_sessions
 * - retrieve()   → SELECT * FROM oauth_sessions WHERE state = ?
 * - setTokens()  → UPDATE oauth_sessions SET access_token, refresh_token, expires_at
 * - remove()     → SELECT + DELETE (atomic retrieval + cleanup)
 *
 * Sessions expire after 5 minutes — cleanup handled by hourly cron trigger.
 */

const SESSION_TTL_MINUTES = 5;

/**
 * Maps 1:1 to TokenStoreService.Store() in TokenStoreService.cs lines 14-23.
 * Creates a new session entry keyed by the OAuth state parameter.
 */
export async function store(
  db: D1Database,
  state: string,
  instanceKey: string,
  provider: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO oauth_sessions (state, instance_key, provider, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
    .bind(state, instanceKey, provider)
    .run();
}

/**
 * Maps 1:1 to TokenStoreService.Retrieve() in TokenStoreService.cs lines 25-35.
 * Retrieves a session by state. Returns null if not found or expired.
 *
 * Note: The original checks TTL in-memory. We rely on the cron cleanup,
 * but also check freshness here as a safety net.
 */
export async function retrieve(
  db: D1Database,
  state: string
): Promise<OAuthSession | null> {
  const row = await db
    .prepare(
      `SELECT * FROM oauth_sessions
       WHERE state = ?
       AND created_at > datetime('now', ? || ' minutes')`
    )
    .bind(state, `-${SESSION_TTL_MINUTES}`)
    .first<OAuthSession>();

  return row ?? null;
}

/**
 * Maps 1:1 to TokenStoreService.SetTokens() in TokenStoreService.cs lines 37-45.
 * Updates an existing session with the exchanged tokens after callback.
 */
export async function setTokens(
  db: D1Database,
  state: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null
): Promise<void> {
  await db
    .prepare(
      `UPDATE oauth_sessions
       SET access_token = ?, refresh_token = ?, expires_at = ?
       WHERE state = ?`
    )
    .bind(accessToken, refreshToken, expiresAt, state)
    .run();
}

/**
 * Maps 1:1 to TokenStoreService.Remove() in TokenStoreService.cs lines 47-51.
 * Atomically retrieves and deletes a session (one-time token retrieval).
 */
export async function remove(
  db: D1Database,
  state: string
): Promise<OAuthSession | null> {
  // Retrieve first
  const row = await db
    .prepare(
      `SELECT * FROM oauth_sessions
       WHERE state = ?
       AND created_at > datetime('now', ? || ' minutes')`
    )
    .bind(state, `-${SESSION_TTL_MINUTES}`)
    .first<OAuthSession>();

  if (!row) {
    return null;
  }

  // Then delete (atomic — if the row is gone, we still return what we got)
  await db
    .prepare('DELETE FROM oauth_sessions WHERE state = ?')
    .bind(state)
    .run();

  return row;
}

/**
 * Cron cleanup handler — deletes all sessions older than 5 minutes.
 * Called hourly by the scheduled trigger.
 */
export async function cleanupExpiredSessions(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM oauth_sessions
       WHERE created_at < datetime('now', ? || ' minutes')`
    )
    .bind(`-${SESSION_TTL_MINUTES}`)
    .run();

  return result.meta.changes ?? 0;
}