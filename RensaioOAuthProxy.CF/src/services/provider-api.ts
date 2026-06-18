import type { Env, TokenResult } from '../types';
import { getCredentials } from '../utils/credentials';

/**
 * Handles the actual OAuth2 flows with external scrobbler providers.
 *
 * Maps 1:1 to ProviderApiService.cs.
 * - generateAuthUrl()   → GenerateAuthUrlAsync()
 * - exchangeCode()      → ExchangeCodeAsync()
 * - refreshToken()      → RefreshTokenAsync()
 *
 * Reads client_id + client_secret from env/secrets (via getCredentials).
 * Never stores them — only uses them for the token exchange.
 *
 * PKCE support (MyAnimeList):
 *   MyAnimeList requires PKCE with S256 challenge method.
 *   https://myanimelist.net/apiconfig/references/authorization
 *   RFC 7636: code_verifier uses unreserved chars, sent as-is in form body
 */

/**
 * Provider-specific auth URL builder.
 * For MyAnimeList, includes code_challenge parameter for PKCE.
 */
export function generateAuthUrl(
  provider: string,
  redirectUri: string,
  state: string,
  env: Env,
  codeChallenge?: string
): string {
  const { clientId } = getCredentials(provider, env);
  const encodedRedirect = encodeURIComponent(redirectUri);
  const lower = provider.toLowerCase();

  switch (lower) {
    case 'anilist':
      return `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&redirect_uri=${encodedRedirect}&response_type=code&state=${state}`;

    case 'myanimelist': {
      // MyAnimeList requires PKCE (S256) per RFC 7636
      // Some implementations require lowercase method name
      const encodedChallenge = codeChallenge ? encodeURIComponent(codeChallenge) : '';
      // plain method: MAL accepts S256 in the request but fails to verify it server-side
      return `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodedRedirect}&state=${state}&code_challenge_method=plain&code_challenge=${encodedChallenge}`;
    }

    case 'kitsu':
      return `https://kitsu.io/api/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodedRedirect}&state=${state}`;

    case 'mangadex':
      return `https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodedRedirect}&state=${state}&scope=openid`;

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Token URL map — used by both exchangeCode and refreshToken.
 */
function getTokenUrl(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'anilist':
      return 'https://anilist.co/api/v2/oauth/token';
    case 'myanimelist':
      return 'https://myanimelist.net/v1/oauth2/token';
    case 'kitsu':
      return 'https://kitsu.io/api/oauth/token';
    case 'mangadex':
      return 'https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Exchanges an authorization code for access/refresh tokens.
 * For MyAnimeList, includes the code_verifier for PKCE.
 *
 * Uses manually constructed form body string to ensure exact encoding
 * of code_verifier (URLSearchParams may behave differently across runtimes).
 */
export async function exchangeCode(
  provider: string,
  code: string,
  redirectUri: string,
  env: Env,
  codeVerifier?: string
): Promise<TokenResult> {
  const { clientId, clientSecret } = getCredentials(provider, env);
  const tokenUrl = getTokenUrl(provider);

  // Build form body with proper URL-encoding of each value
  // Build form body using URLSearchParams for proper encoding
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('redirect_uri', redirectUri);
  params.append('code', code);

  if (codeVerifier) {
    params.append('code_verifier', codeVerifier);
  }

  const body = params.toString();

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[PKCE] exchangeCode FAILED - ${provider}: status=${response.status}, body=${errorBody}`);
    throw new Error(`Token exchange failed: ${response.status} ${errorBody}`);
  }

  const json = await response.json<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>();

  const accessToken = json.access_token ?? '';
  const refreshToken = json.refresh_token ?? null;
  const expiresIn = json.expires_in ?? 3600;

  // Calculate expiry as ISO 8601 datetime (matching original DateTime.UtcNow.AddSeconds)
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  console.log(`[PKCE] exchangeCode SUCCESS - ${provider}: token received, expiresIn=${expiresIn}`);
  return { accessToken, refreshToken, expiresAt };
}

/**
 * Refreshes an expired access token using a refresh token.
 */
export async function refreshToken(
  provider: string,
  token: string,
  env: Env
): Promise<TokenResult> {
  const { clientId, clientSecret } = getCredentials(provider, env);
  const tokenUrl = getTokenUrl(provider);

  const params: string[] = [
    `grant_type=refresh_token`,
    `client_id=${clientId}`,
    `client_secret=${clientSecret}`,
    `refresh_token=${token}`,
  ];

  const body = params.join('&');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorBody}`);
  }

  const json = await response.json<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>();

  const accessToken = json.access_token ?? '';
  // Keep old refresh token if provider doesn't issue a new one
  const newRefreshToken = json.refresh_token ?? token;
  const expiresIn = json.expires_in ?? 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return { accessToken, refreshToken: newRefreshToken, expiresAt };
}