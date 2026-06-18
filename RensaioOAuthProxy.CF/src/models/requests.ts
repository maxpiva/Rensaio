/**
 * Request DTOs — maps 1:1 to the original ASP.NET Core DTOs.
 *
 * Original files:
 *   - TokenRetrieveRequestDto.cs
 *   - TokenRefreshRequestDto.cs
 */

/**
 * Maps 1:1 to TokenRetrieveRequestDto.cs
 */
export interface TokenRetrieveRequest {
  state: string;
}

/**
 * Maps 1:1 to TokenRefreshRequestDto.cs
 */
export interface TokenRefreshRequest {
  refreshToken: string;
}