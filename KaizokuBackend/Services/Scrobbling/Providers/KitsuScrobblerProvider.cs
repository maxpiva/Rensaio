using System.Net.Http.Json;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// Kitsu scrobbler provider using OAuth2 and JSON:API v1.
/// https://kitsu.io/api/edge
/// </summary>
public class KitsuScrobblerProvider : IScrobblerProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<KitsuScrobblerProvider> _logger;
    private readonly ScrobblerConfiguration _config;

    private const string AuthBase = "https://kitsu.io/api/oauth";
    private const string ApiBase = "https://kitsu.io/api/edge";

    public ScrobblerProvider ProviderType => ScrobblerProvider.Kitsu;
    public string DisplayName => "Kitsu";
    public bool RequiresOAuth => true;

    public KitsuScrobblerProvider(IHttpClientFactory httpClientFactory, ILogger<KitsuScrobblerProvider> logger, IConfiguration configuration)
    {
        _httpClient = httpClientFactory.CreateClient("Scrobbler_Kitsu");
        _logger = logger;
        _config = configuration.GetSection("Scrobbling:Kitsu").Get<ScrobblerConfiguration>() ?? new ScrobblerConfiguration();
    }

    public Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
    {
        var authUrl = $"{AuthBase}/authorize?response_type=code" +
                      $"&client_id={_config.ClientId}" +
                      $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                      $"&state={state}";

        return Task.FromResult(new ScrobblerAuthUrlResult
        {
            AuthUrl = authUrl,
            State = state
        });
    }

    public async Task<ScrobblerTokenResult> ExchangeCodeAsync(string code, string redirectUri)
    {
        try
        {
            var formData = new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["client_id"] = _config.ClientId!,
                ["client_secret"] = _config.ClientSecret!,
                ["redirect_uri"] = redirectUri,
                ["code"] = code
            };

            var response = await _httpClient.PostAsync($"{AuthBase}/token",
                new FormUrlEncodedContent(formData));

            var json = await response.Content.ReadFromJsonAsync<KitsuTokenResponse>();
            if (json == null || string.IsNullOrEmpty(json.AccessToken))
                return new ScrobblerTokenResult { Success = false, ErrorMessage = "Failed to parse token response" };

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
            _logger.LogError(ex, "Kitsu token exchange failed");
            return new ScrobblerTokenResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    public async Task<ScrobblerTokenResult> RefreshTokenAsync(string refreshToken)
    {
        try
        {
            var formData = new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["client_id"] = _config.ClientId!,
                ["client_secret"] = _config.ClientSecret!,
                ["refresh_token"] = refreshToken
            };

            var response = await _httpClient.PostAsync($"{AuthBase}/token",
                new FormUrlEncodedContent(formData));

            var json = await response.Content.ReadFromJsonAsync<KitsuTokenResponse>();
            if (json == null || string.IsNullOrEmpty(json.AccessToken))
                return new ScrobblerTokenResult { Success = false, ErrorMessage = "Failed to refresh token" };

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

    public Task<bool> ValidateApiKeyAsync(string apiKey) => Task.FromResult(false);

    public async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
        var response = await _httpClient.GetAsync(
            $"{ApiBase}/manga?filter[text]={Uri.EscapeDataString(query)}&page[limit]=25&include=categories",
            token);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<KitsuSearchResponse>(cancellationToken: token);
        var results = new List<ScrobblerSearchResult>();

        if (result?.Data == null) return results;

        foreach (var item in result.Data)
        {
            var attr = item.Attributes;
            if (attr == null) continue;

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

    public async Task<Dictionary<decimal, int>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
    {
        var total = await GetTotalChaptersReadAsync(externalSeriesId, token);
        var chapters = new Dictionary<decimal, int>();
        for (decimal i = 1; i <= total; i++)
            chapters[i] = 0;
        return chapters;
    }

    public async Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default)
    {
        try
        {
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

    public async Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default)
    {
        try
        {
            // Need to get the library entry ID first
            var userResponse = await _httpClient.GetAsync($"{ApiBase}/users?filter[self]=true", token);
            userResponse.EnsureSuccessStatusCode();
            var userResult = await userResponse.Content.ReadFromJsonAsync<KitsuUserResponse>(cancellationToken: token);
            var userId = userResult?.Data?.FirstOrDefault()?.Id;
            if (userId == null) return false;

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
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload read state to Kitsu for series {Id}", externalSeriesId);
            return false;
        }
    }

    public Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default)
        => UploadChapterReadAsync(externalSeriesId, totalChapters, 0, token);

    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        try
        {
            var response = await _httpClient.GetAsync($"{ApiBase}/users?filter[self]=true", token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

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