using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// AniList scrobbler provider using OAuth2 (via proxy) and GraphQL API.
/// OAuth authorization is handled by ProxyScrobblerProvider base class;
/// search, read-state, and upload operations call the AniList GraphQL API directly.
/// https://docs.anilist.co
/// </summary>
public class AniListScrobblerProvider : ProxyScrobblerProvider
{
    private const string GraphQlEndpoint = "https://graphql.anilist.co";

    public AniListScrobblerProvider(
        IHttpClientFactory httpClientFactory,
        ILogger<AniListScrobblerProvider> logger,
        IConfiguration configuration,
        ITokenStorageService tokenStorage,
        ScrobblerTokenProtector tokenProtector)
        : base(httpClientFactory, configuration, ScrobblerProvider.AniList, logger, tokenStorage, tokenProtector)
    {
        _apiHttpClient = httpClientFactory.CreateClient("Scrobbler_AniList");
    }

    public override string? SeriesUrlTemplate => "https://anilist.co/manga/{0}";

    public override async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
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
        var response = await _apiHttpClient.PostAsJsonAsync(GraphQlEndpoint, requestBody, token);
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

    public override async Task<Dictionary<decimal, int>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
    {
        var userId = await GetUserIdAsync(token);
        if (userId == null) return [];

        var query = @"
            query ($id: Int) {
                MediaList(userId: $userId, mediaId: $id, type: MANGA) {
                    progress
                    progressVolumes
                }
            }";

        var requestBody = new
        {
            query,
            variables = new { id = int.Parse(externalSeriesId) }
        };

        _apiHttpClient.ApplyBearerToken(_accessToken);
        var response = await _apiHttpClient.PostAsJsonAsync(GraphQlEndpoint, requestBody, token);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<AniListMediaListResponse>(cancellationToken: token);
        var chapters = new Dictionary<decimal, int>();

        if (result?.Data?.MediaList?.Progress.HasValue == true)
        {
            var progress = result.Data.MediaList.Progress.Value;
            for (decimal i = 1; i <= progress; i++)
                chapters[i] = 0;
        }

        return chapters;
    }

    public override Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default)
        => GetChaptersReadTotalAsync(externalSeriesId, token);

    public override async Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default)
    {
        try
        {
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

            _apiHttpClient.ApplyBearerToken(_accessToken);
            var response = await _apiHttpClient.PostAsJsonAsync(GraphQlEndpoint, requestBody, token);
            response.EnsureSuccessStatusCode();
            return true;
        }
        catch (Exception ex)
        {
            base._logger.LogError(ex, "Failed to upload read state to AniList for series {SeriesId}", externalSeriesId);
            return false;
        }
    }

    public override Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default)
        => UploadChapterReadAsync(externalSeriesId, totalChapters, 0, token);

    // ── Private Helpers ──

    private async Task<int?> GetUserIdAsync(CancellationToken token)
    {
        try
        {
            _apiHttpClient.ApplyBearerToken(_accessToken);
            var query = @"{ Viewer { id } }";
            var response = await _apiHttpClient.PostAsJsonAsync(GraphQlEndpoint, new { query }, token);
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
            _apiHttpClient.ApplyBearerToken(_accessToken);
            var query = @"
                query ($id: Int) {
                    MediaList(mediaId: $id, type: MANGA) {
                        progress
                    }
                }";

            var requestBody = new { query, variables = new { id = int.Parse(externalSeriesId) } };
            var response = await _apiHttpClient.PostAsJsonAsync(GraphQlEndpoint, requestBody, token);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<AniListMediaListResponse>(cancellationToken: token);
            return result?.Data?.MediaList?.Progress ?? 0;
        }
        catch
        {
            return 0;
        }
    }

    // ── JSON Models ──

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