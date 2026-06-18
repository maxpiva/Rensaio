using RensaioBackend.Data;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Enums;
using Microsoft.EntityFrameworkCore;

namespace RensaioBackend.Services.Auth;

/// <summary>
/// Service for querying user data.
/// </summary>
public class UserQueryService
{
    private readonly AppDbContext _db;

    public UserQueryService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<UserEntity>> ListUsersAsync(CancellationToken token = default)
    {
        return await _db.Users.OrderBy(u => u.Username).ToListAsync(token);
    }

    public async Task<UserEntity?> GetByIdAsync(Guid id, CancellationToken token = default)
    {
        return await _db.Users.FindAsync(new object[] { id }, token);
    }

    public async Task<UserEntity?> GetByUsernameAsync(string username, CancellationToken token = default)
    {
        return await _db.Users.FirstOrDefaultAsync(u => u.Username == username, token);
    }

    public async Task<UserEntity?> GetByOpdsPathAsync(string opdsPath, CancellationToken token = default)
    {
        return await _db.Users.FirstOrDefaultAsync(u => u.OpdsPath == opdsPath, token);
    }

    public async Task<bool> AnyUsersExistAsync(CancellationToken token = default)
    {
        return await _db.Users.AnyAsync(token);
    }

    public async Task<bool> AnyUserHasPasswordAsync(CancellationToken token = default)
    {
        return await _db.Users.AnyAsync(u => !string.IsNullOrWhiteSpace(u.PasswordHash), token);
    }

    public async Task<int> GetUserCountAsync(CancellationToken token = default)
    {
        return await _db.Users.CountAsync(token);
    }

    /// <summary>
    /// Gets the owner user. Used for authorization checks.
    /// </summary>
    public async Task<UserEntity?> GetOwnerAsync(CancellationToken token = default)
    {
        return await _db.Users
            .Where(u => u.Level == UserLevel.Owner)
            .FirstOrDefaultAsync(token);
    }

    /// <summary>
    /// Checks if an owner user already exists.
    /// </summary>
    public async Task<bool> OwnerExistsAsync(CancellationToken token = default)
    {
        return await _db.Users.AnyAsync(u => u.Level == UserLevel.Owner, token);
    }
}