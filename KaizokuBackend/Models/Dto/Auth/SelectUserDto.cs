using System.Text.Json.Serialization;

namespace KaizokuBackend.Models.Dto.Auth
{
    /// <summary>Request body for <c>POST /api/auth/select-user</c> (auth-disabled mode).</summary>
    public class SelectUserDto
    {
        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;
    }

    /// <summary>
    /// Slim user entry included in the <c>GET /api/auth/status</c> response when
    /// authentication is disabled, so the frontend can render a profile selector.
    /// </summary>
    public class StatusUserEntryDto
    {
        [JsonPropertyName("id")]
        public Guid Id { get; set; }

        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("avatarBase64")]
        public string? AvatarBase64 { get; set; }

        [JsonPropertyName("avatarContentType")]
        public string? AvatarContentType { get; set; }
    }

    /// <summary>Response shape for <c>GET /api/auth/status</c>.</summary>
    public class AuthStatusDto
    {
        /// <summary>True when password-based JWT authentication is required.</summary>
        [JsonPropertyName("authenticationEnabled")]
        public bool AuthenticationEnabled { get; set; }

        /// <summary>True when at least one user exists (setup has been completed).</summary>
        [JsonPropertyName("hasUsers")]
        public bool HasUsers { get; set; }

        /// <summary>
        /// Back-compat alias: equals <c>!HasUsers</c>.
        /// Kept so existing frontend setup-detection logic does not break.
        /// </summary>
        [JsonPropertyName("requiresSetup")]
        public bool RequiresSetup => !HasUsers;

        /// <summary>
        /// List of active users for the profile selector.
        /// Populated only when <see cref="AuthenticationEnabled"/> is false; omitted from
        /// the JSON response entirely when null (auth-enabled mode).
        /// </summary>
        [JsonPropertyName("users")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<StatusUserEntryDto>? Users { get; set; }
    }
}
