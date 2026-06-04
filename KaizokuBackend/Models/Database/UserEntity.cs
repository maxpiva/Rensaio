using System.ComponentModel.DataAnnotations;
using KaizokuBackend.Models.Enums;

namespace KaizokuBackend.Models.Database
{
    public class UserEntity
    {
        [Key]
        public Guid Id { get; set; }
        public string Username { get; set; } = string.Empty;

        // Obsolete: retained for backfill/transition — no longer required or unique on new installs.
        public string? Email { get; set; }

        public string DisplayName { get; set; } = string.Empty;
        public string? PasswordHash { get; set; }
        public string? Salt { get; set; }
        public UserRole Role { get; set; } = UserRole.User;
        public UserLevel Level { get; set; } = UserLevel.User;
        public string OpdsPath { get; set; } = string.Empty;

        // Obsolete: retained for backfill/transition — blob storage replaces file-system avatar.
        public string? AvatarPath { get; set; }

        public byte[]? AvatarBlob { get; set; }
        public string? AvatarContentType { get; set; }
        public string? PasswordSetToken { get; set; }
        public DateTime? PasswordSetTokenExpiresAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LastLoginAt { get; set; }
        public bool IsActive { get; set; } = true;

        public virtual UserPermissionEntity? Permissions { get; set; }
        public virtual UserPreferencesEntity? Preferences { get; set; }
        public virtual ICollection<UserSessionEntity> Sessions { get; set; } = [];
    }
}
