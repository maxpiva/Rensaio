using System.Net.Http.Json;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// MyAnimeList scrobbler provider using OAuth2 Authorization Code and REST v2 API.
/// https://myanimelist.net/apiconfig
/// </summary>
public class MyAnimeListScrobblerProvider : IScrobblerProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<MyAnimeListScrobblerProvider> _logger;
    private readonly ScrobblerConfiguration _config;

    private const string AuthBase = "https://myanimelist.net/v1/oauth2";
    private const string ApiBase = "https://api.myanimelist.net/v2";

    public ScrobblerProvider ProviderType => ScrobblerProvider.MyAnimeList;
    public string DisplayName => "MyAnimeList";
    public bool RequiresOAuth => true;

    public MyAnimeListScrobblerProvider(IHttpClientFactory httpClientFactory, ILogger<MyAnimeListScrobblerProvider> logger, IConfiguration configuration)
    {
        _httpClient = httpClientFactory.CreateClient("Scrobbler_MAL");
        _logger = logger;
        _config = configuration.GetSection("Scrobbling:MyAnimeList").Get<ScrobblerConfiguration>() ?? new ScrobblerConfiguration();
    }

    public Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
    {
        var authUrl = $"{AuthBase}/authorize?response_type=code" +
                      $"&client_id={_config.ClientId}" +
                      $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                      $"&state={state}" +
                      $"&code_challenge=kaizoku_mal_state_{state}";

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

            var json = await response.Content.ReadFromJsonAsync<MalTokenResponse>();
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
            _logger.LogError(ex, "MAL token exchange failed");
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

            var json = await response.Content.ReadFromJsonAsync<MalTokenResponse>();
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
            _logger.LogError(ex, "MAL token refresh failed");
            return new ScrobblerTokenResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    public Task<bool> ValidateApiKeyAsync(string apiKey) => Task.FromResult(false);

    public async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
        var response = await _httpClient.GetAsync(
            $"{ApiBase}/manga?q={Uri.EscapeDataString(query)}&limit=25&fields=id,title,alternative_titles,main_picture,media_type,status,num_chapters,synopsis,mean,start_date",
            token);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<MalSearchResponse>(cancellationToken: token);
        var results = new List<ScrobblerSearchResult>();

        if (result?.Data == null) return results;

        foreach (var item in result.Data)
        {
            var node = item.Node;
            if (node == null) continue;

            var altTitles = new List<string>();
            if (node.AlternativeTitles != null)
            {
                if (!string.IsNullOrEmpty(node.AlternativeTitles.En) &&
                    !string.Equals(node.Title, node.AlternativeTitles.En, StringComparison.OrdinalIgnoreCase))
                    altTitles.Add(node.AlternativeTitles.En);
                if (!string.IsNullOrEmpty(node.AlternativeTitles.Ja))
                    altTitles.Add(node.AlternativeTitles.Ja);
                if (node.AlternativeTitles.Synonyms != null)
                    altTitles.AddRange(node.AlternativeTitles.Synonyms);
            }

            results.Add(new ScrobblerSearchResult
            {
                ExternalId = node.Id.ToString(),
                Title = node.Title ?? query,
                AlternateTitles = altTitles,
                CoverUrl = node.MainPicture?.Large ?? node.MainPicture?.Medium,
                Type = node.MediaType,
                ChapterCount = node.NumChapters,
                Status = node.Status,
                Synopsis = node.Synopsis,
                Score = node.Mean,
                Year = node.StartDate?.ToString()
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
            var response = await _httpClient.GetAsync(
                $"{ApiBase}/manga/{externalSeriesId}?fields=my_list_status",
                token);

            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<MalMangaDetailResponse>(cancellationToken: token);
            return result?.MyListStatus?.NumChaptersRead ?? 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get MAL read state for series {Id}", externalSeriesId);
            return 0;
        }
    }

    public async Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default)
    {
        try
        {
            var currentTotal = await GetTotalChaptersReadAsync(externalSeriesId, token);
            var newTotal = (int)Math.Max(currentTotal, (int)chapterNumber);

            var formData = new Dictionary<string, string>
            {
                ["num_chapters_read"] = newTotal.ToString()
            };

            var response = await _httpClient.PatchAsync(
                $"{ApiBase}/manga/{externalSeriesId}/my_list_status",
                new FormUrlEncodedContent(formData),
                token);

            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload read state to MAL for series {Id}", externalSeriesId);
            return false;
        }
    }

    public Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default)
        => UploadChapterReadAsync(externalSeriesId, totalChapters, 0, token);

    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        try
        {
            var response = await _httpClient.GetAsync($"{ApiBase}/users/@me", token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    // ── JSON Models ──

    private class MalTokenResponse
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

    private class MalSearchResponse
    {
        public List<MalSearchDataItem>? Data { get; set; }
    }

    private class MalSearchDataItem
    {
        public MalMangaNode? Node { get; set; }
    }

    private class MalMangaNode
    {
        public int Id { get; set; }
        public string? Title { get; set; }
        public MalAlternativeTitles? AlternativeTitles { get; set; }
        public MalMainPicture? MainPicture { get; set; }
        public string? MediaType { get; set; }
        public string? Status { get; set; }
        public int? NumChapters { get; set; }
        public string? Synopsis { get; set; }
        public decimal? Mean { get; set; }
        public string? StartDate { get; set; }
    }

    private class MalAlternativeTitles
    {
        public string? En { get; set; }
        public string? Ja { get; set; }
        public List<string>? Synonyms { get; set; }
    }

    private class MalMainPicture
    {
        public string? Medium { get; set; }
        public string? Large { get; set; }
    }

    private class MalMangaDetailResponse
    {
        public int Id { get; set; }
        public string? Title { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("my_list_status")]
        public MalMyListStatus? MyListStatus { get; set; }
    }

    private class MalMyListStatus
    {
        [System.Text.Json.Serialization.JsonPropertyName("num_chapters_read")]
        public int NumChaptersRead { get; set; }
    }
}