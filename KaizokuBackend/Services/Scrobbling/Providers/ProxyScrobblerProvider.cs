using System.Net.Http.Json;
using KaizokuBackend.Data;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// Abstract base class for scrobbler providers that use the central OAuth proxy
/// for authorization (token exchange/refresh) but call provider APIs directly
/// for search, read-state, and tracking operations.
/// </summary>
public abstract class ProxyScrobblerProvider : IScrobblerProvider
{
    protected readonly HttpClient _proxyHttpClient;
    protected HttpClient _apiHttpClient = null!; // Set by subclass constructors
    protected readonly ILogger _logger;
    protected readonly string _instanceKey;
    protected readonly string _proxyBaseUrl;
    protected readonly string _providerName;
    protected string? _accessToken;
    protected readonly ITokenStorageService _tokenStorage;
    protected readonly ScrobblerTokenProtector _tokenProtector;

    public ScrobblerProvider ProviderType { get; }
    public string DisplayName { get; }
    public string? Icon { get; }
    public string? Link => null;
    public string? LinkDescription => null;
    public virtual string? SeriesUrlTemplate => null;
    public virtual string? ImageTemplateUrl => null;
    public bool RequiresOAuth => true;
    public bool SupportsDirectAuth => false;

    public Task<ScrobblerTokenResult> AuthenticateDirectAsync(DirectAuthRequest request)
        => throw new NotSupportedException("Proxy providers do not support direct authentication.");

    public void SetAccessToken(string accessToken)
    {
        _accessToken = accessToken;
    }

    protected ProxyScrobblerProvider(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ScrobblerProvider providerType,
        ILogger logger,
        ITokenStorageService tokenStorage,
        ScrobblerTokenProtector tokenProtector)
    {
        _proxyHttpClient = httpClientFactory.CreateClient("Scrobbler_Proxy");
        _logger = logger;
        _tokenStorage = tokenStorage;
        _tokenProtector = tokenProtector;

        _proxyBaseUrl = configuration.GetValue<string>("Scrobbling:ProxyUrl")?.TrimEnd('/')
                        ?? "https://oauth.kaizoku.net";
        _instanceKey = configuration.GetValue<string>("Scrobbling:Proxy:InstanceKey")
                       ?? configuration.GetValue<string>("Scrobbling:InstanceKey")
                       ?? string.Empty;

        ProviderType = providerType;
        DisplayName = providerType switch
        {
            ScrobblerProvider.AniList => "AniList",
            ScrobblerProvider.MyAnimeList => "MyAnimeList",
            ScrobblerProvider.Kitsu => "Kitsu",
            ScrobblerProvider.MangaDex => "MangaDex",
            _ => providerType.ToString()
        };
        Icon = providerType switch
        {
            ScrobblerProvider.MyAnimeList => ProviderIcons.MyAnimeList,
            ScrobblerProvider.AniList => ProviderIcons.AniList,
            ScrobblerProvider.Kitsu => ProviderIcons.Kitsu,
            ScrobblerProvider.MangaDex => ProviderIcons.MangaDex,
            _ => ProviderIcons.Placeholder
        };
        _providerName = providerType switch
        {
            ScrobblerProvider.AniList => "anilist",
            ScrobblerProvider.MyAnimeList => "myanimelist",
            ScrobblerProvider.Kitsu => "kitsu",
            ScrobblerProvider.MangaDex => "mangadex",
            _ => providerType.ToString().ToLowerInvariant()
        };
    }


    // ── OAuth Proxy Methods (concrete) ──

    public async Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
    {
        _proxyHttpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
        _proxyHttpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

        // Proxy generates its own state and redirectUri — no body needed
        var response = await _proxyHttpClient.PostAsync(
            $"{_proxyBaseUrl}/api/oauth/{_providerName}/url", null);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<ProxyAuthUrlResponse>();

        return new ScrobblerAuthUrlResult
        {
            AuthUrl = result?.AuthUrl ?? string.Empty,
            State = result?.State ?? state
        };
    }

    public async Task<ScrobblerTokenResult> ExchangeCodeAsync(string code, string redirectUri)
    {
        // ExchangeCodeAsync is called by ProxyCallback which retrieves tokens from proxy
        // The proxy no longer requires instanceSecret for token retrieval (token store is state-based)
        var state = HttpContextHelper.CurrentState;

        var request = new { state, instanceKey = _instanceKey };

        var response = await _proxyHttpClient.PostAsJsonAsync(
            $"{_proxyBaseUrl}/api/oauth/{_providerName}/token", request);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadFromJsonAsync<ProxyErrorResponse>();
            return new ScrobblerTokenResult
            {
                Success = false,
                ErrorMessage = error?.Error ?? "Failed to retrieve tokens from proxy"
            };
        }

        var result = await response.Content.ReadFromJsonAsync<ProxyTokenResponse>();
        return new ScrobblerTokenResult
        {
            Success = true,
            AccessToken = result?.AccessToken,
            RefreshToken = result?.RefreshToken,
            ExpiresAt = result?.ExpiresAt
        };
    }

    public async Task<ScrobblerTokenResult> RefreshTokenAsync(string refreshToken)
    {
        var request = new { refreshToken };

        _proxyHttpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
        _proxyHttpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

        var response = await _proxyHttpClient.PostAsJsonAsync(
            $"{_proxyBaseUrl}/api/oauth/{_providerName}/refresh", request);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadFromJsonAsync<ProxyErrorResponse>();
            return new ScrobblerTokenResult
            {
                Success = false,
                ErrorMessage = error?.Error ?? "Failed to refresh token via proxy"
            };
        }

        var result = await response.Content.ReadFromJsonAsync<ProxyTokenResponse>();
        return new ScrobblerTokenResult
        {
            Success = true,
            AccessToken = result?.AccessToken,
            RefreshToken = result?.RefreshToken,
            ExpiresAt = result?.ExpiresAt
        };
    }

    public Task<bool> ValidateApiKeyAsync(string apiKey) => Task.FromResult(false);

    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        try
        {
            _proxyHttpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
            _proxyHttpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

            var response = await _proxyHttpClient.GetAsync(
                $"{_proxyBaseUrl}/api/oauth/{_providerName}/validate", token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    // ── Token Lifecycle ──

    public async Task EnsureAuthenticatedAsync(Guid userId, CancellationToken token = default)
    {
        var (accessToken, refreshToken, expiresAt) = await _tokenStorage.LoadTokensAsync(userId, ProviderType, token);
        if (accessToken == null) return;

        SetAccessToken(accessToken);

        if (expiresAt.HasValue && expiresAt.Value < DateTime.UtcNow.AddMinutes(5))
        {
            if (string.IsNullOrEmpty(refreshToken)) return;

            var refreshResult = await RefreshTokenAsync(refreshToken);
            if (refreshResult.Success && refreshResult.AccessToken != null)
            {
                var encryptedAccess = _tokenProtector.Encrypt(refreshResult.AccessToken);
                var encryptedRefresh = refreshResult.RefreshToken != null
                    ? _tokenProtector.Encrypt(refreshResult.RefreshToken)
                    : null;

                await _tokenStorage.PersistRefreshedTokensAsync(userId, ProviderType,
                    encryptedAccess, encryptedRefresh, refreshResult.ExpiresAt, token);
                SetAccessToken(refreshResult.AccessToken);
            }
        }
    }

    // ── Abstract API Methods (implemented by subclasses) ──

    public abstract Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default);
    public abstract Task<Dictionary<decimal, int>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default);
    public abstract Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default);
    public abstract Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default);
    public abstract Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default);

    // ── JSON Models ──

    private class ProxyAuthUrlResponse
    {
        public string AuthUrl { get; set; } = string.Empty;
        public string State { get; set; } = string.Empty;
    }

    private class ProxyTokenResponse
    {
        public string AccessToken { get; set; } = string.Empty;
        public string? RefreshToken { get; set; }
        public DateTime? ExpiresAt { get; set; }
    }

    private class ProxyErrorResponse
    {
        public string Error { get; set; } = string.Empty;
    }
}


/// <summary>
/// Helper to pass the OAuth state from the callback request to the provider.
/// </summary>
public static class HttpContextHelper
{
    [ThreadStatic]
    public static string? CurrentState;
}

/// <summary>
/// Shared configuration model for scrobbler providers that use ClientId/ClientSecret/ApiKey.
/// </summary>
internal class ScrobblerConfiguration
{
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? ApiKey { get; set; }
}