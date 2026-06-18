using RensaioOAuthProxy.Models;
using RensaioOAuthProxy.Services;
using Microsoft.AspNetCore.Mvc;

namespace RensaioOAuthProxy.Controllers;

[ApiController]
[Route("api/oauth")]
public class OAuthController : ControllerBase
{
    private readonly ProviderApiService _providerApi;
    private readonly TokenStoreService _tokenStore;
    private readonly ILogger<OAuthController> _logger;

    public OAuthController(
        ProviderApiService providerApi,
        TokenStoreService tokenStore,
        ILogger<OAuthController> logger)
    {
        _providerApi = providerApi;
        _tokenStore = tokenStore;
        _logger = logger;
    }

    [HttpPost("{provider}/url")]
    public async Task<ActionResult<OAuthUrlResponseDto>> GetAuthUrl(
        string provider,
        [FromHeader(Name = "X-Instance-Key")] string instanceKey)
    {
        if (string.IsNullOrWhiteSpace(instanceKey))
            return Unauthorized(new ErrorResponseDto { Error = "X-Instance-Key header required" });

        try
        {
            var state = Guid.NewGuid().ToString("N");
            var redirectUri = $"{Request.Scheme}://{Request.Host}/api/oauth/{provider}/callback";
            var authUrl = await _providerApi.GenerateAuthUrlAsync(provider, redirectUri, state);

            _tokenStore.Store(state, instanceKey, provider);

            return Ok(new OAuthUrlResponseDto { AuthUrl = authUrl, State = state });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ErrorResponseDto { Error = ex.Message });
        }
    }

    [HttpGet("{provider}/callback")]
    public async Task<IActionResult> Callback(
        string provider,
        [FromQuery] string code,
        [FromQuery] string state,
        [FromQuery] string? redirectUri = null)
    {
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
            return BadRequest(new ErrorResponseDto { Error = "Missing code or state parameter" });

        var tokenEntry = _tokenStore.Retrieve(state);
        if (tokenEntry == null)
            return BadRequest(new ErrorResponseDto { Error = "Invalid state — authorization session not found" });

        try
        {
            var callbackUri = redirectUri ?? $"{Request.Scheme}://{Request.Host}/api/oauth/{provider}/callback";
            var tokenResult = await _providerApi.ExchangeCodeAsync(provider, code, callbackUri);

            // Store plaintext in memory (ephemeral, 5-min TTL, never persisted)
            _tokenStore.SetTokens(state, tokenResult.AccessToken, tokenResult.RefreshToken, tokenResult.ExpiresAt);

            var providerName = provider.ToLowerInvariant() switch
            {
                "anilist" => "AniList",
                "myanimelist" or "mal" => "MyAnimeList",
                "kitsu" => "Kitsu",
                "mangadex" => "MangaDex",
                _ => provider
            };

            return Content($@"<!DOCTYPE html>
<html lang=""en"">
<head><meta charset=""utf-8""><title>Rensaiō — Complete</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:hsl(20,14.3%,4.1%);color:hsl(0,0%,95%)}}
@media(prefers-color-scheme:light){{body{{background:hsl(0,0%,100%);color:hsl(240,10%,3.9%)}}.card{{background:hsl(180,8.2%,90.2%)}}}}
.card{{background:hsl(24,9.8%,10%);border-radius:12px;padding:2.5rem 3rem;text-align:center;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,0.3)}}
.logo{{font-size:1.5rem;font-weight:700;letter-spacing:-0.02em;color:hsl(346.8,77.2%,49.8%);margin-bottom:1.25rem}}
.logo span{{color:hsl(0,0%,95%)}}
@media(prefers-color-scheme:light){{.logo span{{color:hsl(240,10%,3.9%)}}}}
.mark{{width:48px;height:48px;border-radius:50%;border:3px solid hsl(346.8,77.2%,49.8%);display:inline-flex;align-items:center;justify-content:center;margin-bottom:1rem}}
.mark::after{{content:'';display:block;width:14px;height:24px;border:solid hsl(346.8,77.2%,49.8%);border-width:0 3px 3px 0;transform:rotate(45deg) translateY(-2px)}}
h1{{font-size:1.125rem;font-weight:600;margin-bottom:0.5rem}}
p{{font-size:0.875rem;opacity:0.7;margin-bottom:1.5rem}}
.pill{{display:inline-block;background:hsl(346.8,77.2%,49.8%);color:hsl(355.7,100%,97.3%);font-size:0.75rem;font-weight:600;padding:0.25rem 0.75rem;border-radius:999px;text-transform:uppercase;letter-spacing:0.04em}}
.hint{{font-size:0.75rem;opacity:0.4;margin-top:1.5rem}}
</style></head><body>
<div class=""card"">
<div class=""logo"">Rensaiō</span></div>
<div class=""mark""></div>
<h1>Authentication Complete</h1>
<p>Your {providerName} account has been connected to Rensaiō.</p>
<div class=""pill"">Connected</div>
<p class=""hint"">You may close this window.</p></div>
<script>(function(){{try{{if(window.opener){{window.opener.postMessage({{type:'oauth-success',provider:'{provider}',state:'{state}'}},'*')}}}}catch(e){{}}}})()</script>
</body></html>", "text/html");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OAuth callback failed for provider {Provider}", provider);
            return StatusCode(500, new ErrorResponseDto { Error = "Token exchange failed" });
        }
    }

    [HttpPost("{provider}/token")]
    public ActionResult<TokenRetrieveResponseDto> GetToken(
        string provider,
        [FromBody] TokenRetrieveRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.State))
            return BadRequest(new ErrorResponseDto { Error = "State is required" });

        var tokenEntry = _tokenStore.Remove(request.State);
        if (tokenEntry == null)
            return NotFound(new ErrorResponseDto { Error = "No tokens found for this state" });

        return Ok(new TokenRetrieveResponseDto
        {
            AccessToken = tokenEntry.AccessToken ?? string.Empty,
            RefreshToken = tokenEntry.RefreshToken,
            ExpiresAt = tokenEntry.ExpiresAt
        });
    }

    [HttpPost("{provider}/refresh")]
    public async Task<ActionResult<TokenRefreshResponseDto>> RefreshToken(
        string provider,
        [FromBody] TokenRefreshRequestDto request,
        [FromHeader(Name = "X-Instance-Key")] string instanceKey)
    {
        if (string.IsNullOrWhiteSpace(instanceKey))
            return Unauthorized(new ErrorResponseDto { Error = "X-Instance-Key header required" });

        try
        {
            var tokenResult = await _providerApi.RefreshTokenAsync(provider, request.RefreshToken);
            return Ok(new TokenRefreshResponseDto
            {
                AccessToken = tokenResult.AccessToken,
                RefreshToken = tokenResult.RefreshToken,
                ExpiresAt = tokenResult.ExpiresAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token refresh failed for provider {Provider}", provider);
            return StatusCode(500, new ErrorResponseDto { Error = "Token refresh failed" });
        }
    }
}