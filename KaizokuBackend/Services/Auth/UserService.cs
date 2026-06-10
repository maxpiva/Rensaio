using KaizokuBackend.Authorization;
using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto.Auth;
using KaizokuBackend.Models.Enums;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace KaizokuBackend.Services.Auth
{
    public class UserService
    {
        private readonly AppDbContext _db;
        private readonly ILogger<UserService> _logger;
        private readonly OpdsPathGenerator _opdsPathGenerator;

        public UserService(AppDbContext db, ILogger<UserService> logger, OpdsPathGenerator opdsPathGenerator)
        {
            _db = db;
            _logger = logger;
            _opdsPathGenerator = opdsPathGenerator;
        }

        public async Task<List<UserDetailDto>> GetAllAsync(CancellationToken token = default)
        {
            var users = await _db.Users
                .AsNoTracking()
                .Include(u => u.Permissions)
                .OrderBy(u => u.Username)
                .ToListAsync(token)
                .ConfigureAwait(false);

            return users.Select(MapToDetailDto).ToList();
        }

        public async Task<UserDetailDto?> GetByIdAsync(Guid id, CancellationToken token = default)
        {
            var user = await _db.Users
                .AsNoTracking()
                .Include(u => u.Permissions)
                .Include(u => u.Preferences)
                .FirstOrDefaultAsync(u => u.Id == id, token)
                .ConfigureAwait(false);

            return user != null ? MapToDetailDto(user) : null;
        }

        public async Task<UserDto?> GetByUsernameAsync(string username, CancellationToken token = default)
        {
            var user = await _db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Username == username, token)
                .ConfigureAwait(false);

            return user != null ? AuthService.MapUserDto(user) : null;
        }

        /// <summary>
        /// Looks up a user by email address. Retained for backfill/transition only.
        /// </summary>
        [Obsolete("Email lookup is retained for backfill/transition. Use GetByUsernameAsync instead.")]
        public async Task<UserDto?> GetByEmailAsync(string email, CancellationToken token = default)
        {
            var user = await _db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Email == email.ToLowerInvariant(), token)
                .ConfigureAwait(false);

            return user != null ? AuthService.MapUserDto(user) : null;
        }

        public async Task<UserDetailDto> CreateAsync(CreateUserDto dto, CancellationToken token = default)
        {
            var existing = await _db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Username == dto.Username, token)
                .ConfigureAwait(false);

            if (existing != null)
                throw new InvalidOperationException("Username is already taken.");

            string? passwordHash = null;
            string? salt = null;

            if (!string.IsNullOrWhiteSpace(dto.Password))
            {
                var passwordError = PasswordPolicy.Validate(dto.Password);
                if (passwordError != null)
                    throw new InvalidOperationException(passwordError);

                salt = GenerateSalt();
                passwordHash = HashPassword(dto.Password, salt);
            }

            var opdsPath = await _opdsPathGenerator.GenerateUniqueAsync(token).ConfigureAwait(false);
            var user = new UserEntity
            {
                Id = Guid.NewGuid(),
                Username = dto.Username.Trim(),
                DisplayName = string.IsNullOrWhiteSpace(dto.DisplayName) ? dto.Username : dto.DisplayName.Trim(),
                PasswordHash = passwordHash,
                Salt = salt,
                Role = dto.Role,
                Level = dto.Role == UserRole.Admin ? UserLevel.Admin : UserLevel.User,
                OpdsPath = opdsPath,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                IsActive = true
            };

            _db.Users.Add(user);

            var permissions = new UserPermissionEntity { UserId = user.Id };

            // Preset (when chosen) forms the permission base; an explicit Permissions
            // object below overrides it, and the Admin role overrides everything.
            if (dto.PermissionPresetId != null)
            {
                var preset = await _db.PermissionPresets
                    .AsNoTracking()
                    .FirstOrDefaultAsync(p => p.Id == dto.PermissionPresetId.Value, token)
                    .ConfigureAwait(false);

                if (preset == null)
                    throw new InvalidOperationException("Permission preset not found.");

                permissions.CanViewLibrary = preset.CanViewLibrary;
                permissions.CanRequestSeries = preset.CanRequestSeries;
                permissions.CanAddSeries = preset.CanAddSeries;
                permissions.CanEditSeries = preset.CanEditSeries;
                permissions.CanDeleteSeries = preset.CanDeleteSeries;
                permissions.CanManageDownloads = preset.CanManageDownloads;
                permissions.CanViewQueue = preset.CanViewQueue;
                permissions.CanBrowseSources = preset.CanBrowseSources;
                permissions.CanViewNSFW = preset.CanViewNSFW;
                permissions.CanManageRequests = preset.CanManageRequests;
                permissions.CanManageJobs = preset.CanManageJobs;
                permissions.CanViewStatistics = preset.CanViewStatistics;
            }

            if (dto.Permissions != null)
            {
                permissions.CanViewLibrary = dto.Permissions.CanViewLibrary;
                permissions.CanRequestSeries = dto.Permissions.CanRequestSeries;
                permissions.CanAddSeries = dto.Permissions.CanAddSeries;
                permissions.CanEditSeries = dto.Permissions.CanEditSeries;
                permissions.CanDeleteSeries = dto.Permissions.CanDeleteSeries;
                permissions.CanManageDownloads = dto.Permissions.CanManageDownloads;
                permissions.CanViewQueue = dto.Permissions.CanViewQueue;
                permissions.CanBrowseSources = dto.Permissions.CanBrowseSources;
                permissions.CanViewNSFW = dto.Permissions.CanViewNSFW;
                permissions.CanManageRequests = dto.Permissions.CanManageRequests;
                permissions.CanManageJobs = dto.Permissions.CanManageJobs;
                permissions.CanViewStatistics = dto.Permissions.CanViewStatistics;
            }

            // Admin users get all permissions
            if (dto.Role == UserRole.Admin)
            {
                permissions.CanViewLibrary = true;
                permissions.CanRequestSeries = true;
                permissions.CanAddSeries = true;
                permissions.CanEditSeries = true;
                permissions.CanDeleteSeries = true;
                permissions.CanManageDownloads = true;
                permissions.CanViewQueue = true;
                permissions.CanBrowseSources = true;
                permissions.CanViewNSFW = true;
                permissions.CanManageRequests = true;
                permissions.CanManageJobs = true;
                permissions.CanViewStatistics = true;
            }

            _db.UserPermissions.Add(permissions);

            var preferences = new UserPreferencesEntity { UserId = user.Id };
            _db.UserPreferences.Add(preferences);

            await _db.SaveChangesAsync(token).ConfigureAwait(false);

            // Invalidate bootstrap mode cache since a user now exists
            BootstrapModeMiddleware.InvalidateCache();

            user.Permissions = permissions;
            return MapToDetailDto(user);
        }

        public async Task<UserDetailDto> UpdateAsync(Guid id, UpdateUserDto dto, CancellationToken token = default)
        {
            var user = await _db.Users
                .Include(u => u.Permissions)
                .FirstOrDefaultAsync(u => u.Id == id, token)
                .ConfigureAwait(false);

            if (user == null)
                throw new InvalidOperationException("User not found.");

            if (dto.DisplayName != null)
                user.DisplayName = dto.DisplayName.Trim();

            if (dto.Role.HasValue)
            {
                user.Role = dto.Role.Value;
                // Keep Level in sync with Role for backward-compatibility.
                user.Level = dto.Role.Value == UserRole.Admin ? UserLevel.Admin : UserLevel.User;
            }

            if (dto.IsActive.HasValue)
                user.IsActive = dto.IsActive.Value;

            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);

            return MapToDetailDto(user);
        }

        public async Task DeleteAsync(Guid id, CancellationToken token = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id, token).ConfigureAwait(false);
            if (user == null)
                throw new InvalidOperationException("User not found.");

            // Delete all related data
            var sessions = await _db.UserSessions.Where(s => s.UserId == id).ToListAsync(token).ConfigureAwait(false);
            _db.UserSessions.RemoveRange(sessions);

            var permissions = await _db.UserPermissions.FirstOrDefaultAsync(p => p.UserId == id, token).ConfigureAwait(false);
            if (permissions != null) _db.UserPermissions.Remove(permissions);

            var preferences = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == id, token).ConfigureAwait(false);
            if (preferences != null) _db.UserPreferences.Remove(preferences);

            var requests = await _db.MangaRequests.Where(r => r.RequestedByUserId == id).ToListAsync(token).ConfigureAwait(false);
            _db.MangaRequests.RemoveRange(requests);

            _db.Users.Remove(user);
            await _db.SaveChangesAsync(token).ConfigureAwait(false);

            // Invalidate bootstrap cache so the system can re-enter setup mode if all users are deleted
            BootstrapModeMiddleware.InvalidateCache();
        }

        public async Task DisableAsync(Guid id, CancellationToken token = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id, token).ConfigureAwait(false);
            if (user == null) throw new InvalidOperationException("User not found.");

            user.IsActive = false;
            user.UpdatedAt = DateTime.UtcNow;

            // Revoke all sessions
            var sessions = await _db.UserSessions.Where(s => s.UserId == id && !s.IsRevoked).ToListAsync(token).ConfigureAwait(false);
            foreach (var session in sessions)
                session.IsRevoked = true;

            await _db.SaveChangesAsync(token).ConfigureAwait(false);
        }

        public async Task EnableAsync(Guid id, CancellationToken token = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id, token).ConfigureAwait(false);
            if (user == null) throw new InvalidOperationException("User not found.");

            user.IsActive = true;
            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);
        }

        public async Task ResetPasswordAsync(Guid id, string newPassword, CancellationToken token = default)
        {
            var passwordError = PasswordPolicy.Validate(newPassword);
            if (passwordError != null)
                throw new InvalidOperationException(passwordError);

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id, token).ConfigureAwait(false);
            if (user == null) throw new InvalidOperationException("User not found.");

            var salt = GenerateSalt();
            user.PasswordHash = HashPassword(newPassword, salt);
            user.Salt = salt;
            user.UpdatedAt = DateTime.UtcNow;

            // Revoke all sessions
            var sessions = await _db.UserSessions.Where(s => s.UserId == id && !s.IsRevoked).ToListAsync(token).ConfigureAwait(false);
            foreach (var session in sessions)
                session.IsRevoked = true;

            await _db.SaveChangesAsync(token).ConfigureAwait(false);
        }

        public async Task<UserDetailDto> UpdateProfileAsync(Guid userId, UpdateUserDto dto, CancellationToken token = default)
        {
            // Returns the full detail DTO (incl. permissions/preferences): the frontend
            // replaces its auth-context user with this response, and a permissions-less
            // payload would blank out every permission-gated UI element.
            var user = await _db.Users
                .Include(u => u.Permissions)
                .Include(u => u.Preferences)
                .FirstOrDefaultAsync(u => u.Id == userId, token)
                .ConfigureAwait(false);
            if (user == null) throw new InvalidOperationException("User not found.");

            if (dto.DisplayName != null)
                user.DisplayName = dto.DisplayName.Trim();

            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);
            return MapToDetailDto(user);
        }

        public async Task ChangePasswordAsync(Guid userId, ChangePasswordDto dto, CancellationToken token = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, token).ConfigureAwait(false);
            if (user == null) throw new InvalidOperationException("User not found.");

            if (user.PasswordHash == null || user.Salt == null)
                throw new InvalidOperationException("This account does not use password-based authentication.");

            if (!VerifyPassword(dto.CurrentPassword, user.PasswordHash!, user.Salt!))
                throw new InvalidOperationException("Current password is incorrect.");

            var passwordError = PasswordPolicy.Validate(dto.NewPassword);
            if (passwordError != null)
                throw new InvalidOperationException(passwordError);

            var salt = GenerateSalt();
            user.PasswordHash = HashPassword(dto.NewPassword, salt);
            user.Salt = salt;
            user.UpdatedAt = DateTime.UtcNow;

            // Revoke all existing sessions so stolen tokens can't be reused
            var sessions = await _db.UserSessions.Where(s => s.UserId == userId && !s.IsRevoked).ToListAsync(token).ConfigureAwait(false);
            foreach (var session in sessions)
                session.IsRevoked = true;

            await _db.SaveChangesAsync(token).ConfigureAwait(false);
        }

        private static readonly HashSet<string> AllowedAvatarContentTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "image/png", "image/jpeg", "image/gif", "image/webp"
        };

        /// <summary>
        /// Stores an avatar as a blob from a base64-encoded string.
        /// </summary>
        public async Task<string?> UploadAvatarAsync(Guid userId, string base64Data, string contentType, CancellationToken token = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, token).ConfigureAwait(false);
            if (user == null) throw new InvalidOperationException("User not found.");

            if (string.IsNullOrWhiteSpace(contentType) || !AllowedAvatarContentTypes.Contains(contentType))
                throw new InvalidOperationException("Invalid content type. Only image/png, image/jpeg, image/gif, image/webp are allowed.");

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(base64Data);
            }
            catch (FormatException)
            {
                throw new InvalidOperationException("Avatar data is not valid base64.");
            }

            user.AvatarBlob = bytes;
            user.AvatarContentType = contentType;
            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);

            return $"/api/users/avatar/{userId}";
        }

        /// <summary>
        /// Stores an avatar as a blob from an <see cref="IFormFile"/> upload.
        /// </summary>
        public async Task<string?> UploadAvatarAsync(Guid userId, IFormFile file, CancellationToken token = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, token).ConfigureAwait(false);
            if (user == null) throw new InvalidOperationException("User not found.");

            var contentType = file.ContentType?.ToLowerInvariant() ?? string.Empty;
            if (string.IsNullOrEmpty(contentType) || !AllowedAvatarContentTypes.Contains(contentType))
                throw new InvalidOperationException("Invalid content type. Only image/png, image/jpeg, image/gif, image/webp are allowed.");

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms, token).ConfigureAwait(false);

            user.AvatarBlob = ms.ToArray();
            user.AvatarContentType = contentType;
            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);

            return $"/api/users/avatar/{userId}";
        }

        public async Task DeleteAvatarAsync(Guid userId, CancellationToken token = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, token).ConfigureAwait(false);
            if (user == null) throw new InvalidOperationException("User not found.");

            user.AvatarBlob = null;
            user.AvatarContentType = null;
            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);
        }

        /// <summary>
        /// Returns the avatar image bytes and content type for a user, or null if none is set.
        /// </summary>
        public async Task<(byte[] Bytes, string ContentType)?> GetAvatarBlobAsync(Guid userId, CancellationToken token = default)
        {
            var user = await _db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == userId, token)
                .ConfigureAwait(false);

            if (user?.AvatarBlob == null || user.AvatarBlob.Length == 0)
                return null;

            return (user.AvatarBlob, user.AvatarContentType ?? "application/octet-stream");
        }

        public async Task<bool> AnyUsersExistAsync(CancellationToken token = default)
        {
            return await _db.Users.AnyAsync(token).ConfigureAwait(false);
        }

        public async Task<(string token, DateTime expiresAt)> GenerateInviteTokenAsync(Guid userId, CancellationToken token = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsActive, token).ConfigureAwait(false);
            if (user == null)
                throw new InvalidOperationException("User not found.");

            var randomBytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(randomBytes);
            }

            var rawToken = Convert.ToBase64String(randomBytes)
                .Replace('+', '-')
                .Replace('/', '_')
                .TrimEnd('=');

            var expiresAt = DateTime.UtcNow.AddDays(7);
            // Store only a SHA-256 digest: a leaked database copy must not be enough to
            // take over an account via /api/auth/set-password during the 7-day window.
            user.PasswordSetToken = HashInviteToken(rawToken);
            user.PasswordSetTokenExpiresAt = expiresAt;
            user.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync(token).ConfigureAwait(false);

            return (rawToken, expiresAt);
        }

        public async Task<UserDto> SetPasswordWithTokenAsync(string token, string newPassword, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(token))
                throw new InvalidOperationException("Invalid or expired token.");

            var tokenHash = HashInviteToken(token);
            var user = await _db.Users.FirstOrDefaultAsync(u => u.PasswordSetToken == tokenHash && u.IsActive, ct).ConfigureAwait(false);

            if (user == null || user.PasswordSetTokenExpiresAt == null || user.PasswordSetTokenExpiresAt < DateTime.UtcNow)
                throw new InvalidOperationException("Invalid or expired token.");

            var passwordError = PasswordPolicy.Validate(newPassword);
            if (passwordError != null)
                throw new InvalidOperationException(passwordError);

            var salt = GenerateSalt();
            user.PasswordHash = HashPassword(newPassword, salt);
            user.Salt = salt;
            user.PasswordSetToken = null;
            user.PasswordSetTokenExpiresAt = null;
            user.UpdatedAt = DateTime.UtcNow;

            var sessions = await _db.UserSessions.Where(s => s.UserId == user.Id && !s.IsRevoked).ToListAsync(ct).ConfigureAwait(false);
            foreach (var session in sessions)
                session.IsRevoked = true;

            await _db.SaveChangesAsync(ct).ConfigureAwait(false);

            return AuthService.MapUserDto(user);
        }

        public async Task<UserDto> ClaimUserAsync(Guid userId, string password, CancellationToken ct = default)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsActive, ct).ConfigureAwait(false);
            if (user == null)
                throw new InvalidOperationException("User not found.");

            if (user.PasswordHash != null)
                throw new InvalidOperationException("This profile is already protected by a password.");

            var passwordError = PasswordPolicy.Validate(password);
            if (passwordError != null)
                throw new InvalidOperationException(passwordError);

            var salt = GenerateSalt();
            user.PasswordHash = HashPassword(password, salt);
            user.Salt = salt;
            user.UpdatedAt = DateTime.UtcNow;

            var sessions = await _db.UserSessions.Where(s => s.UserId == userId && !s.IsRevoked).ToListAsync(ct).ConfigureAwait(false);
            foreach (var session in sessions) session.IsRevoked = true;

            await _db.SaveChangesAsync(ct).ConfigureAwait(false);

            return AuthService.MapUserDto(user);
        }

        public async Task<bool> AnyAdminHasPasswordAsync(CancellationToken token = default)
        {
            return await _db.Users
                .AsNoTracking()
                .AnyAsync(u => u.IsActive && u.Role == UserRole.Admin && u.PasswordHash != null, token)
                .ConfigureAwait(false);
        }

        private static string GenerateSalt()
        {
            var saltBytes = new byte[16];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(saltBytes);
            }
            return Convert.ToBase64String(saltBytes);
        }

        private static string HashPassword(string password, string salt)
        {
            return BCrypt.Net.BCrypt.HashPassword(password + salt, workFactor: 12);
        }

        private static bool VerifyPassword(string password, string hash, string salt)
        {
            return BCrypt.Net.BCrypt.Verify(password + salt, hash);
        }

        /// <summary>Verifies a plain-text password against a user's stored hash. False for passwordless users.</summary>
        internal static bool VerifyUserPassword(UserEntity user, string password)
        {
            return user.PasswordHash != null && user.Salt != null &&
                   VerifyPassword(password, user.PasswordHash, user.Salt);
        }

        private static string HashInviteToken(string rawToken)
        {
            return Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawToken)));
        }

        private static UserDetailDto MapToDetailDto(UserEntity user)
        {
            return new UserDetailDto
            {
                Id = user.Id,
                Username = user.Username,
                DisplayName = user.DisplayName,
                Role = user.Role,
                Level = ResolveLevel(user),
                OpdsPath = user.OpdsPath,
                AvatarBase64 = user.AvatarBlob != null && user.AvatarBlob.Length > 0
                    ? Convert.ToBase64String(user.AvatarBlob)
                    : null,
                AvatarContentType = user.AvatarContentType,
                HasPassword = user.PasswordHash != null,
                CreatedAt = user.CreatedAt,
                UpdatedAt = user.UpdatedAt,
                LastLoginAt = user.LastLoginAt,
                IsActive = user.IsActive,
                Permissions = user.Permissions != null ? PermissionService.MapToDto(user.Permissions) : new PermissionDto(),
                Preferences = user.Preferences != null ? new UserPreferencesDto
                {
                    Theme = user.Preferences.Theme,
                    DefaultLanguage = user.Preferences.DefaultLanguage,
                    CardSize = user.Preferences.CardSize,
                    NsfwVisibility = user.Preferences.NsfwVisibility
                } : new UserPreferencesDto()
            };
        }

        /// <summary>
        /// Returns the effective Level for a user row. Shared by <see cref="UserService"/> and
        /// <see cref="AuthService"/> so the Role→Level fallback lives in exactly one place.
        ///
        /// For legacy rows where Level was not yet backfilled, derives from Role:
        ///   Role.Admin (0) → Level.Admin (2)
        ///   Role.User  (1) → Level.User  (0)   — same as the column default, no change
        /// </summary>
        public static UserLevel ResolveLevel(UserEntity user)
        {
            if (user.Level != UserLevel.User)
                return user.Level;

            // Legacy row: Level=0 (User) may be correct, but for admins it should be 2.
            return user.Role == UserRole.Admin ? UserLevel.Admin : UserLevel.User;
        }
    }
}
