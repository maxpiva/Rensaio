using System.Net.Http.Headers;
using System.Net.Http.Json;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// MangaDex scrobbler provider using OAuth2 (OpenID Connect) and REST v5 API.
/// Most comprehensive manga-specific tracking support.
/// https://api.mangadex.org
/// </summary>
public class MangaDexScrobblerProvider : IScrobblerProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<MangaDexScrobblerProvider> _logger;
    private readonly ScrobblerConfiguration _config;

    private const string AuthBase = "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect";
    private const string ApiBase = "https://api.mangadex.org";

    public ScrobblerProvider ProviderType => ScrobblerProvider.MangaDex;
    public string DisplayName => "MangaDex";
    public bool RequiresOAuth => true;

    public MangaDexScrobblerProvider(IHttpClientFactory httpClientFactory, ILogger<MangaDexScrobblerProvider> logger, IConfiguration configuration)
    {
        _httpClient = httpClientFactory.CreateClient("Scrobbler_MangaDex");
        _logger = logger;
        _config = configuration.GetSection("Scrobbling:MangaDex").Get<ScrobblerConfiguration>() ?? new ScrobblerConfiguration();
    }

    public Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
    {
        var authUrl = $"{AuthBase}/auth?response_type=code" +
                      $"&client_id={_config.ClientId}" +
                      $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                      $"&state={state}" +
                      $"&scope=openid";

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

            var json = await response.Content.ReadFromJsonAsync<MdTokenResponse>();
            if (json == null || string.IsNullOrEmpty(json.AccessToken))
                return new ScrobblerTokenResult { Success = false, ErrorMessage = "Failed to parse token response" };

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
            _logger.LogError(ex, "MangaDex token exchange failed");
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

            var json = await response.Content.ReadFromJsonAsync<MdTokenResponse>();
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
            _logger.LogError(ex, "MangaDex token refresh failed");
            return new ScrobblerTokenResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    public Task<bool> ValidateApiKeyAsync(string apiKey) => Task.FromResult(false);

    public async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
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

    public async Task<Dictionary<decimal, int>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
    {
        try
        {
            var chapters = new Dictionary<decimal, int>();
            var userId = await GetUserIdAsync(token);
            if (userId == null) return chapters;

            var response = await _httpClient.GetAsync(
                $"{ApiBase}/user/{userId}/manga/{externalSeriesId}/status",
                token);

            response.EnsureSuccessStatusCode();

            // Get the reading history
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
                        decimal.TryParse(chapter.Attributes.Chapter, out var chapterNum))
                    {
                        chapters[chapterNum] = 0; // page-level detail not available from MangaDex
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

    public async Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default)
    {
        var chapters = await GetReadChaptersAsync(externalSeriesId, token);
        return chapters.Count;
    }

    public async Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default)
    {
        try
        {
            var payload = new
            {
                chapter = chapterNumber.ToString()
            };

            var response = await _httpClient.PostAsJsonAsync(
                $"{ApiBase}/manga/{externalSeriesId}/progress",
                payload,
                token);

            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload read state to MangaDex for series {Id}", externalSeriesId);
            return false;
        }
    }

    public Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default)
        => UploadChapterReadAsync(externalSeriesId, totalChapters, 0, token);

    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        try
        {
            var response = await _httpClient.GetAsync($"{ApiBase}/user/me", token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    // ── Private Helpers ──

    private async Task<string?> GetUserIdAsync(CancellationToken token)
    {
        try
        {
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