using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;

namespace KaizokuBackend.Services.Scrobbling.Abstractions;

/// <summary>
/// Interface that each scrobbler/tracker provider must implement.
/// Supports OAuth2 (AniList, MAL, Kitsu, MangaDex) and API Key (ComicVine) auth.
/// </summary>
public interface IScrobblerProvider
{
    /// <summary>
    /// Identifies which provider this is.
    /// </summary>
    ScrobblerProvider ProviderType { get; }

    /// <summary>
    /// Human-readable name (e.g. "MyAnimeList", "AniList").
    /// </summary>
    string DisplayName { get; }

    /// <summary>
    /// Whether this provider requires OAuth (true) or an API key (false).
    /// </summary>
    bool RequiresOAuth { get; }

    // ── Auth: OAuth ──
    /// <summary>
    /// Generates the authorization URL for OAuth flow.
    /// </summary>
    Task<ScrobblerAuthUrlResult> GetAuthorizationUrlAsync(string redirectUri, string state);

    /// <summary>
    /// Exchanges the authorization code for access/refresh tokens.
    /// </summary>
    Task<ScrobblerTokenResult> ExchangeCodeAsync(string code, string redirectUri);

    /// <summary>
    /// Refreshes an expired access token using the refresh token.
    /// </summary>
    Task<ScrobblerTokenResult> RefreshTokenAsync(string refreshToken);

    // ── Auth: API Key ──
    /// <summary>
    /// Validates that the provided API key works with the external service.
    /// </summary>
    Task<bool> ValidateApiKeyAsync(string apiKey);

    // ── Series Search & Matching ──
    /// <summary>
    /// Searches the external service for a series by title.
    /// Results should include the primary title AND any alternate/synonym titles.
    /// </summary>
    Task<List<ScrobblerSearchResult>> SearchSeriesAsync(string query, CancellationToken token = default);

    // ── Read State (Download - from external to local) ──
    /// <summary>
    /// Gets all chapters read for a specific series on the external service.
    /// Returns a dictionary of chapterNumber -> lastPageRead.
    /// </summary>
    Task<Dictionary<decimal, int>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default);

    /// <summary>
    /// Gets the total number of chapters read for a series (for services that only
    /// track total count, not individual chapters).
    /// </summary>
    Task<int> GetTotalChaptersReadAsync(string externalSeriesId, CancellationToken token = default);

    // ── Read State (Upload - from local to external) ──
    /// <summary>
    /// Marks a chapter as read on the external service.
    /// Returns true if the operation succeeded.
    /// </summary>
    Task<bool> UploadChapterReadAsync(string externalSeriesId, decimal chapterNumber, int page, CancellationToken token = default);

    /// <summary>
    /// Updates the total chapters read count for series-level tracking services.
    /// </summary>
    Task<bool> UpdateTotalChaptersReadAsync(string externalSeriesId, int totalChapters, CancellationToken token = default);

    // ── Health ──
    /// <summary>
    /// Validates that the stored credentials are still valid.
    /// </summary>
    Task<bool> ValidateTokenAsync(CancellationToken token = default);
}

// ── Shared DTOs for auth ──

public class ScrobblerAuthUrlResult
{
    public string AuthUrl { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string? CodeVerifier { get; set; } // PKCE
}

public class ScrobblerTokenResult
{
    public bool Success { get; set; }
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public string? ErrorMessage { get; set; }
}