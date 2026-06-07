using KaizokuBackend.Data;
using KaizokuBackend.Extensions;
using KaizokuBackend.Models;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.ReadState;
using KaizokuBackend.Services.Auth;
using KaizokuBackend.Services.Images;
using KaizokuBackend.Services.Opds;
using KaizokuBackend.Services.ReadState;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;

namespace KaizokuBackend.Controllers;

[ApiController]
public class OpdsController : ControllerBase
{
    private readonly UserQueryService _userQueryService;
    private readonly OpdsFeedService _feedService;
    private readonly OpdsImageService _imageService;
    private readonly ReadStateService _readStateService;
    private readonly ThumbCacheService _thumbCache;
    private readonly AppDbContext _db;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    // ── Client capabilities cache ──────────────────────────────────────────
    // Keyed by "user-agent:client-ip" so we know what image formats each client supports.
    // Overwritten when the detected formats differ from the cached value.
    private static readonly ConcurrentDictionary<string, List<string>> _clientCapabilitiesCache = new();
    private static readonly TimeSpan _clientCapabilitiesTtl = TimeSpan.FromMinutes(5);

    public OpdsController(UserQueryService userQueryService, OpdsFeedService feedService,
        OpdsImageService imageService, ReadStateService readStateService,
        ThumbCacheService thumbCache, AppDbContext db)
    {
        _userQueryService = userQueryService;
        _feedService = feedService;
        _imageService = imageService;
        _readStateService = readStateService;
        _thumbCache = thumbCache;
        _db = db;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Catalog / Feed Endpoints
    // ──────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// GET /{opdsPath} - Root OPDS catalog.
    /// </summary>
    [HttpGet("/{opdsPath}")]
    public async Task<ActionResult> GetRootCatalog(string opdsPath, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildRootCatalogAsync(user, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/reading - "Reading" folder (series with unread chapters).
    /// </summary>
    [HttpGet("/{opdsPath}/reading")]
    public async Task<ActionResult> GetReadingFeed(string opdsPath, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildReadingFeedAsync(user, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/reading/{seriesId} - Reading detail for a specific series.
    /// After responding with the chapter list, proactively starts decompressing
    /// the first unread chapter into the cache.
    /// </summary>
    [HttpGet("/{opdsPath}/reading/{seriesId:guid}")]
    public async Task<ActionResult> GetReadingSeriesDetail(string opdsPath, Guid seriesId, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildSeriesFeedAsync(user, seriesId, null, token);

        // After responding, proactively preload the first unread chapter
        var capturedUser = user;
        var capturedFormats = GetSupportedImageFormats();
        Response.OnCompleted(async () =>
        {
            var series = await _db.Series.FindAsync(seriesId);
            if (series?.StoragePath != null)
            {
                _imageService.PreloadFirstUnreadChapterAsync(
                    capturedUser, seriesId, null, series.StoragePath, capturedFormats);
            }
        });

        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/last-changed - Recently updated series.
    /// </summary>
    [HttpGet("/{opdsPath}/last-changed")]
    public async Task<ActionResult> GetLastChangedFeed(string opdsPath, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildAllSeriesFeedAsync(user, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/all-series - All series.
    /// </summary>
    [HttpGet("/{opdsPath}/all-series")]
    public async Task<ActionResult> GetAllSeriesFeed(string opdsPath, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildAllSeriesFeedAsync(user, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/categories - Categories folder.
    /// </summary>
    [HttpGet("/{opdsPath}/categories")]
    public async Task<ActionResult> GetCategoriesFeed(string opdsPath, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildCategoriesFeedAsync(user, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/categories/{category} - Series in a specific category.
    /// </summary>
    [HttpGet("/{opdsPath}/categories/{category}")]
    public async Task<ActionResult> GetCategoryFeed(string opdsPath, string category, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildAllSeriesFeedAsync(user, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/series/{seriesId} - Series detail (language selection or chapters).
    /// After responding with the chapter list, proactively starts decompressing
    /// the first unread chapter into the cache.
    /// </summary>
    [HttpGet("/{opdsPath}/series/{seriesId:guid}")]
    public async Task<ActionResult> GetSeriesDetail(string opdsPath, Guid seriesId, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildSeriesFeedAsync(user, seriesId, null, token);

        // After responding, proactively preload the first unread chapter
        var capturedUser = user;
        var capturedFormats = GetSupportedImageFormats();
        Response.OnCompleted(async () =>
        {
            var series = await _db.Series.FindAsync(seriesId);
            if (series?.StoragePath != null)
            {
                _imageService.PreloadFirstUnreadChapterAsync(
                    capturedUser, seriesId, null, series.StoragePath, capturedFormats);
            }
        });

        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/series/{seriesId}/language/{language} - Chapter list for a language.
    /// After responding with the chapter list, proactively starts decompressing
    /// the first unread chapter into the cache.
    /// </summary>
    [HttpGet("/{opdsPath}/series/{seriesId:guid}/language/{language}")]
    public async Task<ActionResult> GetSeriesLanguageFeed(string opdsPath, Guid seriesId, string language, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string feed = await _feedService.BuildSeriesFeedAsync(user, seriesId, language, token);

        // After responding, proactively preload the first unread chapter (in this language)
        var capturedUser = user;
        var capturedFormats = GetSupportedImageFormats();
        Response.OnCompleted(async () =>
        {
            var series = await _db.Series.FindAsync(seriesId);
            if (series?.StoragePath != null)
            {
                _imageService.PreloadFirstUnreadChapterAsync(
                    capturedUser, seriesId, language, series.StoragePath, capturedFormats);
            }
        });

        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/series/{seriesId}/language/{language}/chapter/{base64Filename}
    /// Returns the Page Streaming Extension (PSE) feed for the chapter.
    /// </summary>
    [HttpGet("/{opdsPath}/series/{seriesId:guid}/language/{language}/chapter/{base64Filename}")]
    public async Task<ActionResult> GetChapterPages(string opdsPath, Guid seriesId, string language, string base64Filename, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string? decoded = DecodeBase64Filename(base64Filename);
        if (decoded == null)
            return BadRequest("Invalid chapter identifier");

        // Find the actual page count from the database
        int pageCount = 1; // fallback
        try
        {
            var entity = await _db.SeriesProviders
                .Where(sp => sp.SeriesId == seriesId && sp.Language == language)
                .AsNoTracking()
                .FirstOrDefaultAsync(token);

            if (entity?.Chapters != null)
            {
                var chapter = entity.Chapters
                    .FirstOrDefault(c => c.Filename != null &&
                        c.Filename.Equals(decoded, StringComparison.OrdinalIgnoreCase));
                if (chapter?.PageCount > 0)
                    pageCount = chapter.PageCount.Value;
            }
        }
        catch
        {
            // Fallback to default page count
        }

        string feed = _feedService.BuildChapterPagesFeed(user, seriesId, language, decoded, pageCount);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // OPDS Image / Thumbnail Endpoints
    // ──────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// GET /{opdsPath}/image/{key}
    /// Serves a cached thumbnail image directly (no redirect to /api/image/{key}).
    /// Captures client image capabilities for format conversion hints.
    /// </summary>
    [HttpGet("/{opdsPath}/image/{key}")]
    public async Task<ActionResult> GetCachedImage(string opdsPath, string key, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        // Capture and cache client image capabilities
        CacheClientCapabilities();

        var result = await _thumbCache.ProcessKeyAsync(key, Request.GetETagFromRequest() ?? string.Empty, token);
        if (result.StatusCode == HttpStatusCode.OK)
        {
            Response.AddETag(_thumbCache.GetCacheDuration(), result.etag!);
            return File(result.stream ?? new MemoryStream(), result.mimetype ?? "application/octet-stream");
        }
        return StatusCode((int)result.StatusCode);
    }

    /// <summary>
    /// GET /{opdsPath}/thumb/{seriesId}
    /// Serves the series thumbnail via ThumbCacheService.
    /// Captures client image capabilities for format conversion hints.
    /// </summary>
    [HttpGet("/{opdsPath}/thumb/{seriesId:guid}")]
    public async Task<ActionResult> GetSeriesThumbnail(string opdsPath, Guid seriesId, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        // Capture and cache client image capabilities
        CacheClientCapabilities();

        var series = await _db.Series
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);

        if (series == null || string.IsNullOrWhiteSpace(series.ThumbnailUrl))
            return NotFound();

        string key = await _thumbCache.GetKeyAsync(series.ThumbnailUrl, token);
        if (string.IsNullOrEmpty(key))
            return NotFound();

        var result = await _thumbCache.ProcessKeyAsync(key, Request.GetETagFromRequest() ?? string.Empty, token);
        if (result.StatusCode == HttpStatusCode.OK)
        {
            Response.AddETag(_thumbCache.GetCacheDuration(), result.etag!);
            return File(result.stream ?? new MemoryStream(), result.mimetype ?? "application/octet-stream");
        }
        return StatusCode((int)result.StatusCode);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // OPDS Reading State Endpoints
    // ──────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// POST /{opdsPath}/reading-state/{seriesId}/{language}/{base64Filename}
    /// Receives read progress from OPDS clients.
    /// </summary>
    [HttpPost("/{opdsPath}/reading-state/{seriesId:guid}/{language}/{base64Filename}")]
    public async Task<ActionResult> PostReadingState(
        string opdsPath, Guid seriesId, string language, string base64Filename,
        CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string? chapterFilename = DecodeBase64Filename(base64Filename);
        if (chapterFilename == null)
            return BadRequest("Invalid chapter identifier");

        var series = await _db.Series
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound("Series not found");

        // Parse the incoming read state
        var body = await ParseReadingStateBodyAsync();
        if (body == null)
            return BadRequest("Invalid or missing request body");

        int lastReadPage = body.Page ?? body.PageNum ?? body.LastReadPage ?? 0;
        int totalPages = body.Total ?? body.TotalPages ?? 0;
        bool isCompleted = body.Completed ?? (totalPages > 0 && lastReadPage >= totalPages);

        decimal chapterNumber = ParseChapterNumber(chapterFilename);

        _readStateService.SetReadState(
            user.Username,
            series.StoragePath,
            chapterNumber,
            lastReadPage,
            totalPages);

        if (isCompleted)
        {
            _readStateService.MarkChapterCompleted(
                user.Username,
                series.StoragePath,
                chapterNumber);
        }

        // If progress is >80% or chapter is completed, proactively preload the next chapter
        bool shouldPreloadNext = isCompleted || (totalPages > 0 && lastReadPage >= (int)(totalPages * 0.8));
        if (shouldPreloadNext)
        {
            var capturedUser = user;
            var capturedFormats = GetSupportedImageFormats();
            _ = Task.Run(async () =>
            {
                _imageService.PreloadNextChapterAsync(
                    capturedUser, seriesId, language, chapterNumber, series.StoragePath, capturedFormats);
            });
        }

        // Return the updated state
        var state = _readStateService.GetReadState(user.Username, series.StoragePath, chapterNumber)
            ?? new ChapterReadState
            {
                ChapterNumber = chapterNumber,
                LastReadPage = lastReadPage,
                TotalPages = totalPages,
                IsCompleted = isCompleted,
                LastReadAt = DateTime.UtcNow
            };

        return Ok(state);
    }

    /// <summary>
    /// GET /{opdsPath}/reading-state/{seriesId}/{language}/{base64Filename}
    /// Returns the current read state for a chapter.
    /// </summary>
    [HttpGet("/{opdsPath}/reading-state/{seriesId:guid}/{language}/{base64Filename}")]
    public async Task<ActionResult> GetReadingState(
        string opdsPath, Guid seriesId, string language, string base64Filename,
        CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string? chapterFilename = DecodeBase64Filename(base64Filename);
        if (chapterFilename == null)
            return BadRequest("Invalid chapter identifier");

        var series = await _db.Series
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound("Series not found");

        decimal chapterNumber = ParseChapterNumber(chapterFilename);

        var state = _readStateService.GetReadState(user.Username, series.StoragePath, chapterNumber);
        if (state == null)
        {
            return Ok(new ChapterReadState
            {
                ChapterNumber = chapterNumber,
                LastReadPage = 0,
                TotalPages = 0,
                IsCompleted = false,
                LastReadAt = DateTime.UtcNow
            });
        }

        return Ok(state);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Client Capabilities Helpers
    // ──────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Derives a cache key for client capabilities from the current request.
    /// Uses User-Agent + client IP (respecting X-Forwarded-For for reverse proxies).
    /// </summary>
    private string GetClientCapabilitiesKey()
    {
        string userAgent = Request.Headers["User-Agent"].FirstOrDefault() ?? "";
        string ip = Request.Headers["X-Forwarded-For"].FirstOrDefault()
                    ?? HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? "unknown";
        return $"{userAgent}:{ip}";
    }

    /// <summary>
    /// Captures and caches client image capabilities from the current request.
    /// Overwrites the cached entry if the formats differ from what's already cached
    /// (i.e., the client's Accept header changed since the last request).
    /// </summary>
    private void CacheClientCapabilities()
    {
        string key = GetClientCapabilitiesKey();
        List<string> formats = Request.SupportedImageTypesFromRequest();

        // Overwrite if cached value differs — client capabilities may change
        _clientCapabilitiesCache.AddOrUpdate(key, formats, (_, existing) =>
        {
            if (existing.Count != formats.Count ||
                !existing.OrderBy(x => x).SequenceEqual(formats.OrderBy(x => x)))
            {
                return formats; // Overwrite with new value
            }
            return existing; // Keep existing (no change)
        });

        // Evict after TTL (fire-and-forget)
        _ = Task.Run(async () =>
        {
            await Task.Delay(_clientCapabilitiesTtl);
            _clientCapabilitiesCache.TryRemove(key, out _);
        });
    }

    /// <summary>
    /// Gets cached client capabilities for this request, or empty list if not cached.
    /// </summary>
    private List<string> GetSupportedImageFormats()
    {
        string key = GetClientCapabilitiesKey();
        return _clientCapabilitiesCache.TryGetValue(key, out var formats)
            ? formats
            : [];
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private static string? DecodeBase64Filename(string base64Filename)
    {
        try
        {
            string padded = base64Filename.PadRight(
                base64Filename.Length + (4 - base64Filename.Length % 4) % 4, '=');
            byte[] bytes = Convert.FromBase64String(padded);
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return null;
        }
    }

    private async Task<ReadingStateBody?> ParseReadingStateBodyAsync()
    {
        string? contentType = Request.ContentType?.ToLowerInvariant();

        if (contentType != null && contentType.Contains("application/json"))
        {
            try
            {
                using var reader = new StreamReader(Request.Body, Encoding.UTF8);
                string json = await reader.ReadToEndAsync();
                return JsonSerializer.Deserialize<ReadingStateBody>(json, _jsonOptions);
            }
            catch
            {
                return null;
            }
        }

        if (contentType != null && contentType.Contains("application/x-www-form-urlencoded"))
        {
            try
            {
                var form = await Request.ReadFormAsync();
                return new ReadingStateBody
                {
                    Page = TryParseInt(form["page"]),
                    PageNum = TryParseInt(form["pageNum"]),
                    LastReadPage = TryParseInt(form["lastReadPage"]),
                    Total = TryParseInt(form["total"]),
                    TotalPages = TryParseInt(form["totalPages"]),
                    Completed = TryParseBool(form["completed"])
                };
            }
            catch
            {
                return null;
            }
        }

        // Fallback: try JSON anyway
        try
        {
            using var reader = new StreamReader(Request.Body, Encoding.UTF8, leaveOpen: true);
            string json = await reader.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(json))
                return JsonSerializer.Deserialize<ReadingStateBody>(json, _jsonOptions);
        }
        catch
        {
            // ignore
        }

        return null;
    }

    private static int? TryParseInt(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        if (int.TryParse(value, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out int result))
            return result;
        return null;
    }

    private static bool? TryParseBool(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        if (bool.TryParse(value, out bool result))
            return result;
        if (value == "1") return true;
        if (value == "0") return false;
        return null;
    }

    private static decimal ParseChapterNumber(string filename)
    {
        var match = System.Text.RegularExpressions.Regex.Match(
            System.IO.Path.GetFileNameWithoutExtension(filename),
            @"(\d+(?:\.\d+)?)");
        if (match.Success && decimal.TryParse(match.Groups[1].Value,
            System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out decimal result))
        {
            return result;
        }
        return 0;
    }

    private class ReadingStateBody
    {
        public int? Page { get; set; }
        public int? PageNum { get; set; }
        public int? LastReadPage { get; set; }
        public int? Total { get; set; }
        public int? TotalPages { get; set; }
        public bool? Completed { get; set; }
    }
}
