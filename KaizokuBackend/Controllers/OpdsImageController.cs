using KaizokuBackend.Data;
using KaizokuBackend.Extensions;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Services.Auth;
using KaizokuBackend.Services.Opds;
using KaizokuBackend.Services.ReadState;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace KaizokuBackend.Controllers;

[ApiController]
public class OpdsImageController : ControllerBase
{
    private readonly UserQueryService _userQueryService;
    private readonly OpdsImageService _imageService;
    private readonly HashCacheService _hashCacheService;
    private readonly AppDbContext _db;

    // ── Client capabilities cache ──────────────────────────────────────────
    // Shared with OpdsController via static. Same key derivation.
    private static readonly ConcurrentDictionary<string, List<string>> _clientCapabilitiesCache = new();
    private static readonly TimeSpan _clientCapabilitiesTtl = TimeSpan.FromMinutes(5);

    public OpdsImageController(UserQueryService userQueryService, OpdsImageService imageService, HashCacheService hashCacheService, AppDbContext db)
    {
        _userQueryService = userQueryService;
        _imageService = imageService;
        _hashCacheService = hashCacheService;
        _db = db;
    }

    /// <summary>
    /// GET /{opdsPath}/image/{seriesId}/{language}/{base64Filename}/{pageIndex}
    /// Serves a page image from an archived chapter, with ETag-based conditional
    /// request support (If-None-Match). Returns 304 Not Modified if the client
    /// already has a current version via a matching MD5 hash.
    /// Before serving, this ensures the chapter is loaded in the cache:
    /// - If a different chapter is currently being extracted (background preload),
    ///   that extraction is canceled and its partial cache deleted.
    /// - If the requested chapter is already cached, nothing happens.
    /// - The client waits until the requested chapter's images are ready.
    /// Captures client image capabilities for on-the-fly format conversion.
    /// </summary>
    [HttpGet("/{opdsPath}/image/{seriesId:guid}/{language}/{base64Filename}/{pageIndex:int}")]
    public async Task<ActionResult> GetPageImage(
        string opdsPath, Guid seriesId, string language, string base64Filename, int pageIndex,
        CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        // Decode the base64 filename
        string decoded;
        try
        {
            string padded = base64Filename.PadRight(base64Filename.Length + (4 - base64Filename.Length % 4) % 4, '=');
            byte[] bytes = Convert.FromBase64String(padded);
            decoded = System.Text.Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return BadRequest("Invalid chapter identifier");
        }

        // ── Look up series storage path for hash cache lookups ──
        var series = await _db.Series
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);

        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound("Series not found");

        string seriesStoragePath = series.StoragePath;

        // ── Check If-None-Match header for conditional request ──
        string? ifNoneMatch = Request.Headers.IfNoneMatch.FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(ifNoneMatch))
        {
            // ETag values from headers are quoted (e.g. "\"abc123\""). Unquote for comparison.
            string cleanEtag = ifNoneMatch.Trim('"', '\'');

            // Get all cached hashes for this archive+page combination
            var chapterHash = _hashCacheService.GetChapterHash(seriesStoragePath, decoded);
            if (chapterHash != null &&
                chapterHash.PageHashes.TryGetValue(pageIndex, out var mimeHashes))
            {
                // If any of the mime-type hashes match, return 304 Not Modified
                if (mimeHashes.Values.Any(h => string.Equals(h, cleanEtag, StringComparison.OrdinalIgnoreCase)))
                {
                    return StatusCode(304);
                }
            }
        }

        // Capture and cache client image capabilities
        CacheClientCapabilities();
        var supportedFormats = GetSupportedImageFormats();

        // Get the image stream, content type, and MD5 hash with format conversion support.
        // GetPageImageAsync handles the full chapter-loading lifecycle internally:
        // fast path (already cached), extraction setup, page signal wait, and fallback.
        // Returns a seekable FileStream to avoid buffering the entire image in memory.
        var (imageStream, contentType, md5Hash) = await _imageService.GetPageImageAsync(
            user, seriesId, language, decoded, pageIndex, supportedFormats, token);

        if (imageStream == null)
            return NotFound("Page not found");

        // Set ETag header for future conditional requests
        if (!string.IsNullOrWhiteSpace(md5Hash))
        {
            Response.Headers.ETag = $"\"{md5Hash}\"";
        }

        return File(imageStream, contentType ?? "image/jpeg");
    }

    // ──────────────────────────────────────────────────────────────────────
    // Client Capabilities Helpers
    // ──────────────────────────────────────────────────────────────────────

    private string GetClientCapabilitiesKey()
    {
        string userAgent = Request.Headers["User-Agent"].FirstOrDefault() ?? "";
        string ip = Request.Headers["X-Forwarded-For"].FirstOrDefault()
                    ?? HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? "unknown";
        return $"{userAgent}:{ip}";
    }

    private void CacheClientCapabilities()
    {
        string key = GetClientCapabilitiesKey();
        List<string> formats = Request.SupportedImageTypesFromRequest();

        _clientCapabilitiesCache.AddOrUpdate(key, formats, (_, existing) =>
        {
            if (existing.Count != formats.Count ||
                !existing.OrderBy(x => x).SequenceEqual(formats.OrderBy(x => x)))
            {
                return formats;
            }
            return existing;
        });

        _ = Task.Run(async () =>
        {
            await Task.Delay(_clientCapabilitiesTtl);
            _clientCapabilitiesCache.TryRemove(key, out _);
        });
    }

    private List<string> GetSupportedImageFormats()
    {
        string key = GetClientCapabilitiesKey();
        return _clientCapabilitiesCache.TryGetValue(key, out var formats)
            ? formats
            : [];
    }
}