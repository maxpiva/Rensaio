using System.Text.Json.Serialization;
using KaizokuBackend.Models.Enums;

namespace KaizokuBackend.Models.Dto.Auth
{
    public class UserDto
    {
        [JsonPropertyName("id")]
        public Guid Id { get; set; }

        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("role")]
        [JsonConverter(typeof(JsonStringEnumConverter))]
        public UserRole Role { get; set; }

        [JsonPropertyName("level")]
        [JsonConverter(typeof(JsonStringEnumConverter))]
        public UserLevel Level { get; set; }

        [JsonPropertyName("opdsPath")]
        public string OpdsPath { get; set; } = string.Empty;

        /// <summary>
        /// Base64-encoded avatar image, or null when no avatar is set.
        /// </summary>
        [JsonPropertyName("avatarBase64")]
        public string? AvatarBase64 { get; set; }

        [JsonPropertyName("avatarContentType")]
        public string? AvatarContentType { get; set; }

        /// <summary>
        /// True when the user has a password hash set (i.e. password-based login is possible).
        /// </summary>
        [JsonPropertyName("hasPassword")]
        public bool HasPassword { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("lastLoginAt")]
        public DateTime? LastLoginAt { get; set; }

        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; }
    }

    public class UserDetailDto : UserDto
    {
        [JsonPropertyName("updatedAt")]
        public DateTime UpdatedAt { get; set; }

        [JsonPropertyName("permissions")]
        public PermissionDto Permissions { get; set; } = new();

        [JsonPropertyName("preferences")]
        public UserPreferencesDto Preferences { get; set; } = new();
    }

    public class UpdateUserDto
    {
        [JsonPropertyName("displayName")]
        public string? DisplayName { get; set; }

        [JsonPropertyName("role")]
        [JsonConverter(typeof(JsonStringEnumConverter))]
        public UserRole? Role { get; set; }

        [JsonPropertyName("isActive")]
        public bool? IsActive { get; set; }
    }

    public class ChangePasswordDto
    {
        [JsonPropertyName("currentPassword")]
        public string CurrentPassword { get; set; } = string.Empty;

        [JsonPropertyName("newPassword")]
        public string NewPassword { get; set; } = string.Empty;
    }
}
