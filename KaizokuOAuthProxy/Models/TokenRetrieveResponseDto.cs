namespace KaizokuOAuthProxy.Models;

public class TokenRetrieveResponseDto
{
    public string AccessToken { get; set; } = string.Empty;
    public string? RefreshToken { get; set; }
    public DateTime? ExpiresAt { get; set; }
}
