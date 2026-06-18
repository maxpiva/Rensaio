namespace RensaioOAuthProxy.Models;

public class TokenRefreshResponseDto
{
    public string AccessToken { get; set; } = string.Empty;
    public string? RefreshToken { get; set; }
    public DateTime? ExpiresAt { get; set; }
}
