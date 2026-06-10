using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling;

/// <summary>
/// Encrypts and persists OAuth tokens to the database.
/// Single responsibility: token storage only (load, encrypt, decrypt, persist).
/// Does NOT handle token refresh or lifecycle — that's the provider's responsibility.
/// </summary>
public class TokenStorageService : ITokenStorageService
{
    private readonly AppDbContext _db;
    private readonly ScrobblerTokenProtector _protector;
    private readonly ILogger<TokenStorageService> _logger;

    public TokenStorageService(
        AppDbContext db,
        ScrobblerTokenProtector protector,
        ILogger<TokenStorageService> logger)
    {
        _db = db;
        _protector = protector;
        _logger = logger;
    }

    public async Task StoreTokenResultAsync(Guid userId, ScrobblerProvider providerType,
        ScrobblerTokenResult tokenResult, CancellationToken token = default)
    {
        var encryptedAccess = _protector.Encrypt(tokenResult.AccessToken!);
        var encryptedRefresh = tokenResult.RefreshToken != null
            ? _protector.Encrypt(tokenResult.RefreshToken)
            : null;

        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == providerType, token);

        if (config != null)
        {
            config.AccessToken = encryptedAccess;
            config.RefreshToken = encryptedRefresh;
            config.TokenExpiresAt = tokenResult.ExpiresAt;
            config.IsEnabled = true;
        }
        else
        {
            _db.UserScrobblerConfigs.Add(new UserScrobblerConfigEntity
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Provider = providerType,
                AccessToken = encryptedAccess,
                RefreshToken = encryptedRefresh,
                TokenExpiresAt = tokenResult.ExpiresAt,
                IsEnabled = true,
                AutoSync = true
            });
        }

        await _db.SaveChangesAsync(token);
    }

    public async Task<string?> GetRefreshTokenAsync(Guid userId, ScrobblerProvider providerType,
        CancellationToken token = default)
    {
        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == providerType, token);

        if (config?.RefreshToken == null) return null;

        try
        {
            return _protector.Decrypt(config.RefreshToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decrypt refresh token for {Provider} user {UserId}", providerType, userId);
            return null;
        }
    }

    public async Task<(string? accessToken, string? refreshToken, DateTime? expiresAt)> LoadTokensAsync(
        Guid userId, ScrobblerProvider providerType, CancellationToken token = default)
    {
        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == providerType, token);

        if (config == null) return (null, null, null);

        string? accessToken = null;
        string? refreshToken = null;

        try
        {
            if (config.AccessToken != null)
                accessToken = _protector.Decrypt(config.AccessToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decrypt access token for {Provider} user {UserId}", providerType, userId);
        }

        try
        {
            if (config.RefreshToken != null)
                refreshToken = _protector.Decrypt(config.RefreshToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decrypt refresh token for {Provider} user {UserId}", providerType, userId);
        }

        return (accessToken, refreshToken, config.TokenExpiresAt);
    }

    public async Task PersistRefreshedTokensAsync(Guid userId, ScrobblerProvider providerType,
        string encryptedAccessToken, string? encryptedRefreshToken, DateTime? expiresAt,
        CancellationToken token = default)
    {
        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == providerType, token);

        if (config == null)
        {
            _logger.LogWarning("No config found to persist refreshed tokens for {Provider} user {UserId}",
                providerType, userId);
            return;
        }

        config.AccessToken = encryptedAccessToken;
        if (encryptedRefreshToken != null)
            config.RefreshToken = encryptedRefreshToken;
        if (expiresAt.HasValue)
            config.TokenExpiresAt = expiresAt;

        await _db.SaveChangesAsync(token);
    }
}