import { Hono } from 'hono';
import type { Env } from './types';
import oauthRoutes from './routes/oauth';
import { cleanupExpiredSessions } from './services/token-store';

/**
 * Cloudflare Worker entry point.
 *
 * Maps 1:1 to Program.cs.
 * - Registers routes (Program.cs: MapControllers)
 * - Handles scheduled cron triggers (cleanup)
 * - HTTPS redirection is automatic at Cloudflare edge
 *
 * Original Program.cs:
 *   app.UseHttpsRedirection();  → handled by Cloudflare edge
 *   app.MapControllers();       → Hono route mounting
 *   app.Run();                  → Workers runtime
 */

const app = new Hono<{ Bindings: Env }>();

// ── Health check ──
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'kaizoku-oauth-proxy' });
});

// ── OAuth routes (maps to OAuthController.cs: [Route("api/oauth")]) ──
app.route('/api/oauth', oauthRoutes);

// ── Scheduled cron handler (hourly cleanup of expired sessions) ──
app.get('/__scheduled', async (c) => {
  try {
    const deleted = await cleanupExpiredSessions(c.env.DB);
    console.log(`Cron cleanup: deleted ${deleted} expired sessions`);
    return c.json({ cleaned: deleted });
  } catch (err) {
    console.error('Cron cleanup failed:', err);
    return c.json({ error: 'Cleanup failed' }, 500);
  }
});

// ── Catch-all 404 ──
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// ── Global error handler ──
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;