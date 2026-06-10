using System.Net.Http.Json;
using KaizokuBackend.Data;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// ComicVine scrobbler provider using API Key authentication.
/// The API key is stored in the database settings table (SettingEntity with name "Scrobbler_ComicVine_ApiKey")
/// and can be configured by the user via the frontend settings panel.
/// https://comicvine.gamespot.com/api
/// </summary>
public class ComicVineScrobblerProvider : IScrobblerProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ComicVineScrobblerProvider> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    private const string ApiBase = "https://comicvine.gamespot.com/api";

    public ScrobblerProvider ProviderType => ScrobblerProvider.ComicVine;
    public string DisplayName => "ComicVine";
    public string? Icon => ProviderIcons.ComicVine;
    public string? Link => "https://comicvine.gamespot.com/api/";
    public string? LinkDescription => "Get API Key";
    public string? SeriesUrlTemplate => "https://comicvine.gamespot.com/issue/{0}/";
    public string? ImageTemplateUrl => null;
    public bool RequiresOAuth => false;
    public bool SupportsDirectAuth => false;

    public Task<ScrobblerTokenResult> AuthenticateDirectAsync(DirectAuthRequest request)
        => throw new NotSupportedException("ComicVine does not support direct authentication.");

    public void SetAccessToken(string accessToken) { /* No-op: ComicVine uses API key, not bearer tokens */ }

    public ComicVineScrobblerProvider(
        IHttpClientFactory httpClientFactory,
        ILogger<ComicVineScrobblerProvider> logger,
        IServiceScopeFactory scopeFactory)
    {
        _httpClient = httpClientFactory.CreateClient("Scrobbler_ComicVine");
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    private async Task<string?> GetApiKeyAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var setting = await db.Settings
            .FirstOrDefaultAsync(s => s.Name == "Scrobbler_ComicVine_ApiKey");
        return setting?.Value;
    }

    public Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state)
        => throw new NotSupportedException("ComicVine does not support OAuth.");

    public Task<ScrobblerTokenResult> ExchangeCodeAsync(string code, string redirectUri)
        => throw new NotSupportedException("ComicVine does not support OAuth.");

    public Task<ScrobblerTokenResult> RefreshTokenAsync(string refreshToken)
        => throw new NotSupportedException("ComicVine does not support OAuth.");

    public Task<bool> ValidateApiKeyAsync(string apiKey)
        => Task.FromResult(!string.IsNullOrWhiteSpace(apiKey));

    public Task EnsureAuthenticatedAsync(Guid userId, CancellationToken token = default)
        => Task.CompletedTask;

    public async Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default)
    {
        var apiKey = await GetApiKeyAsync();
        if (string.IsNullOrEmpty(apiKey))
            return [];

        var response = await _httpClient.GetAsync(
            $"{ApiBase}/volumes/?filter=name:{Uri.EscapeDataString(query)}&format=json&api_key={apiKey}&field_list=id,name,aliases,image,count_of_issues,description,start_year",
            token);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<ComicVineResponse>(cancellationToken: token);
        var results = new List<ScrobblerSearchResult>();

        if (result?.Results == null) return results;

        foreach (var volume in result.Results)
        {
            var altTitles = new List<string>();
            if (!string.IsNullOrEmpty(volume.Aliases))
            {
                altTitles.AddRange(
                    volume.Aliases.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            }

            results.Add(new ScrobblerSearchResult
            {
                ExternalId = volume.Id?.ToString() ?? string.Empty,
                Title = volume.Name ?? query,
                AlternateTitles = altTitles,
                CoverUrl = volume.Image?.OriginalUrl ?? volume.Image?.MediumUrl,
                Type = "comic",
                ChapterCount = volume.CountOfIssues,
                Year = volume.StartYear?.ToString()
            });
        }

        return results;
    }

    public Task<Dictionary<decimal, int>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default)
        => Task.FromResult(new Dictionary<decimal, int>());

    public Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default)
        => Task.FromResult(0);

    public Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default)
        => Task.FromResult(false);

    public Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default)
        => Task.FromResult(false);

    public async Task<bool> ValidateTokenAsync(CancellationToken token = default)
    {
        var apiKey = await GetApiKeyAsync();
        return !string.IsNullOrEmpty(apiKey);
    }

    // ── JSON Models ──

    private class ComicVineResponse
    {
        public List<ComicVineVolume>? Results { get; set; }
    }

    private class ComicVineVolume
    {
        public int? Id { get; set; }
        public string? Name { get; set; }
        public string? Aliases { get; set; }
        public ComicVineImage? Image { get; set; }
        public int? CountOfIssues { get; set; }
        public string? Description { get; set; }
        public int? StartYear { get; set; }
    }

    private class ComicVineImage
    {
        public string? OriginalUrl { get; set; }
        public string? MediumUrl { get; set; }
    }
}