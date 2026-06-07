namespace KaizokuOAuthProxy.Models;

public class OAuthUrlResponseDto
{
    public string AuthUrl { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
}
