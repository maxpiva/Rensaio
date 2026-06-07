import { Hono } from 'hono';
import type { Env } from '../types';
import { SUPPORTED_PROVIDERS, PROVIDER_DISPLAY_NAMES } from '../types';
import { generateAuthUrl, exchangeCode, refreshToken } from '../services/provider-api';
import { store, retrieve, setTokens, remove } from '../services/token-store';
import { renderCallbackHtml } from '../utils/callback-html';
import type { ErrorResponse, OAuthUrlResponse, TokenRetrieveResponse, TokenRefreshResponse } from '../models/responses';
import type { TokenRetrieveRequest, TokenRefreshRequest } from '../models/requests';

/**
 * OAuth routes.
 *
 * Maps 1:1 to OAuthController.cs.
 * Base path: /api/oauth (set in index.ts)
 *
 * Endpoints:
 *   POST /:provider/url       → GetAuthUrl()        (lines 25-47)
 *   GET  /:provider/callback  → Callback()           (lines 49-113)
 *   POST /:provider/token     → GetToken()           (lines 115-133)
 *   POST /:provider/refresh   → RefreshToken()       (lines 135-159)
 */
const oauthRoutes = new Hono<{ Bindings: Env }>();

// ──────────────────────────────────────────────
// POST /:provider/url
// Generates the authorization URL for a provider.
// Maps 1:1 to OAuthController.GetAuthUrl() lines 25-47.
// ──────────────────────────────────────────────
oauthRoutes.post('/:provider/url', async (c) => {
  const provider = c.req.param('provider').toLowerCase();
  const instanceKey = c.req.header('X-Instance-Key');

  // Validate instance key (matching original: Unauthorized on missing)
  if (!instanceKey) {
    return c.json<ErrorResponse>({ error: 'X-Instance-Key header required' }, 401);
  }

  // Validate provider
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return c.json<ErrorResponse>({ error: `Unsupported provider: ${provider}` }, 400);
  }

  try {
    // Generate state (matching original: Guid.NewGuid().ToString("N"))
    const state = crypto.randomUUID().replace(/-/g, '');

    // Build redirect URI (matching original: $"{Request.Scheme}://{Request.Host}/api/oauth/{provider}/callback")
    const url = new URL(c.req.url);
    const redirectUri = `${url.protocol}//${url.host}/api/oauth/${provider}/callback`;

    // Generate auth URL
    const authUrl = generateAuthUrl(provider, redirectUri, state, c.env);

    // Store session in D1 (matching original: _tokenStore.Store(state, instanceKey, provider))
    await store(c.env.DB, state, instanceKey, provider);

    return c.json<OAuthUrlResponse>({ authUrl, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate auth URL';
    return c.json<ErrorResponse>({ error: message }, 400);
  }
});

// ──────────────────────────────────────────────
// GET /:provider/callback
// Handles the OAuth provider redirect after user authorization.
// Maps 1:1 to OAuthController.Callback() lines 49-113.
// ──────────────────────────────────────────────
oauthRoutes.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider').toLowerCase();
  const code = c.req.query('code');
  const state = c.req.query('state');
  const redirectUriQuery = c.req.query('redirectUri');

  // Validate required params (matching original: BadRequest on missing)
  if (!code || !state) {
    return c.json<ErrorResponse>({ error: 'Missing code or state parameter' }, 400);
  }

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return c.json<ErrorResponse>({ error: `Unsupported provider: ${provider}` }, 400);
  }

  // Retrieve session (matching original: _tokenStore.Retrieve(state))
  const session = await retrieve(c.env.DB, state);
  if (!session) {
    return c.json<ErrorResponse>({ error: 'Invalid state — authorization session not found' }, 400);
  }

  try {
    // Build callback URI (matching original: redirectUri ?? $"{Request.Scheme}://{Request.Host}/...")
    const url = new URL(c.req.url);
    const callbackUri = redirectUriQuery ?? `${url.protocol}//${url.host}/api/oauth/${provider}/callback`;

    // Exchange code for tokens (matching original: _providerApi.ExchangeCodeAsync(provider, code, callbackUri))
    const tokenResult = await exchangeCode(provider, code, callbackUri, c.env);

    // Store tokens in session (matching original: _tokenStore.SetTokens(state, accessToken, refreshToken, expiresAt))
    await setTokens(c.env.DB, state, tokenResult.accessToken, tokenResult.refreshToken, tokenResult.expiresAt);

    // Get display name (matching original: provider.ToLowerInvariant() switch { ... })
    const displayName = PROVIDER_DISPLAY_NAMES[provider] ?? provider;

    // Render success HTML page with postMessage (matching original lines 80-106)
    const html = renderCallbackHtml(displayName, provider, state);
    return c.html(html);
  } catch (err) {
    console.error(`OAuth callback failed for provider ${provider}:`, err);
    return c.json<ErrorResponse>({ error: 'Token exchange failed' }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /:provider/token
// Retrieves tokens by state (one-time, then deletes).
// Maps 1:1 to OAuthController.GetToken() lines 115-133.
// ──────────────────────────────────────────────
oauthRoutes.post('/:provider/token', async (c) => {
  const provider = c.req.param('provider').toLowerCase();

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return c.json<ErrorResponse>({ error: `Unsupported provider: ${provider}` }, 400);
  }

  const body = await c.req.json<TokenRetrieveRequest>();

  // Validate state (matching original: BadRequest on missing)
  if (!body.state) {
    return c.json<ErrorResponse>({ error: 'State is required' }, 400);
  }

  // Remove session (matching original: _tokenStore.Remove(request.State))
  const entry = await remove(c.env.DB, body.state);
  if (!entry) {
    return c.json<ErrorResponse>({ error: 'No tokens found for this state' }, 404);
  }

  return c.json<TokenRetrieveResponse>({
    accessToken: entry.access_token ?? '',
    refreshToken: entry.refresh_token,
    expiresAt: entry.expires_at,
  });
});

// ──────────────────────────────────────────────
// POST /:provider/refresh
// Refreshes an expired access token.
// Maps 1:1 to OAuthController.RefreshToken() lines 135-159.
// ──────────────────────────────────────────────
oauthRoutes.post('/:provider/refresh', async (c) => {
  const provider = c.req.param('provider').toLowerCase();
  const instanceKey = c.req.header('X-Instance-Key');

  // Validate instance key (matching original: Unauthorized on missing)
  if (!instanceKey) {
    return c.json<ErrorResponse>({ error: 'X-Instance-Key header required' }, 401);
  }

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return c.json<ErrorResponse>({ error: `Unsupported provider: ${provider}` }, 400);
  }

  const body = await c.req.json<TokenRefreshRequest>();

  try {
    // Refresh the token (matching original: _providerApi.RefreshTokenAsync(provider, request.RefreshToken))
    const tokenResult = await refreshToken(provider, body.refreshToken, c.env);

    return c.json<TokenRefreshResponse>({
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt: tokenResult.expiresAt,
    });
  } catch (err) {
    console.error(`Token refresh failed for provider ${provider}:`, err);
    return c.json<ErrorResponse>({ error: 'Token refresh failed' }, 500);
  }
});

export default oauthRoutes;