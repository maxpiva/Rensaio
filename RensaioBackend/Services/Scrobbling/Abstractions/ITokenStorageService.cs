using RensaioBackend.Models.Enums;

namespace RensaioBackend.Services.Scrobbling.Abstractions;

/// <summary>
/// Lightweight service for persisting OAuth token results after initial auth or refresh.
/// Single responsibility: encrypt + store tokens to the database.
/// Used by the controller callback flow and by provider EnsureAuthenticatedAsync implementations.
/// </summary>
public interface ITokenStorageService
{
    /// <summary>
    /// Encrypts and stores the initial OAuth token result for a user+provider.
    /// Creates a new config row or updates an existing one.
    /// </summary>
    Task StoreTokenResultAsync(Guid userId, ScrobblerProvider providerType,
        ScrobblerTokenResult tokenResult, CancellationToken token = default);

    /// <summary>
    /// Loads and decrypts the stored refresh token for a user+provider.
    /// Returns null if no refresh token exists.
    /// </summary>
    Task<string?> GetRefreshTokenAsync(Guid userId, ScrobblerProvider providerType,
        CancellationToken token = default);

    /// <summary>
    /// Loads and decrypts the stored refresh token and also the access token + expiry for a user+provider.
    /// Returns all three, or nulls for missing values.
    /// </summary>
    Task<(string? accessToken, string? refreshToken, DateTime? expiresAt)> LoadTokensAsync(
        Guid userId, ScrobblerProvider providerType, CancellationToken token = default);

    /// <summary>
    /// Persists refreshed tokens (access + optional refresh + optional expiry) for a user+provider.
    /// The tokens must already be encrypted before calling this method.
    /// </summary>
    Task PersistRefreshedTokensAsync(Guid userId, ScrobblerProvider providerType,
        string encryptedAccessToken, string? encryptedRefreshToken, DateTime? expiresAt,
        CancellationToken token = default);
}