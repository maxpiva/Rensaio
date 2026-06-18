using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Scrobbling.Abstractions;
using RensaioBackend.Services.Settings;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace RensaioBackend.Services.Scrobbling.Providers;

/// <summary>
/// MyAnimeList scrobbler provider using OAuth2 (via proxy) and REST v2 API.
/// OAuth authorization is handled by ProxyScrobblerProvider base class;
/// search, read-state, and upload operations call the MAL API directly.
/// https://myanimelist.net/apiconfig
/// </summary>
public class MyAnimeListScrobblerProvider : ProxyScrobblerProvider
{
    private const string ApiBase = "https://api.myanimelist.net/v2";

    public MyAnimeListScrobblerProvider(
        IHttpClientFactory httpClientFactory,
        ILogger<MyAnimeListScrobblerProvider> logger,
        IConfiguration configuration,
        ITokenStorageService tokenStorage,
        ScrobblerTokenProtector tokenProtector,
        SettingsService settingsService)
        : base(httpClientFactory, configuration, ScrobblerProvider.MyAnimeList, logger, tokenStorage, tokenProtector)
    {
        _apiHttpClient = httpClientFactory.CreateClient("Scrobbler_MAL");
        _settingsService = settingsService;
    }
    private static ConcurrentDictionary<string, decimal> _dedupState = new();

    private readonly SettingsService _settingsService;

    public override string? SeriesUrlTemplate => "https://myanimelist.net/manga/{0}";

    public override async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
        _apiHttpClient.ApplyBearerToken(_accessToken);
        var nsfwParam = _settingsService.DirectSettings?.NsfwVisibility == NsfwVisibility.Show ? "&nsfw=true" : "";
        var response = await _apiHttpClient.GetAsync(
            $"{ApiBase}/manga?q={Uri.EscapeDataString(query)}&limit=25&fields=id,title,alternative_titles,main_picture,media_type,status,num_chapters,synopsis,mean,start_date{nsfwParam}",
            token);

        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<MalSearchResponse>(cancellationToken: token);
        var results = new List<ScrobblerSearchResult>();

        if (result?.Data == null) return results;

        foreach (var item in result.Data)
        {
            var node = item.Node;
            if (node == null) continue;
            if (node.MediaType!=null && node.MediaType.Contains("novel", StringComparison.InvariantCultureIgnoreCase))
                continue;
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

    public override async Task<Dictionary<decimal, float>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
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
            _apiHttpClient.ApplyBearerToken(_accessToken);
            var response = await _apiHttpClient.GetAsync(
                $"{ApiBase}/manga/{externalSeriesId}?fields=my_list_status",
                token);

            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<MalMangaDetailResponse>(cancellationToken: token);
            return result?.MyListStatus?.NumChaptersRead ?? 0;
        }
        catch (Exception ex)
        {
            base._logger.LogError(ex, "Failed to get MAL read state for series {Id}", externalSeriesId);
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
    public override async Task<bool> SetReadChaptersAsync(string externalSeriesId, Dictionary<decimal, float> chapterState, CancellationToken token = default)
    {
        try
        {
            decimal chapterNumber = chapterState.Where(a => a.Value == 1.0f).Select(a => a.Key).DefaultIfEmpty(0).Max();
            if (DeDup(externalSeriesId, chapterNumber))
                return true;
            var currentTotal = await GetTotalChaptersReadAsync(externalSeriesId, token);
            if (chapterNumber < currentTotal || chapterNumber <= 0)
                return true;  // No update needed
            int newTotal = (int)chapterNumber;
            var formData = new Dictionary<string, string>
            {
                ["num_chapters_read"] = newTotal.ToString()
            };

            _apiHttpClient.ApplyBearerToken(_accessToken);
            var response = await _apiHttpClient.PatchAsync(
                $"{ApiBase}/manga/{externalSeriesId}/my_list_status",
                new FormUrlEncodedContent(formData),
                token);
            if (response.IsSuccessStatusCode)
            {
                UpdateDeDup(externalSeriesId, chapterNumber);
            }
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            base._logger.LogError(ex, "Failed to upload read state to MAL for series {Id}", externalSeriesId);
            return false;
        }
    }


    // ── JSON Models ──

    private class MalSearchResponse
    {
        [JsonPropertyName("data")]
        public List<MalSearchDataItem>? Data { get; set; }
    }

    private class MalSearchDataItem
    {
        [JsonPropertyName("node")]
        public MalMangaNode? Node { get; set; }
    }

    private class MalMangaNode
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        [JsonPropertyName("title")]
        public string? Title { get; set; }
        [JsonPropertyName("alternative_titles")]
        public MalAlternativeTitles? AlternativeTitles { get; set; }
        [JsonPropertyName("main_picture")]
        public MalMainPicture? MainPicture { get; set; }
        [JsonPropertyName("media_type")]
        public string? MediaType { get; set; }
        [JsonPropertyName("status")]
        public string? Status { get; set; }
        [JsonPropertyName("num_chapters")]
        public int? NumChapters { get; set; }
        [JsonPropertyName("synopsis")]
        public string? Synopsis { get; set; }
        [JsonPropertyName("mean")]
        public decimal? Mean { get; set; }
        [JsonPropertyName("start_date")]
        public string? StartDate { get; set; }
    }

    private class MalAlternativeTitles
    {
        [JsonPropertyName("en")]
        public string? En { get; set; }
        [JsonPropertyName("ja")]
        public string? Ja { get; set; }
        [JsonPropertyName("synonyms")]
        public List<string>? Synonyms { get; set; }
    }

    private class MalMainPicture
    {
        [JsonPropertyName("medium")]
        public string? Medium { get; set; }
        [JsonPropertyName("large")]
        public string? Large { get; set; }
    }

    private class MalMangaDetailResponse
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        [JsonPropertyName("title")]
        public string? Title { get; set; }
        [JsonPropertyName("my_list_status")]
        public MalMyListStatus? MyListStatus { get; set; }
    }

    private class MalMyListStatus
    {
        [JsonPropertyName("num_chapters_read")]
        public int NumChaptersRead { get; set; }
    }
}