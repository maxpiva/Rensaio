/// <reference types="@cloudflare/workers-types" />

/**
 * Represents a row in the `oauth_sessions` D1 table.
 * Maps 1:1 to TokenStoreEntry in the original ASP.NET Core codebase.
 */
export interface OAuthSession {
  state: string;
  instance_key: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;   // ISO 8601 datetime
  created_at: string;          // ISO 8601 datetime
}