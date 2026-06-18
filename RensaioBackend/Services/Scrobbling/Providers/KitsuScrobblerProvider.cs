using com.sun.security.ntlm;
using RensaioBackend.Data;
using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Scrobbling.Abstractions;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace RensaioBackend.Services.Scrobbling.Providers;

/// <summary>
/// Kitsu scrobbler provider using OAuth2 password grant and JSON:API v1.
/// Kitsu is a fully public OAuth client — no client_id/client_secret needed for
/// either the password grant or the refresh_token grant.
/// https://kitsu.io/api/edge
/// </summary>
public class KitsuScrobblerProvider : IScrobblerProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<KitsuScrobblerProvider> _logger;
    private readonly ITokenStorageService _tokenStorage;
    private readonly ScrobblerTokenProtector _tokenProtector;
    private string? _accessToken;
    private Guid? _userId;

    private const string AuthBase = "https://kitsu.io/api/oauth";
    private const string ApiBase = "https://kitsu.io/api/edge";

    public ScrobblerProvider ProviderType => ScrobblerProvider.Kitsu;
    public string DisplayName => "Kitsu";
    public string? Icon => ProviderIcons.Kitsu;
    public string? Link => null;
    public string? LinkDescription => null;
    public string? SeriesUrlTemplate => "https://kitsu.io/manga/{0}";
    public string? ImageTemplateUrl => null;
    public bool RequiresOAuth => true;
    public bool SupportsDirectAuth => true;

    public KitsuScrobblerProvider(
        IHttpClientFactory httpClientFactory,
        ILogger<KitsuScrobblerProvider> logger,
        ITokenStorageService tokenStorage,
        ScrobblerTokenProtector tokenProtector)
    {
        _httpClient = httpClientFactory.CreateClient("Scrobbler_Kitsu");
        _logger = logger;
        _tokenStorage = tokenStorage;
        _tokenProtector = tokenProtector;
    }
    private static ConcurrentDictionary<string, decimal> _dedupState = new();

    public void SetAccessToken(string accessToken, Guid userid)
    {
        _accessToken = accessToken;
        _userId = userid;
    }

    /// <summary>
    /// Not supported for direct auth providers. Use <see cref="AuthenticateDirectAsync"/> instead.
    /// </summary>
    public Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
        => throw new NotSupportedException("Kitsu uses direct password auth, not OAuth proxy.");

    /// <summary>
    /// Not supported for direct auth providers. Use <see cref="AuthenticateDirectAsync"/> instead.
    /// </summary>
    public Task<ScrobblerTokenResult> ExchangeCodeAsync(string code, string redirectUri)
        => throw new NotSupportedException("Kitsu uses direct password auth, not OAuth proxy.");

    /// <summary>
    /// Authenticates via password grant. Kitsu is a fully public OAuth client —
    /// no client_id or client_secret required.
    /// </summary>
    public async Task<ScrobblerTokenResult> AuthenticateDirectAsync(DirectAuthRequest request)
    {
        try
        {
            var formData = new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["username"] = request.Username ?? string.Empty,
                ["password"] = request.Password ?? string.Empty
            };

            var response = await _httpClient.PostAsync($"{AuthBase}/token",
                new FormUrlEncodedContent(formData));
            //string xxx = await response.Content.ReadAsStringAsync();
            var json = await response.Content.ReadFromJsonAsync<KitsuTokenResponse>();
            if (json == null || string.IsNullOrEmpty(json.AccessToken))
                return new ScrobblerTokenResult { Success = false, ErrorMessage = "Failed to parse token response" };

            _accessToken = json.AccessToken;

            return new ScrobblerTokenResult
            {
                Success = true,
                AccessToken = json.AccessToken,
                RefreshToken = json.RefreshToken,
                ExpiresAt = DateTime.UtcNow.AddSeconds(json.CreatedAt + json.ExpiresIn)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Kitsu password auth failed");
            return new ScrobblerTokenResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    /// <summary>
    /// Refreshes an expired access token. Kitsu is fully public —
    /// only grant_type and refresh_token are needed, no client credentials.
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

            var response = await _httpClient.PostAsync($"{AuthBase}/token",
                new FormUrlEncodedContent(formData));

            var json = await response.Content.ReadFromJsonAsync<KitsuTokenResponse>();
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
            _logger.LogError(ex, "Kitsu token refresh failed");
            return new ScrobblerTokenResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    public async Task EnsureAuthenticatedAsync(Guid userId, CancellationToken token = default)
    {
        var (accessToken, refreshToken, expiresAt) = await _tokenStorage.LoadTokensAsync(userId, ProviderType, token);
        if (accessToken == null) return;

        SetAccessToken(accessToken, userId);

        if (expiresAt.HasValue && expiresAt.Value < DateTime.UtcNow.AddMinutes(5))
        {
            if (string.IsNullOrEmpty(refreshToken)) return;

            var refreshResult = await RefreshTokenAsync(refreshToken);
            if (refreshResult.Success && refreshResult.AccessToken != null)
            {
                // Build JSON payload with refresh token (Kitsu stores refresh in payload)
                var payload = new ScrobblerRefreshPayload
                {
                    RefreshToken = refreshResult.RefreshToken ?? refreshToken
                };
                var payloadJson = JsonSerializer.Serialize(payload);
                var encryptedAccess = _tokenProtector.Encrypt(refreshResult.AccessToken);
                var encryptedRefresh = _tokenProtector.Encrypt(payloadJson);

                await _tokenStorage.PersistRefreshedTokensAsync(userId, ProviderType,
                    encryptedAccess, encryptedRefresh, refreshResult.ExpiresAt, token);
                SetAccessToken(refreshResult.AccessToken, userId);
            }
        }
    }

    public Task<bool> ValidateApiKeyAsync(string apiKey) => Task.FromResult(false);
    public string GetUserExternalKey(string externalSeriesId) => $"{_userId}:{externalSeriesId}";

    private void AddVND()
    {
        _httpClient.DefaultRequestHeaders.Accept.Clear();
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.api+json"));
    }

    public async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
        _httpClient.ApplyBearerToken(_accessToken);
        AddVND();
        var response = await _httpClient.GetAsync(
            $"{ApiBase}/manga?filter[text]={Uri.EscapeDataString(query)}&page[limit]=20&include=categories",
            token);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<KitsuSearchResponse>(cancellationToken: token);
        var results = new List<ScrobblerSearchResult>();

        if (result?.Data == null) return results;

        foreach (var item in result.Data)
        {
            var attr = item.Attributes;
            if (attr == null) continue;
            if (attr.MangaType!=null && attr.MangaType.Contains("novel", StringComparison.InvariantCultureIgnoreCase))
                continue;
            var altTitles = new List<string>();
            if (attr.Titles != null)
            {
                if (!string.IsNullOrEmpty(attr.Titles.En) &&
                    !string.Equals(attr.CanonicalTitle, attr.Titles.En, StringComparison.OrdinalIgnoreCase))
                    altTitles.Add(attr.Titles.En);
                if (!string.IsNullOrEmpty(attr.Titles.EnJp))
                    altTitles.Add(attr.Titles.EnJp);
                if (!string.IsNullOrEmpty(attr.Titles.JaJp))
                    altTitles.Add(attr.Titles.JaJp);
            }

            results.Add(new ScrobblerSearchResult
            {
                ExternalId = item.Id ?? string.Empty,
                Title = attr.CanonicalTitle ?? query,
                AlternateTitles = altTitles,
                CoverUrl = attr.PosterImage?.Large ?? attr.PosterImage?.Medium ?? attr.PosterImage?.Original,
                Type = attr.MangaType,
                ChapterCount = attr.ChapterCount,
                Status = attr.Status,
                Synopsis = attr.Synopsis,
                Score = attr.AverageRating,
                Year = attr.StartDate?.Length >= 4 ? attr.StartDate[..4] : null
            });
        }

        return results;
    }

    public async Task<Dictionary<decimal, float>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
    {
        var total = await GetTotalChaptersReadAsync(externalSeriesId, token);
        var chapters = new Dictionary<decimal, float>();
        for (decimal i = 1; i <= total; i++)
            chapters[i] = 1.0f;
        return chapters;
    }

    private async Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default)
    {
        try
        {
            _httpClient.ApplyBearerToken(_accessToken);
            AddVND();
            // First need to get the user's Kitsu ID
            var userResponse = await _httpClient.GetAsync($"{ApiBase}/users?filter[self]=true", token);
            userResponse.EnsureSuccessStatusCode();
            var userResult = await userResponse.Content.ReadFromJsonAsync<KitsuUserResponse>(cancellationToken: token);
            var userId = userResult?.Data?.FirstOrDefault()?.Id;
            if (userId == null) return 0;

            var response = await _httpClient.GetAsync(
                $"{ApiBase}/library-entries?filter[userId]={userId}&filter[mangaId]={externalSeriesId}&fields[libraryEntries]=progress",
                token);

            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<KitsuLibraryResponse>(cancellationToken: token);
            return result?.Data?.FirstOrDefault()?.Attributes?.Progress ?? 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get Kitsu read state for series {Id}", externalSeriesId);
            return 0;
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
            AddVND();
            // Need to get the library entry ID first
            var userResponse = await _httpClient.GetAsync($"{ApiBase}/users?filter[self]=true", token);
            userResponse.EnsureSuccessStatusCode();
            var userResult = await userResponse.Content.ReadFromJsonAsync<KitsuUserResponse>(cancellationToken: token);
            var userId = userResult?.Data?.FirstOrDefault()?.Id;
            if (userId == null) 
                return false;

            var libResponse = await _httpClient.GetAsync(
                $"{ApiBase}/library-entries?filter[userId]={userId}&filter[mangaId]={externalSeriesId}",
                token);

            libResponse.EnsureSuccessStatusCode();
            var libResult = await libResponse.Content.ReadFromJsonAsync<KitsuLibraryResponse>(cancellationToken: token);
            var libEntryId = libResult?.Data?.FirstOrDefault()?.Id;

            if (libEntryId == null)
            {
                // Create a new library entry
                var createPayload = new
                {
                    data = new
                    {
                        type = "libraryEntries",
                        attributes = new
                        {
                            progress = (int)chapterNumber,
                            status = "current"
                        },
                        relationships = new
                        {
                            user = new { data = new { type = "users", id = userId } },
                            manga = new { data = new { type = "manga", id = externalSeriesId } }
                        }
                    }
                };

                var createResponse = await _httpClient.PostAsJsonAsync($"{ApiBase}/library-entries", createPayload, token);
                if (createResponse.IsSuccessStatusCode)
                {
                    UpdateDeDup(externalSeriesId, chapterNumber);
                }
                return createResponse.IsSuccessStatusCode;
            }

            // Update existing library entry
            var updatePayload = new
            {
                data = new
                {
                    id = libEntryId,
                    type = "libraryEntries",
                    attributes = new
                    {
                        progress = (int)chapterNumber
                    }
                }
            };

            var response = await _httpClient.PatchAsJsonAsync($"{ApiBase}/library-entries/{libEntryId}", updatePayload, token);
            if (response.IsSuccessStatusCode)
            {
                UpdateDeDup(externalSeriesId, chapterNumber);
            }
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload read state to Kitsu for series {Id}", externalSeriesId);
            return false;
        }
    }

    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        try
        {
            _httpClient.ApplyBearerToken(_accessToken);
            AddVND();
            var response = await _httpClient.GetAsync($"{ApiBase}/users?filter[self]=true", token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    // ── Private ──

    // ── JSON Models ──

    private class KitsuTokenResponse
    {
        [System.Text.Json.Serialization.JsonPropertyName("access_token")]
        public string? AccessToken { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("refresh_token")]
        public string? RefreshToken { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("created_at")]
        public int CreatedAt { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("token_type")]
        public string? TokenType { get; set; }
    }

    private class KitsuSearchResponse
    {
        public List<KitsuMangaData>? Data { get; set; }
    }

    private class KitsuMangaData
    {
        public string? Id { get; set; }
        public KitsuMangaAttributes? Attributes { get; set; }
    }

    private class KitsuMangaAttributes
    {
        public string? CanonicalTitle { get; set; }
        public KitsuTitles? Titles { get; set; }
        public KitsuPosterImage? PosterImage { get; set; }
        public string? MangaType { get; set; }
        public int? ChapterCount { get; set; }
        public string? Status { get; set; }
        public string? Synopsis { get; set; }
        public decimal? AverageRating { get; set; }
        public string? StartDate { get; set; }
    }

    private class KitsuTitles
    {
        public string? En { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("en_jp")]
        public string? EnJp { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("ja_jp")]
        public string? JaJp { get; set; }
    }

    private class KitsuPosterImage
    {
        public string? Tiny { get; set; }
        public string? Small { get; set; }
        public string? Medium { get; set; }
        public string? Large { get; set; }
        public string? Original { get; set; }
    }

    private class KitsuUserResponse
    {
        public List<KitsuUserData>? Data { get; set; }
    }

    private class KitsuUserData
    {
        public string? Id { get; set; }
    }

    private class KitsuLibraryResponse
    {
        public List<KitsuLibraryData>? Data { get; set; }
    }

    private class KitsuLibraryData
    {
        public string? Id { get; set; }
        public KitsuLibraryAttributes? Attributes { get; set; }
    }

    private class KitsuLibraryAttributes
    {
        public int Progress { get; set; }
    }
}