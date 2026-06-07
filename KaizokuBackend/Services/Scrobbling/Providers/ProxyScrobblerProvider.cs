using System.Net.Http.Json;
using KaizokuBackend.Data;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// Proxy-based scrobbler provider that delegates all OAuth and API calls
/// to a central OAuth proxy. Instance credentials (key + secret) are
/// stored in the database settings table; only the ProxyUrl comes from config.
/// </summary>
public class ProxyScrobblerProvider : IScrobblerProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ProxyScrobblerProvider> _logger;
    private readonly string _instanceKey;
    private readonly string _proxyBaseUrl;
    private readonly string _providerName;

    public ScrobblerProvider ProviderType { get; }
    public string DisplayName { get; }
    public bool RequiresOAuth => true;

    public ProxyScrobblerProvider(
        IHttpClientFactory httpClientFactory,
        ILogger<ProxyScrobblerProvider> logger,
        IConfiguration configuration,
        ScrobblerProvider providerType)
    {
        _httpClient = httpClientFactory.CreateClient("Scrobbler_Proxy");
        _logger = logger;

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
        _providerName = providerType switch
        {
            ScrobblerProvider.AniList => "anilist",
            ScrobblerProvider.MyAnimeList => "myanimelist",
            ScrobblerProvider.Kitsu => "kitsu",
            ScrobblerProvider.MangaDex => "mangadex",
            _ => providerType.ToString().ToLowerInvariant()
        };
    }

    public async Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
    {
        _httpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
        _httpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

        // Proxy generates its own state and redirectUri — no body needed
        var response = await _httpClient.PostAsync(
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

        var response = await _httpClient.PostAsJsonAsync(
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

        _httpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
        _httpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

        var response = await _httpClient.PostAsJsonAsync(
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

    public async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
        _httpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
        _httpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

        try
        {
            var response = await _httpClient.PostAsJsonAsync(
                $"{_proxyBaseUrl}/api/proxy/{_providerName}/search",
                new { query }, token);

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<List<ScrobblerSearchResult>>(cancellationToken: token);
                return result ?? [];
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Proxy search failed for {Provider}, falling back", _providerName);
        }

        return [];
    }

    public async Task<Dictionary<decimal, int>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
    {
        _httpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
        _httpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

        try
        {
            var response = await _httpClient.GetAsync(
                $"{_proxyBaseUrl}/api/proxy/{_providerName}/read-chapters/{externalSeriesId}", token);

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<Dictionary<decimal, int>>(cancellationToken: token);
                return result ?? [];
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Proxy read-chapters failed for {Provider}", _providerName);
        }

        return [];
    }

    public async Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default)
    {
        var chapters = await GetReadChaptersAsync(externalSeriesId, token);
        return chapters.Count;
    }

    public async Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default)
    {
        _httpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
        _httpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

        try
        {
            var response = await _httpClient.PostAsJsonAsync(
                $"{_proxyBaseUrl}/api/proxy/{_providerName}/upload-chapter",
                new { externalSeriesId, chapterNumber, page }, token);

            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Proxy upload-chapter failed for {Provider}", _providerName);
            return false;
        }
    }

    public Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default)
        => Task.FromResult(false);

    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        try
        {
            _httpClient.DefaultRequestHeaders.Remove("X-Instance-Key");
            _httpClient.DefaultRequestHeaders.Add("X-Instance-Key", _instanceKey);

            var response = await _httpClient.GetAsync(
                $"{_proxyBaseUrl}/api/oauth/{_providerName}/validate", token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

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