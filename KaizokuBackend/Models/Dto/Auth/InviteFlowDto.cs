using System.Text.Json.Serialization;

namespace KaizokuBackend.Models.Dto.Auth
{
    public class FirstUserDto
    {
        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("password")]
        public string? Password { get; set; }
    }

    public class SetPasswordDto
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("newPassword")]
        public string NewPassword { get; set; } = string.Empty;
    }

    public class SetAdminPasswordDto
    {
        [JsonPropertyName("newPassword")]
        public string NewPassword { get; set; } = string.Empty;
    }

    public class ClaimUserDto
    {
        [JsonPropertyName("password")]
        public string Password { get; set; } = string.Empty;
    }

    public class GenerateInviteResponseDto
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("url")]
        public string Url { get; set; } = string.Empty;

        [JsonPropertyName("expiresAt")]
        public DateTime ExpiresAt { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;
    }
}
