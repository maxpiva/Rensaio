using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;

namespace RensaioBackend.Services.Scrobbling.Abstractions;

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
    /// Human-readable name (e.g. "MyAnimeList", "AniList").
    /// </summary>
    string? Icon { get; }

    /// <summary>
    /// Optional URL to the provider's website or profile settings page.
    /// </summary>
    string? Link { get; }

    /// <summary>
    /// Optional short description for the link (e.g. "Settings page", "Create API client").
    /// </summary>
    string? LinkDescription { get; }

    /// <summary>
    /// URL template for a series detail page on this provider.
    /// Use {0} as placeholder for the external series ID.
    /// Example: "https://anilist.co/manga/{0}"
    /// </summary>
    string? SeriesUrlTemplate { get; }

    /// <summary>
    /// URL template for cover/thumbnail images from this provider.
    /// Use {0} as placeholder for the image identifier.
    /// Example: "https://uploads.mangadex.org/covers/{0}"
    /// </summary>
    string? ImageTemplateUrl { get; }

    /// <summary>
    /// Whether this provider requires OAuth (true) or an API key (false).
    /// </summary>
    bool RequiresOAuth { get; }

    /// <summary>
    /// Whether this provider supports direct password-based authentication.
    /// True for Kitsu and MangaDex, false for providers using the OAuth proxy.
    /// </summary>
    bool SupportsDirectAuth { get; }

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

    // ── Auth: Direct (password grant) ──
    /// <summary>
    /// Authenticates via password grant. Only valid when <see cref="SupportsDirectAuth"/> is true.
    /// Throws <see cref="NotSupportedException"/> otherwise.
    /// </summary>
    Task<ScrobblerTokenResult> AuthenticateDirectAsync(DirectAuthRequest request);

    /// <summary>
    /// Sets the bearer access token on the underlying HTTP client for subsequent API calls.
    /// </summary>
    void SetAccessToken(string accessToken, Guid userid);

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
    Task<Dictionary<decimal, float>> GetReadChaptersAsync(string externalSeriesId, CancellationToken token = default);
    // ── Read State (UPload - from local to external) ──
    /// <summary>
    /// Sets the read state for all chapters of a specific series on the external service.
    /// </summary>
    Task<bool> SetReadChaptersAsync(string externalSeriesId, Dictionary<decimal, float> chapterState, CancellationToken token = default);


    // ── Token Lifecycle ──
    /// <summary>
    /// Loads the user's stored credentials, decrypts them, checks expiry,
    /// refreshes via the provider's auth endpoint if needed, persists the
    /// new tokens back to the DB, and sets the active token on this provider.
    /// Each provider implements this according to its own auth architecture.
    /// </summary>
    Task EnsureAuthenticatedAsync(Guid userId, CancellationToken token = default);

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

/// <summary>
/// Request DTO for direct password-based authentication.
/// </summary>
public class DirectAuthRequest
{
    public string? Username { get; set; }   // email for Kitsu, username for MangaDex
    public string? Password { get; set; }
    public string? ClientId { get; set; }       // MangaDex personal client only
    public string? ClientSecret { get; set; }   // MangaDex personal client only
}

/// <summary>
/// Deserialized payload stored inside the encrypted RefreshToken field for direct auth providers.
/// For Kitsu: only RefreshToken is populated.
/// For MangaDex: RefreshToken + ClientId + ClientSecret are populated.
/// </summary>
internal class ScrobblerRefreshPayload
{
    public string RefreshToken { get; set; } = string.Empty;
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
}