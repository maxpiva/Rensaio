/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker environment bindings.
 * Maps 1:1 to appsettings.json + env vars + secrets in the original ASP.NET Core codebase.
 */
export interface Env {
  // D1 database binding
  DB: D1Database;

  // Client IDs (public — set via wrangler.toml [vars])
  PROXY_ANILIST_CLIENT_ID: string;
  PROXY_MYANIMELIST_CLIENT_ID: string;
  PROXY_KITSU_CLIENT_ID: string;
  PROXY_MANGADEX_CLIENT_ID: string;

  // Client Secrets (sensitive — set via wrangler secret put)
  PROXY_ANILIST_CLIENT_SECRET: string;
  PROXY_MYANIMELIST_CLIENT_SECRET: string;
  PROXY_KITSU_CLIENT_SECRET: string;
  PROXY_MANGADEX_CLIENT_SECRET: string;
}

/**
 * Supported OAuth provider identifiers.
 */
export type ProviderName = 'anilist' | 'myanimelist' | 'kitsu' | 'mangadex';

/**
 * Result of a token exchange or refresh operation.
 * Maps 1:1 to TokenResult class in ProviderApiService.cs.
 */
export interface TokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO 8601 datetime
}

/**
 * Normalized provider display names.
 */
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anilist: 'AniList',
  myanimelist: 'MyAnimeList',
  kitsu: 'Kitsu',
  mangadex: 'MangaDex',
};

/**
 * List of all supported providers for validation.
 */
export const SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set([
  'anilist',
  'myanimelist',
  'kitsu',
  'mangadex',
]);