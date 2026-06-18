using RensaioBackend.Data;
using RensaioBackend.Models;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Auth;
using Microsoft.EntityFrameworkCore;

namespace RensaioBackend.Services.Import;

/// <summary>
/// Service that scans rensaio.json files during import and auto-creates users
/// from UserReadState data. Also tracks which users were auto-created for the
/// setup wizard's "Identify Yourself" step.
/// </summary>
public class UserImportService
{
    private readonly AppDbContext _db;
    private readonly OpdsPathGenerator _opdsPathGenerator;

    public UserImportService(AppDbContext db, OpdsPathGenerator opdsPathGenerator)
    {
        _db = db;
        _opdsPathGenerator = opdsPathGenerator;
    }

    /// <summary>
    /// Scans all import entries for UserReadStates in rensaio.json snapshots
    /// and auto-creates any users that don't already exist in the database.
    /// Returns the list of auto-created usernames.
    /// </summary>
    public async Task<List<string>> AutoCreateUsersFromImportAsync(CancellationToken token = default)
    {
        var autoCreated = new List<string>();

        // Load all imports that have info with UserReadStates
        var imports = await _db.Imports
            .Where(i => i.Status == ImportStatus.Import || i.Status == ImportStatus.DoNotChange)
            .ToListAsync(token);

        // Collect all unique usernames from UserReadStates across all imports
        var usernamesToCreate = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var import in imports)
        {
            var snapshot = import.Info;
            if (snapshot?.UserReadStates == null)
                continue;

            foreach (var userState in snapshot.UserReadStates)
            {
                if (!string.IsNullOrWhiteSpace(userState.Username))
                    usernamesToCreate.Add(userState.Username);
            }
        }

        // Create users that don't exist yet
        foreach (string username in usernamesToCreate)
        {
            bool exists = await _db.Users.AnyAsync(u => u.Username == username, token);
            if (!exists)
            {
                string opdsPath = await _opdsPathGenerator.GenerateUniquePathAsync();
                var user = new UserEntity
                {
                    Id = Guid.NewGuid(),
                    Username = username,
                    Level = UserLevel.User, // Auto-created users start as regular users
                    OpdsPath = opdsPath,
                    CreatedAt = DateTime.UtcNow,
                    IsActive = true
                };
                _db.Users.Add(user);
                await _db.SaveChangesAsync(token);
                autoCreated.Add(username);
            }
        }

        return autoCreated;
    }

    /// <summary>
    /// Gets whether the import process found any user read states that would
    /// trigger auto-creation. Used by the wizard to determine which step to show.
    /// </summary>
    public async Task<bool> HasImportUserReadStatesAsync(CancellationToken token = default)
    {
        var imports = await _db.Imports
            .Where(i => i.Status == ImportStatus.Import || i.Status == ImportStatus.DoNotChange)
            .ToListAsync(token);

        return imports.Any(i => i.Info?.UserReadStates?.Count > 0);
    }

    /// <summary>
    /// Gets the list of usernames that were auto-created during the most recent import.
    /// </summary>
    public async Task<List<string>> GetAutoCreatedUsernamesAsync(CancellationToken token = default)
    {
        // Users created during this session are tracked by the caller
        // This method is a placeholder; the auto-created list is returned by AutoCreateUsersFromImportAsync
        return [];
    }
}