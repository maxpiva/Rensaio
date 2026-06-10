using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Auth;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Services.Users;

/// <summary>
/// Service for creating, updating, and deleting user records.
/// </summary>
public class UserCommandService
{
    private readonly AppDbContext _db;
    private readonly PasswordService _passwordService;
    private readonly OpdsPathGenerator _opdsPathGenerator;
    private readonly UserQueryService _userQueryService;

    public UserCommandService(AppDbContext db, PasswordService passwordService, OpdsPathGenerator opdsPathGenerator, UserQueryService userQueryService)
    {
        _db = db;
        _passwordService = passwordService;
        _opdsPathGenerator = opdsPathGenerator;
        _userQueryService = userQueryService;
    }

    /// <summary>
    /// Creates a new user with an auto-generated OPDS path.
    /// </summary>
    public async Task<UserEntity> CreateUserAsync(string username, UserLevel level, CancellationToken token = default)
    {
        // If trying to create an Owner, ensure one doesn't already exist
        if (level == UserLevel.Owner && await _userQueryService.OwnerExistsAsync(token))
            throw new InvalidOperationException("An owner already exists. Only one owner is allowed.");

        string opdsPath = await _opdsPathGenerator.GenerateUniquePathAsync();

        var user = new UserEntity
        {
            Id = Guid.NewGuid(),
            Username = username,
            Level = level,
            OpdsPath = opdsPath,
            CreatedAt = DateTime.UtcNow,
            IsActive = true
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(token);
        return user;
    }

    /// <summary>
    /// Sets a user's password (hashes and stores it).
    /// </summary>
    public async Task SetPasswordAsync(UserEntity user, string password, CancellationToken token = default)
    {
        user.PasswordHash = _passwordService.HashPassword(password, out string salt);
        user.Salt = salt;
        user.PasswordSetToken = null; // Clear any pending invite token
        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Changes a user's password after verifying current password.
    /// </summary>
    public async Task<bool> ChangePasswordAsync(UserEntity user, string currentPassword, string newPassword, CancellationToken token = default)
    {
        if (string.IsNullOrWhiteSpace(user.PasswordHash) || string.IsNullOrWhiteSpace(user.Salt))
            return false;

        if (!_passwordService.VerifyPassword(currentPassword, user.PasswordHash, user.Salt))
            return false;

        user.PasswordHash = _passwordService.HashPassword(newPassword, out string salt);
        user.Salt = salt;
        await _db.SaveChangesAsync(token);
        return true;
    }

    /// <summary>
    /// Updates user fields (level, active status, avatar).
    /// </summary>
    public async Task UpdateUserAsync(UserEntity user, UserLevel? level = null, bool? isActive = null,
        byte[]? avatarBlob = null, string? avatarContentType = null, bool? removeAvatar = null,
        CancellationToken token = default)
    {
        // If promoting a user to Owner, ensure one doesn't already exist
        if (level == UserLevel.Owner && await _userQueryService.OwnerExistsAsync(token))
            throw new InvalidOperationException("An owner already exists. Only one owner is allowed.");

        if (level.HasValue)
            user.Level = level.Value;

        if (isActive.HasValue)
            user.IsActive = isActive.Value;

        if (removeAvatar == true)
        {
            user.AvatarBlob = null;
            user.AvatarContentType = null;
        }
        else if (avatarBlob != null)
        {
            user.AvatarBlob = avatarBlob;
            user.AvatarContentType = avatarContentType;
        }

        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Deletes a user from the database.
    /// </summary>
    public async Task DeleteUserAsync(UserEntity user, CancellationToken token = default)
    {
        _db.Users.Remove(user);
        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Promotes a user to owner. Used during initial setup when claiming auto-created users.
    /// </summary>
    public async Task PromoteToOwnerAsync(UserEntity user, CancellationToken token = default)
    {
        if (await _userQueryService.OwnerExistsAsync(token))
            throw new InvalidOperationException("An owner already exists. Only one owner is allowed.");

        user.Level = UserLevel.Owner;
        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Updates the user's last login timestamp.
    /// </summary>
    public async Task UpdateLastLoginAsync(UserEntity user, CancellationToken token = default)
    {
        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Stores a refresh token hash for remember-me functionality.
    /// </summary>
    public async Task StoreRefreshTokenAsync(UserEntity user, string refreshTokenHash, DateTime expiresAt, CancellationToken token = default)
    {
        user.RefreshTokenHash = refreshTokenHash;
        user.RefreshTokenExpiresAt = expiresAt;
        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Clears the stored refresh token (for logout).
    /// </summary>
    public async Task ClearRefreshTokenAsync(UserEntity user, CancellationToken token = default)
    {
        user.RefreshTokenHash = null;
        user.RefreshTokenExpiresAt = null;
        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Regenerates a user's OPDS path to a new unique value.
    /// </summary>
    public async Task<string> RegenerateOpdsPathAsync(UserEntity user, CancellationToken token = default)
    {
        string newPath = await _opdsPathGenerator.GenerateUniquePathAsync();
        user.OpdsPath = newPath;
        await _db.SaveChangesAsync(token);
        return newPath;
    }
}