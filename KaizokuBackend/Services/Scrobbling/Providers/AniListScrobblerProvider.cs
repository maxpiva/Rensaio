using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// AniList scrobbler provider using OAuth2 with PKCE and GraphQL API.
/// https://docs.anilist.co
/// </summary>
public class AniListScrobblerProvider : IScrobblerProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<AniListScrobblerProvider> _logger;
    private readonly ScrobblerConfiguration _config;

    private const string AuthBase = "https://anilist.co/api/v2/oauth";
    private const string GraphQlEndpoint = "https://graphql.anilist.co";
    private const string AuthorizePath = "/authorize";
    private const string TokenPath = "/token";

    public ScrobblerProvider ProviderType => ScrobblerProvider.AniList;
    public string DisplayName => "AniList";
    public bool RequiresOAuth => true;

    public AniListScrobblerProvider(IHttpClientFactory httpClientFactory, ILogger<AniListScrobblerProvider> logger, IConfiguration configuration)
    {
        _httpClient = httpClientFactory.CreateClient("Scrobbler_AniList");
        _logger = logger;
        _config = configuration.GetSection("Scrobbling:AniList").Get<ScrobblerConfiguration>() ?? new ScrobblerConfiguration();
    }

    public Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
    {
        var codeVerifier = GenerateCodeVerifier();
        var codeChallenge = GenerateCodeChallenge(codeVerifier);

        var authUrl = $"{AuthBase}{AuthorizePath}?client_id={_config.ClientId}" +
                      $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                      $"&response_type=code" +
                      $"&state={state}" +
                      $"&code_challenge={codeChallenge}" +
                      $"&code_challenge_method=S256";

        return Task.FromResult(new ScrobblerAuthUrlResult
        {
            AuthUrl = authUrl,
            State = state,
            CodeVerifier = codeVerifier
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

            var response = await _httpClient.PostAsync($"{AuthBase}{TokenPath}",
                new FormUrlEncodedContent(formData));

            var json = await response.Content.ReadFromJsonAsync<AniListTokenResponse>();

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
            _logger.LogError(ex, "AniList token exchange failed");
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

            var response = await _httpClient.PostAsync($"{AuthBase}{TokenPath}",
                new FormUrlEncodedContent(formData));

            var json = await response.Content.ReadFromJsonAsync<AniListTokenResponse>();

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
            _logger.LogError(ex, "AniList token refresh failed");
            return new ScrobblerTokenResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    public Task<bool> ValidateApiKeyAsync(string apiKey) => Task.FromResult(false);

    public async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
        var graphQlQuery = @"
            query ($search: String) {
                Page(page: 1, perPage: 25) {
                    media(search: $search, type: MANGA) {
                        id
                        title { romaji english native }
                        synonyms
                        coverImage { large }
                        format
                        status
                        chapters
                        volumes
                        description
                        averageScore
                        startDate { year }
                    }
                }
            }";

        var requestBody = new { query = graphQlQuery, variables = new { search = query } };
        var response = await _httpClient.PostAsJsonAsync(GraphQlEndpoint, requestBody, token);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<AniListGraphQlResponse>(cancellationToken: token);
        var results = new List<ScrobblerSearchResult>();

        if (result?.Data?.Page?.Media == null) return results;

        foreach (var media in result.Data.Page.Media)
        {
            var altTitles = new List<string>();
            if (!string.IsNullOrEmpty(media.Title?.Romaji) && !string.Equals(media.Title.Romaji, media.Title.English, StringComparison.OrdinalIgnoreCase))
                altTitles.Add(media.Title.Romaji);
            if (!string.IsNullOrEmpty(media.Title?.English))
                altTitles.Add(media.Title.English);
            if (!string.IsNullOrEmpty(media.Title?.Native))
                altTitles.Add(media.Title.Native);
            if (media.Synonyms != null)
                altTitles.AddRange(media.Synonyms);

            results.Add(new ScrobblerSearchResult
            {
                ExternalId = media.Id.ToString(),
                Title = media.Title?.Romaji ?? media.Title?.English ?? query,
                AlternateTitles = altTitles,
                CoverUrl = media.CoverImage?.Large,
                Type = media.Format,
                ChapterCount = media.Chapters,
                Status = media.Status,
                Synopsis = media.Description,
                Score = media.AverageScore,
                Year = media.StartDate?.Year?.ToString()
            });
        }

        return results;
    }

    public async Task<Dictionary<decimal, int>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
    {
        var query = @"
            query ($id: Int) {
                MediaList(userId: $userId, mediaId: $id, type: MANGA) {
                    progress
                    progressVolumes
                }
            }";

        // Note: We need the user's AniList ID which requires an additional query.
        // For now, we use the authenticated user ID from the viewer query if cached.
        var userId = await GetUserIdAsync(token);
        if (userId == null) return [];

        var requestBody = new
        {
            query,
            variables = new { id = int.Parse(externalSeriesId) }
        };

        var response = await _httpClient.PostAsJsonAsync(GraphQlEndpoint, requestBody, token);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<AniListMediaListResponse>(cancellationToken: token);
        var chapters = new Dictionary<decimal, int>();

        if (result?.Data?.MediaList?.Progress.HasValue == true)
        {
            // AniList tracks total progress count, so mark all chapters up to that as read
            var progress = result.Data.MediaList.Progress.Value;
            for (decimal i = 1; i <= progress; i++)
                chapters[i] = 0; // page-level detail not available
        }

        return chapters;
    }

    public Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default)
        => GetChaptersReadTotalAsync(externalSeriesId, token);

    public async Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default)
    {
        try
        {
            // First get current progress to ensure we don't regress
            var currentTotal = await GetChaptersReadTotalAsync(externalSeriesId, token);
            var newProgress = (int)Math.Max(currentTotal, (int)chapterNumber);

            var mutation = @"
                mutation ($id: Int, $progress: Int) {
                    SaveMediaListEntry(mediaId: $id, progress: $progress) {
                        id
                        progress
                    }
                }";

            var requestBody = new
            {
                query = mutation,
                variables = new { id = int.Parse(externalSeriesId), progress = newProgress }
            };

            var response = await _httpClient.PostAsJsonAsync(GraphQlEndpoint, requestBody, token);
            response.EnsureSuccessStatusCode();
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload read state to AniList for series {SeriesId}", externalSeriesId);
            return false;
        }
    }

    public Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default)
        => UploadChapterReadAsync(externalSeriesId, totalChapters, 0, token);

    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        try
        {
            var query = @"{ Viewer { id } }";
            var response = await _httpClient.PostAsJsonAsync(GraphQlEndpoint, new { query }, token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    // ── Private Helpers ──

    private async Task<int?> GetUserIdAsync(CancellationToken token)
    {
        try
        {
            var query = @"{ Viewer { id } }";
            var response = await _httpClient.PostAsJsonAsync(GraphQlEndpoint, new { query }, token);
            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<AniListViewerResponse>(cancellationToken: token);
            return result?.Data?.Viewer?.Id;
        }
        catch
        {
            return null;
        }
    }

    private async Task<int> GetChaptersReadTotalAsync(string externalSeriesId, CancellationToken token)
    {
        try
        {
            var query = @"
                query ($id: Int) {
                    MediaList(mediaId: $id, type: MANGA) {
                        progress
                    }
                }";

            var requestBody = new { query, variables = new { id = int.Parse(externalSeriesId) } };
            var response = await _httpClient.PostAsJsonAsync(GraphQlEndpoint, requestBody, token);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<AniListMediaListResponse>(cancellationToken: token);
            return result?.Data?.MediaList?.Progress ?? 0;
        }
        catch
        {
            return 0;
        }
    }

    private static string GenerateCodeVerifier()
    {
        var bytes = new byte[32];
        using var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string GenerateCodeChallenge(string codeVerifier)
    {
        using var sha256 = System.Security.Cryptography.SHA256.Create();
        var bytes = sha256.ComputeHash(Encoding.ASCII.GetBytes(codeVerifier));
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    // ── JSON Models ──

    private class AniListTokenResponse
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

    private class AniListGraphQlResponse
    {
        public AniListData? Data { get; set; }
    }

    private class AniListData
    {
        public AniListPage? Page { get; set; }
    }

    private class AniListPage
    {
        public List<AniListMedia>? Media { get; set; }
    }

    private class AniListMedia
    {
        public int Id { get; set; }
        public AniListTitle? Title { get; set; }
        public List<string>? Synonyms { get; set; }
        public AniListCoverImage? CoverImage { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
        public int? Chapters { get; set; }
        public int? Volumes { get; set; }
        public string? Description { get; set; }
        public int? AverageScore { get; set; }
        public AniListStartDate? StartDate { get; set; }
    }

    private class AniListTitle
    {
        public string? Romaji { get; set; }
        public string? English { get; set; }
        public string? Native { get; set; }
    }

    private class AniListCoverImage
    {
        public string? Large { get; set; }
    }

    private class AniListStartDate
    {
        public int? Year { get; set; }
    }

    private class AniListMediaListResponse
    {
        public AniListMediaListData? Data { get; set; }
    }

    private class AniListMediaListData
    {
        public AniListMediaListEntry? MediaList { get; set; }
    }

    private class AniListMediaListEntry
    {
        public int? Progress { get; set; }
        public int? ProgressVolumes { get; set; }
    }

    private class AniListViewerResponse
    {
        public AniListViewerData? Data { get; set; }
    }

    private class AniListViewerData
    {
        public AniListViewer? Viewer { get; set; }
    }

    private class AniListViewer
    {
        public int Id { get; set; }
    }
}

internal class ScrobblerConfiguration
{
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? ApiKey { get; set; }
}