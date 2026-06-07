using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Auth;
using KaizokuBackend.Services.Scrobbling;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using KaizokuBackend.Services.Scrobbling.Providers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Controllers;

[ApiController]
[Route("api/scrobbler")]
[RequireUserLevel(UserLevel.User)]
public class ScrobblerController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ScrobblerProviderFactory _providerFactory;
    private readonly ScrobblerTokenProtector _tokenProtector;
    private readonly ScrobblerSyncService _syncService;
    private readonly SeriesMatchingService _matchingService;
    private readonly ILogger<ScrobblerController> _logger;

    public ScrobblerController(
        AppDbContext db,
        ScrobblerProviderFactory providerFactory,
        ScrobblerTokenProtector tokenProtector,
        ScrobblerSyncService syncService,
        SeriesMatchingService matchingService,
        ILogger<ScrobblerController> logger)
    {
        _db = db;
        _providerFactory = providerFactory;
        _tokenProtector = tokenProtector;
        _syncService = syncService;
        _matchingService = matchingService;
        _logger = logger;
    }

    private bool TryGetUserId(out Guid userId)
    {
        var user = HttpContext.Items["User"] as UserEntity;
        if (user != null)
        {
            userId = user.Id;
            return true;
        }
        userId = Guid.Empty;
        return false;
    }

    // ── Provider Listing ──

    /// <summary>
    /// GET /api/scrobbler/providers
    /// List available scrobbler providers with connection status.
    /// </summary>
    [HttpGet("providers")]
    public async Task<ActionResult<List<ScrobblerConfigDto>>> GetProviders()
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId)
            .ToListAsync();

        var allProviders = _providerFactory.GetAllProviders();
        var result = new List<ScrobblerConfigDto>();

        foreach (var provider in allProviders)
        {
            var config = configs.FirstOrDefault(c => c.Provider == provider.ProviderType);
            // For ComicVine, check if the API key setting exists in the DB
            bool isConnected = provider.ProviderType switch
            {
                ScrobblerProvider.ComicVine => _db.Settings.Any(s => s.Name == "Scrobbler_ComicVine_ApiKey" && s.Value != ""),
                _ => config?.AccessToken != null
            };

            result.Add(new ScrobblerConfigDto
            {
                Provider = provider.ProviderType,
                DisplayName = provider.DisplayName,
                IsEnabled = config?.IsEnabled ?? false,
                IsConnected = isConnected,
                AutoSync = config?.AutoSync ?? false,
                LastSyncAt = config?.LastSyncAt,
                LastUploadAt = config?.LastUploadAt,
                LastDownloadAt = config?.LastDownloadAt
            });
        }

        return Ok(result);
    }

    // ── Config ──

    /// <summary>
    /// GET /api/scrobbler/config
    /// Get user's scrobbler configs (tokens excluded, only connection status).
    /// </summary>
    [HttpGet("config")]
    public async Task<ActionResult<List<ScrobblerConfigDto>>> GetConfigs()
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId)
            .ToListAsync();

        var allProviders = _providerFactory.GetAllProviders();
        var result = new List<ScrobblerConfigDto>();

        foreach (var provider in allProviders)
        {
            var config = configs.FirstOrDefault(c => c.Provider == provider.ProviderType);

            bool isConnected = provider.ProviderType switch
            {
                ScrobblerProvider.ComicVine => _db.Settings.Any(s => s.Name == "Scrobbler_ComicVine_ApiKey" && s.Value != ""),
                _ => config?.AccessToken != null
            };

            result.Add(new ScrobblerConfigDto
            {
                Provider = provider.ProviderType,
                DisplayName = provider.DisplayName,
                IsEnabled = config?.IsEnabled ?? false,
                IsConnected = isConnected,
                AutoSync = config?.AutoSync ?? false,
                LastSyncAt = config?.LastSyncAt,
                LastUploadAt = config?.LastUploadAt,
                LastDownloadAt = config?.LastDownloadAt
            });
        }

        return Ok(result);
    }

    /// <summary>
    /// PUT /api/scrobbler/config
    /// Update scrobbler config: enable/disable/auto-sync toggles.
    /// </summary>
    [HttpPut("config")]
    public async Task<ActionResult> UpdateConfig([FromBody] ScrobblerConfigUpdateDto update, [FromQuery] ScrobblerProvider provider)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == provider);

        if (config == null)
            return NotFound(new { message = "Provider config not found. Connect first." });

        if (update.IsEnabled.HasValue)
            config.IsEnabled = update.IsEnabled.Value;
        if (update.AutoSync.HasValue)
            config.AutoSync = update.AutoSync.Value;

        await _db.SaveChangesAsync();
        return Ok(new { message = "Config updated" });
    }

    // ── OAuth ──

    /// <summary>
    /// POST /api/scrobbler/config/{provider}/authorize
    /// Get authorization URL for the provider.
    /// </summary>
    [HttpPost("config/{provider}/authorize")]
    public async Task<ActionResult<OAuthAuthorizeResponseDto>> Authorize(string provider)
    {
        if (!Enum.TryParse<ScrobblerProvider>(provider, true, out var providerEnum))
            return BadRequest(new { message = "Invalid provider" });

        var scrobbler = _providerFactory.GetProvider(providerEnum);
        if (scrobbler == null)
            return BadRequest(new { message = "Provider not found" });

        if (!scrobbler.RequiresOAuth)
            return BadRequest(new { message = "Provider does not use OAuth. Use API key configuration instead." });

        var state = Guid.NewGuid().ToString("N");
        var redirectUri = $"{Request.Scheme}://{Request.Host}/api/scrobbler/config/{provider}/callback";

        var result = await scrobbler.GetAuthorizationUrlAsync(redirectUri, state);

        return Ok(new OAuthAuthorizeResponseDto
        {
            AuthUrl = result.AuthUrl,
            State = result.State
        });
    }

    /// <summary>
    /// GET /api/scrobbler/callback/{provider}
    /// Called by the OAuth proxy after successful code exchange (redirect).
    /// The proxy redirects here with ?state=xxx&provider=yyy.
    /// We retrieve the encrypted tokens from the proxy using the state.
    /// </summary>
    [HttpGet("callback/{provider}")]
    public async Task<ActionResult> ProxyCallback(string provider, [FromQuery] string state)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!Enum.TryParse<ScrobblerProvider>(provider, true, out var providerEnum))
            return BadRequest(new { message = "Invalid provider" });

        var scrobbler = _providerFactory.GetProvider(providerEnum);
        if (scrobbler == null)
            return BadRequest(new { message = "Provider not found" });

        // The proxy already exchanged the code using its stored client_secret.
        // We call ExchangeCodeAsync with the state as the "code" parameter.
        // The ProxyScrobblerProvider uses HttpContextHelper.CurrentState to
        // retrieve the tokens from the proxy.
        HttpContextHelper.CurrentState = state;

        var redirectUri = $"{Request.Scheme}://{Request.Host}/api/scrobbler/config/{provider}/callback";
        var tokenResult = await scrobbler.ExchangeCodeAsync(state, redirectUri);

        HttpContextHelper.CurrentState = null;

        if (!tokenResult.Success || tokenResult.AccessToken == null)
            return BadRequest(new { message = tokenResult.ErrorMessage ?? "Failed to retrieve tokens from proxy" });

        // Encrypt tokens before storing
        var encryptedAccessToken = _tokenProtector.Encrypt(tokenResult.AccessToken);
        var encryptedRefreshToken = tokenResult.RefreshToken != null
            ? _tokenProtector.Encrypt(tokenResult.RefreshToken)
            : null;

        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == providerEnum);

        if (config != null)
        {
            config.AccessToken = encryptedAccessToken;
            config.RefreshToken = encryptedRefreshToken;
            config.TokenExpiresAt = tokenResult.ExpiresAt;
            config.IsEnabled = true;
        }
        else
        {
            _db.UserScrobblerConfigs.Add(new UserScrobblerConfigEntity
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Provider = providerEnum,
                AccessToken = encryptedAccessToken,
                RefreshToken = encryptedRefreshToken,
                TokenExpiresAt = tokenResult.ExpiresAt,
                IsEnabled = true,
                AutoSync = true
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { connected = true });
    }

    /// <summary>
    /// POST /api/scrobbler/config/{provider}/callback
    /// Exchange OAuth code for tokens (native OAuth flow, no proxy — kept for compatibility).
    /// </summary>
    [HttpPost("config/{provider}/callback")]
    public async Task<ActionResult> Callback(string provider, [FromBody] OAuthCallbackRequestDto callback)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!Enum.TryParse<ScrobblerProvider>(provider, true, out var providerEnum))
            return BadRequest(new { message = "Invalid provider" });

        var scrobbler = _providerFactory.GetProvider(providerEnum);
        if (scrobbler == null)
            return BadRequest(new { message = "Provider not found" });

        var redirectUri = $"{Request.Scheme}://{Request.Host}/api/scrobbler/config/{provider}/callback";
        var tokenResult = await scrobbler.ExchangeCodeAsync(callback.Code, redirectUri);

        if (!tokenResult.Success || tokenResult.AccessToken == null)
            return BadRequest(new { message = tokenResult.ErrorMessage ?? "Token exchange failed" });

        // Encrypt tokens before storing
        var encryptedAccessToken = _tokenProtector.Encrypt(tokenResult.AccessToken);
        var encryptedRefreshToken = tokenResult.RefreshToken != null
            ? _tokenProtector.Encrypt(tokenResult.RefreshToken)
            : null;

        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == providerEnum);

        if (config != null)
        {
            config.AccessToken = encryptedAccessToken;
            config.RefreshToken = encryptedRefreshToken;
            config.TokenExpiresAt = tokenResult.ExpiresAt;
            config.IsEnabled = true;
        }
        else
        {
            _db.UserScrobblerConfigs.Add(new UserScrobblerConfigEntity
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Provider = providerEnum,
                AccessToken = encryptedAccessToken,
                RefreshToken = encryptedRefreshToken,
                TokenExpiresAt = tokenResult.ExpiresAt,
                IsEnabled = true,
                AutoSync = true
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { connected = true });
    }

    /// <summary>
    /// DELETE /api/scrobbler/config/{provider}
    /// Disconnect provider: remove stored tokens, disable scrobbler.
    /// </summary>
    [HttpDelete("config/{provider}")]
    public async Task<ActionResult> Disconnect(string provider)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!Enum.TryParse<ScrobblerProvider>(provider, true, out var providerEnum))
            return BadRequest(new { message = "Invalid provider" });

        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == providerEnum);

        if (config != null)
        {
            config.AccessToken = null;
            config.RefreshToken = null;
            config.TokenExpiresAt = null;
            config.IsEnabled = false;
            config.AutoSync = false;
            await _db.SaveChangesAsync();
        }

        return Ok(new { message = "Disconnected" });
    }

    // ── Series Matching ──

    /// <summary>
    /// GET /api/scrobbler/matches
    /// Get series mapping status for all providers.
    /// </summary>
    [HttpGet("matches")]
    public async Task<ActionResult<List<SeriesMatchStatusDto>>> GetMatches()
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var result = await _matchingService.GetMatchStatusesAsync(userId);
        return Ok(result);
    }

    /// <summary>
    /// GET /api/scrobbler/matches/unmatched
    /// Get series that need manual matching, grouped by provider.
    /// </summary>
    [HttpGet("matches/unmatched")]
    public async Task<ActionResult<List<SeriesMatchStatusDto>>> GetUnmatched()
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var result = await _matchingService.GetUnmatchedSeriesAsync(userId);
        return Ok(result);
    }

    /// <summary>
    /// POST /api/scrobbler/matches/search
    /// Search external service for series.
    /// </summary>
    [HttpPost("matches/search")]
    public async Task<ActionResult<SeriesMatchSearchResultDto>> SearchExternal([FromBody] SeriesMatchSearchDto search)
    {
        var results = await _matchingService.SearchExternalSeriesAsync(search.Provider, search.Query);
        return Ok(new SeriesMatchSearchResultDto
        {
            Provider = search.Provider,
            Results = results
        });
    }

    /// <summary>
    /// POST /api/scrobbler/matches/auto
    /// Trigger auto-matching for a provider.
    /// </summary>
    [HttpPost("matches/auto")]
    public async Task<ActionResult<AutoMatchResultDto>> AutoMatchAll([FromQuery] ScrobblerProvider provider)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var result = await _matchingService.AutoMatchAllAsync(userId, provider);
        return Ok(result);
    }

    /// <summary>
    /// POST /api/scrobbler/matches/auto/{seriesId}
    /// Trigger auto-matching for a single series.
    /// </summary>
    [HttpPost("matches/auto/{seriesId}")]
    public async Task<ActionResult> AutoMatchSeries(Guid seriesId)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        await _matchingService.AutoMatchSeriesAsync(userId, seriesId);
        return Ok(new { message = "Auto-match completed" });
    }

    /// <summary>
    /// POST /api/scrobbler/matches/confirm
    /// User confirms a series match.
    /// </summary>
    [HttpPost("matches/confirm")]
    public async Task<ActionResult> ConfirmMatch([FromBody] ConfirmMatchRequestDto request)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        await _matchingService.ConfirmMatchAsync(userId, request.SeriesId,
            request.Provider, request.ExternalSeriesId, request.ExternalSeriesTitle);
        return Ok(new { message = "Match confirmed" });
    }

    /// <summary>
    /// POST /api/scrobbler/matches/disable
    /// Mark series as ignored/disabled for a provider.
    /// </summary>
    [HttpPost("matches/disable")]
    public async Task<ActionResult> DisableLink([FromBody] DisableLinkRequestDto request)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        await _matchingService.DisableSeriesLinkAsync(userId, request.SeriesId, request.Provider);
        return Ok(new { message = "Link disabled" });
    }

    /// <summary>
    /// DELETE /api/scrobbler/matches/{seriesId}/{provider}
    /// Remove mapping, reset to Unmatched.
    /// </summary>
    [HttpDelete("matches/{seriesId}/{provider}")]
    public async Task<ActionResult> RemoveMapping(Guid seriesId, string provider)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!Enum.TryParse<ScrobblerProvider>(provider, true, out var providerEnum))
            return BadRequest(new { message = "Invalid provider" });

        await _matchingService.RemoveMappingAsync(userId, seriesId, providerEnum);
        return Ok(new { message = "Mapping removed" });
    }

    // ── API Key Management (ComicVine) ──

    /// <summary>
    /// POST /api/scrobbler/config/comicvine/apikey
    /// Save the ComicVine API key to the database settings table.
    /// </summary>
    [HttpPost("config/comicvine/apikey")]
    public async Task<ActionResult> SaveComicVineApiKey([FromBody] ComicVineApiKeyDto dto)
    {
        var setting = await _db.Settings
            .FirstOrDefaultAsync(s => s.Name == "Scrobbler_ComicVine_ApiKey");

        if (setting != null)
        {
            setting.Value = dto.ApiKey;
        }
        else
        {
            _db.Settings.Add(new SettingEntity
            {
                Name = "Scrobbler_ComicVine_ApiKey",
                Value = dto.ApiKey
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { message = "API key saved" });
    }

    // ── Sync ──

    /// <summary>
    /// POST /api/scrobbler/sync
    /// Trigger full manual sync for user.
    /// </summary>
    [HttpPost("sync")]
    public async Task<ActionResult> TriggerSync()
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        await _syncService.SyncForUserAsync(userId);
        return Ok(new { message = "Sync completed" });
    }

    /// <summary>
    /// GET /api/scrobbler/sync/status
    /// Get last sync timestamps per provider.
    /// </summary>
    [HttpGet("sync/status")]
    public async Task<ActionResult<List<SyncStatusDto>>> GetSyncStatus()
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var result = await _matchingService.GetSyncStatusAsync(userId);
        return Ok(result);
    }
}