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
 */

/**
 * Maps 1:1 to ProviderApiService.GenerateAuthUrlAsync() lines 62-76.
 *
 * Provider-specific auth URLs (all use response_type=code):
 *
 *   AniList:    https://anilist.co/api/v2/oauth/authorize
 *   MyAnimeList: https://myanimelist.net/v1/oauth2/authorize
 *   Kitsu:      https://kitsu.io/api/oauth/authorize
 *   MangaDex:   https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/auth  (+ scope=openid)
 */
export function generateAuthUrl(
  provider: string,
  redirectUri: string,
  state: string,
  env: Env
): string {
  const { clientId } = getCredentials(provider, env);
  const encodedRedirect = encodeURIComponent(redirectUri);
  const lower = provider.toLowerCase();

  switch (lower) {
    case 'anilist':
      return `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&redirect_uri=${encodedRedirect}&response_type=code&state=${state}`;

    case 'myanimelist':
      return `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodedRedirect}&state=${state}`;

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
 * Maps 1:1 to ProviderApiService.ExchangeCodeAsync() lines 81-118.
 *
 * Exchanges an authorization code for access/refresh tokens.
 * Uses application/x-www-form-urlencoded POST body with grant_type=authorization_code.
 */
export async function exchangeCode(
  provider: string,
  code: string,
  redirectUri: string,
  env: Env
): Promise<TokenResult> {
  const { clientId, clientSecret } = getCredentials(provider, env);
  const tokenUrl = getTokenUrl(provider);

  const formData = new URLSearchParams();
  formData.append('grant_type', 'authorization_code');
  formData.append('client_id', clientId);
  formData.append('client_secret', clientSecret);
  formData.append('redirect_uri', redirectUri);
  formData.append('code', code);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
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

  return { accessToken, refreshToken, expiresAt };
}

/**
 * Maps 1:1 to ProviderApiService.RefreshTokenAsync() lines 123-159.
 *
 * Refreshes an expired access token using a refresh token.
 * Uses application/x-www-form-urlencoded POST body with grant_type=refresh_token.
 */
export async function refreshToken(
  provider: string,
  token: string,
  env: Env
): Promise<TokenResult> {
  const { clientId, clientSecret } = getCredentials(provider, env);
  const tokenUrl = getTokenUrl(provider);

  const formData = new URLSearchParams();
  formData.append('grant_type', 'refresh_token');
  formData.append('client_id', clientId);
  formData.append('client_secret', clientSecret);
  formData.append('refresh_token', token);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
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