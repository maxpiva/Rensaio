using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace RensaioOAuthProxy.Services;

/// <summary>
/// Handles the actual OAuth2 flows with external scrobbler providers.
/// Reads client_id + client_secret from IConfiguration (env vars first, appsettings fallback).
/// Never stores them in the database.
/// </summary>
public class ProviderApiService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ProviderApiService> _logger;

    public ProviderApiService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<ProviderApiService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    private (string ClientId, string ClientSecret) GetCredentials(string provider)
    {
        var normalized = provider.ToLowerInvariant() switch
        {
            "anilist" => "AniList",
            "myanimelist" or "mal" => "MyAnimeList",
            "kitsu" => "Kitsu",
            "mangadex" => "MangaDex",
            _ => provider
        };

        // Priority: env vars first, then appsettings.json fallback
        var envKey = $"PROXY_{normalized.ToUpperInvariant()}_CLIENT_ID";
        var envSecret = $"PROXY_{normalized.ToUpperInvariant()}_CLIENT_SECRET";
        var section = _configuration.GetSection($"ProviderCredentials:{normalized}");

        var clientId = Environment.GetEnvironmentVariable(envKey)
                       ?? section["ClientId"]
                       ?? string.Empty;
        var clientSecret = Environment.GetEnvironmentVariable(envSecret)
                           ?? section["ClientSecret"]
                           ?? string.Empty;

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            throw new InvalidOperationException(
                $"No credentials configured for provider: {normalized}. " +
                $"Set {envKey} and {envSecret} environment variables.");

        return (clientId, clientSecret);
    }

    /// <summary>
    /// Generates the authorization URL for a provider.
    /// </summary>
    public Task<string> GenerateAuthUrlAsync(string provider, string redirectUri, string state)
    {
        var (clientId, _) = GetCredentials(provider);

        var authUrl = provider.ToLowerInvariant() switch
        {
            "anilist" => $"https://anilist.co/api/v2/oauth/authorize?client_id={clientId}&redirect_uri={Uri.EscapeDataString(redirectUri)}&response_type=code&state={state}",
            "myanimelist" => $"https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id={clientId}&redirect_uri={Uri.EscapeDataString(redirectUri)}&state={state}",
            "kitsu" => $"https://kitsu.io/api/oauth/authorize?response_type=code&client_id={clientId}&redirect_uri={Uri.EscapeDataString(redirectUri)}&state={state}",
            "mangadex" => $"https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/auth?response_type=code&client_id={clientId}&redirect_uri={Uri.EscapeDataString(redirectUri)}&state={state}&scope=openid",
            _ => throw new InvalidOperationException($"Unknown provider: {provider}")
        };

        return Task.FromResult(authUrl);
    }

    /// <summary>
    /// Exchanges an authorization code for tokens.
    /// </summary>
    public async Task<TokenResult> ExchangeCodeAsync(string provider, string code, string redirectUri)
    {
        var (clientId, clientSecret) = GetCredentials(provider);
        var httpClient = _httpClientFactory.CreateClient();

        var formData = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["redirect_uri"] = redirectUri,
            ["code"] = code
        };

        var tokenUrl = provider.ToLowerInvariant() switch
        {
            "anilist" => "https://anilist.co/api/v2/oauth/token",
            "myanimelist" => "https://myanimelist.net/v1/oauth2/token",
            "kitsu" => "https://kitsu.io/api/oauth/token",
            "mangadex" => "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token",
            _ => throw new InvalidOperationException($"Unknown provider: {provider}")
        };

        var response = await httpClient.PostAsync(tokenUrl, new FormUrlEncodedContent(formData));
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var accessToken = json.GetProperty("access_token").GetString() ?? string.Empty;
        var refreshToken = json.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null;
        var expiresIn = json.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 3600;

        return new TokenResult
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            ExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn)
        };
    }

    /// <summary>
    /// Refreshes an expired access token.
    /// </summary>
    public async Task<TokenResult> RefreshTokenAsync(string provider, string refreshToken)
    {
        var (clientId, clientSecret) = GetCredentials(provider);
        var httpClient = _httpClientFactory.CreateClient();

        var formData = new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["refresh_token"] = refreshToken
        };

        var tokenUrl = provider.ToLowerInvariant() switch
        {
            "anilist" => "https://anilist.co/api/v2/oauth/token",
            "myanimelist" => "https://myanimelist.net/v1/oauth2/token",
            "kitsu" => "https://kitsu.io/api/oauth/token",
            "mangadex" => "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token",
            _ => throw new InvalidOperationException($"Unknown provider: {provider}")
        };

        var response = await httpClient.PostAsync(tokenUrl, new FormUrlEncodedContent(formData));
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var accessToken = json.GetProperty("access_token").GetString() ?? string.Empty;
        var newRefreshToken = json.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : refreshToken;
        var expiresIn = json.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 3600;

        return new TokenResult
        {
            AccessToken = accessToken,
            RefreshToken = newRefreshToken,
            ExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn)
        };
    }
}

public class TokenResult
{
    public string AccessToken { get; set; } = string.Empty;
    public string? RefreshToken { get; set; }
    public DateTime ExpiresAt { get; set; }
}