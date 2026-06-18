/**
 * PKCE (Proof Key for Code Exchange) utilities.
 *
 * RFC 7636: https://datatracker.ietf.org/doc/html/rfc7636
 * MyAnimeList's OAuth2 flow requires PKCE with S256 challenge method.
 *
 * Uses only alphanumeric characters for the verifier to avoid any
 * encoding edge cases with base64url symbols (-, _).
 */

const DECODER = new TextEncoder();

/**
 * Generates a cryptographically random code verifier.
 * Uses alphanumeric chars only to avoid encoding issues.
 * 43 characters (minimum per RFC 7636).
 */
export function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(43);
  crypto.getRandomValues(array);
  let result = '';
  for (let i = 0; i < 43; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/**
 * Computes the S256 code challenge from the given code_verifier.
 * challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', DECODER.encode(verifier));
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Base64url encoding per RFC 4648 section 5.
 * No padding, replace +/ with -_.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Verifies a code_verifier against a code_challenge.
 */
export async function verifyCodeChallenge(verifier: string, challenge: string): Promise<boolean> {
  const computed = await generateCodeChallenge(verifier);
  return computed === challenge;
}