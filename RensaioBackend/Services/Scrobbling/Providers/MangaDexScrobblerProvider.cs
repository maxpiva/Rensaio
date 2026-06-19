using System.Globalization;
using RensaioBackend.Data;
using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Scrobbling.Abstractions;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.RateLimiting;

namespace RensaioBackend.Services.Scrobbling.Providers;

/// <summary>
/// MangaDex scrobbler provider using OAuth2 password grant (personal client) and REST v5 API.
/// Users must create a personal API client at https://mangadex.org/settings > API Clients
/// and supply those credentials for authentication.
/// https://api.mangadex.org
/// </summary>
public class MangaDexScrobblerProvider : IScrobblerProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<MangaDexScrobblerProvider> _logger;
    private readonly ScrobblerConfiguration _config;
    private readonly ITokenStorageService _tokenStorage;
    private readonly ScrobblerTokenProtector _tokenProtector;
    private string? _accessToken;
    private Guid? _userId;
    private string? _personalClientId;
    private string? _personalClientSecret;

    private const string AuthBase = "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect";
    private const string ApiBase = "https://api.mangadex.org";

    public ScrobblerProvider ProviderType => ScrobblerProvider.MangaDex;
    public string DisplayName => "MangaDex";
    public string? Icon => ProviderIcons.MangaDex;
    public string? Link => "https://mangadex.org/settings#api-clients";
    public string? LinkDescription => "Create API client";
    public string? SeriesUrlTemplate => "https://mangadex.org/title/{0}";
    public string? ImageTemplateUrl => "https://uploads.mangadex.org/covers/{0}";
    public bool RequiresOAuth => true;
    public bool SupportsDirectAuth => true;
// MangaDex rate limit: 5 requests per second
// Token bucket ensures we never exceed that, with a small queue for brief bursts.
private static readonly TokenBucketRateLimiter _rateLimiter = new(new TokenBucketRateLimiterOptions
{
    TokenLimit = 5,
    TokensPerPeriod = 5,
    ReplenishmentPeriod = TimeSpan.FromSeconds(1),
    QueueLimit = 2,
    QueueProcessingOrder = QueueProcessingOrder.OldestFirst
});

private static ConcurrentDictionary<string, decimal> _dedupState = new();


    public MangaDexScrobblerProvider(
        IHttpClientFactory httpClientFactory,
        ILogger<MangaDexScrobblerProvider> logger,
        IConfiguration configuration,
        ITokenStorageService tokenStorage,
        ScrobblerTokenProtector tokenProtector)
    {
        _httpClient = httpClientFactory.CreateClient("Scrobbler_MangaDex");
        _logger = logger;
        _config = configuration.GetSection("Scrobbling:MangaDex").Get<ScrobblerConfiguration>() ?? new ScrobblerConfiguration();
        _tokenStorage = tokenStorage;
        _tokenProtector = tokenProtector;
    }

    public void SetAccessToken(string accessToken, Guid userid)
    {
        _accessToken = accessToken;
        _userId = userid;
    }

    /// <summary>
    /// Stores personal client credentials for token refresh.
    /// </summary>
    public void SetPersonalCredentials(string clientId, string clientSecret)
    {
        _personalClientId = clientId;
        _personalClientSecret = clientSecret;
    }

    /// <summary>
    /// Not supported for direct auth providers. Use <see cref="AuthenticateDirectAsync"/> instead.
    /// </summary>
    public Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
        => throw new NotSupportedException("MangaDex uses direct personal client auth, not OAuth proxy.");

    /// <summary>
    /// Not supported for direct auth providers. Use <see cref="AuthenticateDirectAsync"/> instead.
    /// </summary>
    public Task<ScrobblerTokenResult> ExchangeCodeAsync(string code, string redirectUri)
        => throw new NotSupportedException("MangaDex uses direct personal client auth, not OAuth proxy.");

    /// <summary>
    /// Authenticates via password grant using a MangaDex personal client.
    /// Users must supply their personal client_id and client_secret along with username/password.
    /// </summary>
    public async Task<ScrobblerTokenResult> AuthenticateDirectAsync(DirectAuthRequest request)
    {
        try
        {
            var formData = new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["username"] = request.Username ?? string.Empty,
                ["password"] = request.Password ?? string.Empty,
                ["client_id"] = request.ClientId ?? string.Empty,
                ["client_secret"] = request.ClientSecret ?? string.Empty
            };

            await EnforceRateLimitAsync();
            var response = await _httpClient.PostAsync($"{AuthBase}/token",
                new FormUrlEncodedContent(formData));
            //string n = await response.Content.ReadAsStringAsync();
            var json = await response.Content.ReadFromJsonAsync<MdTokenResponse>();
            if (json == null || string.IsNullOrEmpty(json.AccessToken))
                return new ScrobblerTokenResult { Success = false, ErrorMessage = "Failed to parse token response" };

            _accessToken = json.AccessToken;

            return new ScrobblerTokenResult
            {
                Success = true,
                AccessToken = json.AccessToken,
                RefreshToken = json.RefreshToken,
                ExpiresAt = DateTime.UtcNow.AddSeconds(json.ExpiresIn)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MangaDex personal client auth failed");
            return new ScrobblerTokenResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    /// <summary>
    /// Refreshes an expired access token.
    /// Uses personal client credentials if set, otherwise falls back to global config.
    /// </summary>
    public async Task<ScrobblerTokenResult> RefreshTokenAsync(string refreshToken)
    {
        try
        {
            var formData = new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = refreshToken
            };

            // Use personal client credentials if available (from JSON payload), else fallback to config
            if (!string.IsNullOrEmpty(_personalClientId))
            {
                formData["client_id"] = _personalClientId;
                formData["client_secret"] = _personalClientSecret ?? string.Empty;
            }
            else if (!string.IsNullOrEmpty(_config.ClientId))
            {
                formData["client_id"] = _config.ClientId;
                formData["client_secret"] = _config.ClientSecret ?? string.Empty;
            }

            await EnforceRateLimitAsync();
            var response = await _httpClient.PostAsync($"{AuthBase}/token",
                new FormUrlEncodedContent(formData));

            var json = await response.Content.ReadFromJsonAsync<MdTokenResponse>();
            if (json == null || string.IsNullOrEmpty(json.AccessToken))
                return new ScrobblerTokenResult { Success = false, ErrorMessage = "Failed to refresh token" };

            _accessToken = json.AccessToken;

            return new ScrobblerTokenResult
            {
                Success = true,
                AccessToken = json.AccessToken,
                RefreshToken = json.RefreshToken ?? refreshToken,
                ExpiresAt = DateTime.UtcNow.AddSeconds(json.ExpiresIn)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MangaDex token refresh failed");
            return new ScrobblerTokenResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    public async Task EnsureAuthenticatedAsync(Guid userId, CancellationToken token = default)
    {
        var (accessToken, refreshToken, expiresAt) = await _tokenStorage.LoadTokensAsync(userId, ProviderType, token);
        if (accessToken == null) return;

        SetAccessToken(accessToken, userId);

        // MangaDex stores personal client credentials inside the refresh payload
        if (!string.IsNullOrEmpty(refreshToken))
        {
            try
            {
                var payload = JsonSerializer.Deserialize<ScrobblerRefreshPayload>(refreshToken);
                if (payload != null)
                {
                    if (!string.IsNullOrEmpty(payload.ClientId))
                        SetPersonalCredentials(payload.ClientId, payload.ClientSecret ?? string.Empty);

                    if (expiresAt.HasValue && expiresAt.Value < DateTime.UtcNow.AddMinutes(5))
                    {
                        var refreshResult = await RefreshTokenAsync(payload.RefreshToken);
                        if (refreshResult.Success && refreshResult.AccessToken != null)
                        {
                            // Build new payload with updated refresh token + preserved client credentials
                            var newPayload = new ScrobblerRefreshPayload
                            {
                                RefreshToken = refreshResult.RefreshToken ?? payload.RefreshToken,
                                ClientId = payload.ClientId,
                                ClientSecret = payload.ClientSecret
                            };
                            var newPayloadJson = JsonSerializer.Serialize(newPayload);
                            var encryptedAccess = _tokenProtector.Encrypt(refreshResult.AccessToken);
                            var encryptedRefresh = _tokenProtector.Encrypt(newPayloadJson);

                            await _tokenStorage.PersistRefreshedTokensAsync(userId, ProviderType,
                                encryptedAccess, encryptedRefresh, refreshResult.ExpiresAt, token);
                            SetAccessToken(refreshResult.AccessToken, userId);
                        }
                    }
                }
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to deserialize MangaDex refresh payload for user {UserId}", userId);
            }
        }
    }

    public Task<bool> ValidateApiKeyAsync(string apiKey) => Task.FromResult(false);
    public string GetUserExternalKey(string externalSeriesId) => $"{_userId}:{externalSeriesId}";

    public async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
        _httpClient.ApplyBearerToken(_accessToken);

        await EnforceRateLimitAsync();
        var response = await _httpClient.GetAsync(
            $"{ApiBase}/manga?title={Uri.EscapeDataString(query)}&limit=25&includes[]=cover_art",
            token);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<MdSearchResponse>(cancellationToken: token);
        var results = new List<ScrobblerSearchResult>();

        if (result?.Data == null) return results;

        foreach (var item in result.Data)
        {
            var attr = item.Attributes;
            if (attr == null) continue;

            var altTitles = new List<string>();
            if (attr.AltTitles != null)
            {
                foreach (var alt in attr.AltTitles)
                {
                    foreach (var kvp in alt)
                    {
                        if (kvp.Value is string s && !string.IsNullOrEmpty(s))
                            altTitles.Add(s);
                    }
                }
            }

            // Get primary title from available locales
            var title = attr.Title?.GetValueOrDefault("en")
                        ?? attr.Title?.GetValueOrDefault("ja")
                        ?? attr.Title?.Values.FirstOrDefault()
                        ?? query;

            // Get cover URL from relationships
            var coverUrl = GetCoverUrl(item.Relationships);

            results.Add(new ScrobblerSearchResult
            {
                ExternalId = item.Id,
                Title = title,
                AlternateTitles = altTitles,
                CoverUrl = coverUrl,
                Type = attr.PublicationDemographic ?? attr.OriginalLanguage,
                ChapterCount = attr.LastChapter != null ? int.TryParse(attr.LastChapter, out var c) ? c : null : null,
                Status = attr.Status,
                Synopsis = attr.Description?.GetValueOrDefault("en"),
                Year = attr.Year?.ToString()
            });
        }

        return results;
    }

    public async Task<Dictionary<decimal, float>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
    {
        try
        {
            _httpClient.ApplyBearerToken(_accessToken);

            var chapters = new Dictionary<decimal, float>();
            var userId = await GetUserIdAsync(token);
            if (userId == null) return chapters;

            await EnforceRateLimitAsync();
            var response = await _httpClient.GetAsync(
                $"{ApiBase}/user/{userId}/manga/{externalSeriesId}/status",
                token);

            response.EnsureSuccessStatusCode();

            // Get the reading history
            await EnforceRateLimitAsync();
            var historyResponse = await _httpClient.GetAsync(
                $"{ApiBase}/manga/{externalSeriesId}/feed?limit=500&translatedLanguage[]=en&order[readableAt]=desc",
                token);

            historyResponse.EnsureSuccessStatusCode();
            var historyResult = await historyResponse.Content.ReadFromJsonAsync<MdFeedResponse>(cancellationToken: token);

            if (historyResult?.Data != null)
            {
                foreach (var chapter in historyResult.Data)
                {
                    if (chapter.Attributes?.Chapter != null &&
                        decimal.TryParse(chapter.Attributes.Chapter, NumberStyles.Any, CultureInfo.InvariantCulture, out var chapterNum))
                    {
                        chapters[chapterNum] = 1.0f; // page-level detail not available from MangaDex
                    }
                }
            }

            return chapters;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get MangaDex read chapters for series {Id}", externalSeriesId);
            return [];
        }
    }
    private bool DeDup(string externalSeriesId, decimal chapterNumber)
    {
        string key = GetUserExternalKey(externalSeriesId);
        if (_dedupState.TryGetValue(key, out decimal result))
        {
            if (result == chapterNumber)
                return true;
        }
        return false;

    }
    private void UpdateDeDup(string externalSeriesId, decimal chapterNumber)
    {
        string key = GetUserExternalKey(externalSeriesId);
        _dedupState.AddOrUpdate(key, chapterNumber, (_, existing) => chapterNumber);
    }
    public async Task<bool> SetReadChaptersAsync(string externalSeriesId, Dictionary<decimal, float> chapterState, CancellationToken token = default)
    {
        try
        {
            decimal chapterNumber = chapterState.Where(a => a.Value == 1.0f).Select(a => a.Key).DefaultIfEmpty(0).Max();
            if (chapterNumber <= 0)
                return true; // No update needed
            if (DeDup(externalSeriesId, chapterNumber))
                return true;
            _httpClient.ApplyBearerToken(_accessToken);

            var payload = new
            {
                chapter = chapterNumber.ToString(CultureInfo.InvariantCulture)
            };

            await EnforceRateLimitAsync();
            var response = await _httpClient.PostAsJsonAsync(
                $"{ApiBase}/manga/{externalSeriesId}/progress",
                payload,
                token);
            if (response.IsSuccessStatusCode)
            {
                UpdateDeDup(externalSeriesId, chapterNumber);
            }
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload read state to MangaDex for series {Id}", externalSeriesId);
            return false;
        }
    }


    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        try
        {
            _httpClient.ApplyBearerToken(_accessToken);

            await EnforceRateLimitAsync();
            var response = await _httpClient.GetAsync($"{ApiBase}/user/me", token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    // ── Rate Limiting ──

    /// <summary>
    /// Enforces the MangaDex rate limit of 5 requests per second using a token bucket.
    /// Waits asynchronously until a token is available.
    /// </summary>
    private static async ValueTask EnforceRateLimitAsync()
    {
        using var lease = await _rateLimiter.AcquireAsync(permitCount: 1);
    }

    // ── Private Helpers ──

    private async Task<string?> GetUserIdAsync(CancellationToken token)
    {
        try
        {
            _httpClient.ApplyBearerToken(_accessToken);

            await EnforceRateLimitAsync();
            var response = await _httpClient.GetAsync($"{ApiBase}/user/me", token);
            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<MdUserResponse>(cancellationToken: token);
            return result?.Data?.Id;
        }
        catch
        {
            return null;
        }
    }


    private static string? GetCoverUrl(List<MdRelationship>? relationships)
    {
        if (relationships == null) return null;
        var coverRel = relationships.FirstOrDefault(r => r.Type == "cover_art");
        if (coverRel?.Attributes?.FileName == null) return null;
        return $"https://uploads.mangadex.org/covers/{coverRel.Id}/{coverRel.Attributes.FileName}";
    }

    // ── JSON Models ──

    private class MdTokenResponse
    {
        [System.Text.Json.Serialization.JsonPropertyName("access_token")]
        public string? AccessToken { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("refresh_token")]
        public string? RefreshToken { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("token_type")]
        public string? TokenType { get; set; }
    }

    private class MdSearchResponse
    {
        public List<MdMangaData>? Data { get; set; }
    }

    private class MdMangaData
    {
        public string Id { get; set; } = string.Empty;
        public string? Type { get; set; }
        public MdMangaAttributes? Attributes { get; set; }
        public List<MdRelationship>? Relationships { get; set; }
    }

    private class MdMangaAttributes
    {
        public Dictionary<string, string>? Title { get; set; }
        public List<Dictionary<string, object>>? AltTitles { get; set; }
        public Dictionary<string, string>? Description { get; set; }
        public string? OriginalLanguage { get; set; }
        public string? PublicationDemographic { get; set; }
        public string? Status { get; set; }
        public string? LastChapter { get; set; }
        public int? Year { get; set; }
    }

    private class MdRelationship
    {
        public string Id { get; set; } = string.Empty;
        public string? Type { get; set; }
        public MdCoverAttributes? Attributes { get; set; }
    }

    private class MdCoverAttributes
    {
        public string? FileName { get; set; }
    }

    private class MdFeedResponse
    {
        public List<MdChapterData>? Data { get; set; }
    }

    private class MdChapterData
    {
        public string Id { get; set; } = string.Empty;
        public MdChapterAttributes? Attributes { get; set; }
    }

    private class MdChapterAttributes
    {
        public string? Chapter { get; set; }
        public string? Title { get; set; }
    }

    private class MdUserResponse
    {
        public MdUserData? Data { get; set; }
    }

    private class MdUserData
    {
        public string Id { get; set; } = string.Empty;
    }
}