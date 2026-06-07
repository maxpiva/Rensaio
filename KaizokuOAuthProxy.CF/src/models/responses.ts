/**
 * Response DTOs — maps 1:1 to the original ASP.NET Core DTOs.
 *
 * Original files:
 *   - ErrorResponseDto.cs
 *   - OAuthUrlResponseDto.cs
 *   - TokenRetrieveResponseDto.cs
 *   - TokenRefreshResponseDto.cs
 */

/**
 * Maps 1:1 to ErrorResponseDto.cs
 */
export interface ErrorResponse {
  error: string;
}

/**
 * Maps 1:1 to OAuthUrlResponseDto.cs
 */
export interface OAuthUrlResponse {
  authUrl: string;
  state: string;
}

/**
 * Maps 1:1 to TokenRetrieveResponseDto.cs
 */
export interface TokenRetrieveResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null; // ISO 8601 datetime
}

/**
 * Maps 1:1 to TokenRefreshResponseDto.cs
 */
export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null; // ISO 8601 datetime
}