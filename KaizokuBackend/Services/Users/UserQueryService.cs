using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Enums;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Services.Auth;

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
    /// Gets the first admin user. Used for password reset flow.
    /// </summary>
    public async Task<UserEntity?> GetFirstAdminAsync(CancellationToken token = default)
    {
        return await _db.Users
            .Where(u => u.Level == UserLevel.Admin)
            .OrderBy(u => u.CreatedAt)
            .FirstOrDefaultAsync(token);
    }
}