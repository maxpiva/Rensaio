using RensaioBackend.Data;
using RensaioBackend.Extensions;
using RensaioBackend.Models.Database;
using RensaioBackend.Services.Auth;
using RensaioBackend.Services.Opds;
using RensaioBackend.Services.ReadState;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace RensaioBackend.Controllers;

[ApiController]
public class OpdsImageController : ControllerBase
{
    private readonly UserQueryService _userQueryService;
    private readonly OpdsImageService _imageService;
    private readonly HashCacheService _hashCacheService;
    private readonly AppDbContext _db;
    private readonly ClientCapabilitiesHelper _clientCapabilitiesHelper;
    private readonly ReadStateService _readStateService;

    public OpdsImageController(UserQueryService userQueryService, ReadStateService readStateService, OpdsImageService imageService, HashCacheService hashCacheService, AppDbContext db, ClientCapabilitiesHelper clientCapabilitiesHelper)
    {
        _userQueryService = userQueryService;
        _readStateService = readStateService;
        _imageService = imageService;
        _hashCacheService = hashCacheService;
        _db = db;
        _clientCapabilitiesHelper = clientCapabilitiesHelper;
    }

    private void ScrobbleIfNeeded(UserEntity user, SeriesEntity series, string filename, decimal chapterNumber, int pageIndex, int totalPages)
    {
        if (!_clientCapabilitiesHelper.SupportProgression(Request, HttpContext))
        {
            _readStateService.SetReadState(user.Username, user.Id, series.Id, filename, "", "Rensaiō", series.StoragePath, chapterNumber, pageIndex + 1, totalPages, false);
        }
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
    [HttpGet("/{opdsPath}/image/{seriesId:guid}/{base64Filename}/{pageIndex:int}")]
    public async Task<ActionResult> GetPageImage(
        string opdsPath, Guid seriesId, string base64Filename, int pageIndex,
        CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        // Decode the base64 filename
        string decoded = OpdsController.DecodeBase64Url(base64Filename);
        if (string.IsNullOrEmpty(decoded))
            return BadRequest("Invalid chapter identifier");

        // ── Look up series storage path for hash cache lookups ──
        var series = await _db.Series.Include(a=>a.Sources)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);

        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound("Series not found");

        string seriesStoragePath = series.StoragePath;

        var provider = series.Sources.FirstOrDefault(a => a.Chapters.Any(c => c.Filename != null && c.Filename.Equals(decoded, StringComparison.OrdinalIgnoreCase)));
        if (provider == null)
            return NotFound("Series not found");
        var chapter = provider?.Chapters.FirstOrDefault(c => c.Filename != null && c.Filename.Equals(decoded, StringComparison.OrdinalIgnoreCase));
        if (chapter == null)
            return NotFound("Chapter not found");
        string language = provider?.Language ?? "en";

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
                    ScrobbleIfNeeded(user, series, decoded, chapter?.Number ?? 0, pageIndex, chapter?.PageCount ?? 1);
                    return StatusCode(304);

                }
            }
        }

        // Capture and cache client image capabilities
        _clientCapabilitiesHelper.Capture(Request, HttpContext);
        var supportedFormats = _clientCapabilitiesHelper.GetSupportedImageFormats(Request, HttpContext);


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
        ScrobbleIfNeeded(user, series, decoded, chapter?.Number ?? 0, pageIndex, chapter?.PageCount ?? 1);

        return File(imageStream, contentType ?? "image/jpeg");
    }
}