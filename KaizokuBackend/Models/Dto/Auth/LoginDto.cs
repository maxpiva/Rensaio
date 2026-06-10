using System.Text.Json.Serialization;

namespace KaizokuBackend.Models.Dto.Auth
{
    public class LoginDto
    {
        /// <summary>
        /// Username for login. The "OrEmail" suffix is retained for client backward-compatibility
        /// but email-based lookup is no longer performed.
        /// </summary>
        [JsonPropertyName("usernameOrEmail")]
        public string UsernameOrEmail { get; set; } = string.Empty;

        [JsonPropertyName("password")]
        public string Password { get; set; } = string.Empty;

        [JsonPropertyName("rememberMe")]
        public bool RememberMe { get; set; } = false;
    }
}
