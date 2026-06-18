using com.sun.xml.@internal.bind.v2.model.core;
using RensaioBackend.Data;
using RensaioBackend.Extensions;
using RensaioBackend.Models;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Opds;
using RensaioBackend.Models.ReadState;
using RensaioBackend.Services.Auth;
using RensaioBackend.Services.Images;
using RensaioBackend.Services.Opds;
using RensaioBackend.Services.ReadState;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Text;
using System.Text.Json;

namespace RensaioBackend.Controllers;

[ApiController]
public class OpdsController : ControllerBase
{
    private readonly UserQueryService _userQueryService;
    private readonly OpdsFeedService _feedService;
    private readonly OpdsImageService _imageService;
    private readonly ReadStateService _readStateService;
    private readonly ThumbCacheService _thumbCache;
    private readonly AppDbContext _db;
    private readonly ClientCapabilitiesHelper _clientCapabilitiesHelper;    

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public OpdsController(UserQueryService userQueryService, OpdsFeedService feedService,
        OpdsImageService imageService, ReadStateService readStateService,
        ThumbCacheService thumbCache, AppDbContext db, ClientCapabilitiesHelper clientCapabilitiesHelper)
    {
        _userQueryService = userQueryService;
        _feedService = feedService;
        _imageService = imageService;
        _readStateService = readStateService;
        _thumbCache = thumbCache;
        _db = db;
        _clientCapabilitiesHelper = clientCapabilitiesHelper;
    }


    private async Task<(string UserAgent, UserEntity? User)> CheckUserAndUserAgentAsync(string opdsPath, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null || !user.IsActive)
            return ("", null);
        return (Request.Headers.UserAgent.ToString() ?? "", user);
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
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildRootCatalogAsync(user, ua, token);
        return Content(feed, "application/atom+xml", Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/reading - "Reading" folder (series with unread chapters).
    /// </summary>
    [HttpGet("/{opdsPath}/reading")]
    public async Task<ActionResult> GetReadingFeed(string opdsPath, CancellationToken token)
    {
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildSeriesFeedAsync(user, "rensaio:reading", "Reading", ua, null, null, null, true, false, token).ConfigureAwait(false);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/last-changed - Recently updated series.
    /// </summary>
    [HttpGet("/{opdsPath}/last-changed")]
    public async Task<ActionResult> GetLastChangedFeed(string opdsPath, CancellationToken token)
    {
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildSeriesFeedAsync(user, "rensaio:last-changed", "Last Changed", ua, null, null, null, false, true, token).ConfigureAwait(false);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/all-series - All series.
    /// </summary>
    [HttpGet("/{opdsPath}/all-series")]
    public async Task<ActionResult> GetAllSeriesFeed(string opdsPath, CancellationToken token)
    {
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildSeriesFeedAsync(user, "all-series", "All Series", ua, null, null, null, false, false, token).ConfigureAwait(false);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/categories - Categories folder.
    /// </summary>
    [HttpGet("/{opdsPath}/categories")]
    public async Task<ActionResult> GetCategoriesFeed(string opdsPath, CancellationToken token)
    {
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildCategoriesFeedAsync(user, ua, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }
    /// <summary>
    /// GET /{opdsPath}/tags - Tags folder.
    /// </summary>
    [HttpGet("/{opdsPath}/tags")]
    public async Task<ActionResult> GetTagsFeed(string opdsPath, CancellationToken token)
    {
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildTagsFeedAsync(user, ua, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }
    /// <summary>
    /// GET /{opdsPath}/sources - Sources folder.
    /// </summary>
    [HttpGet("/{opdsPath}/sources")]
    public async Task<ActionResult> GetSourcesFeed(string opdsPath, CancellationToken token)
    {
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildSourcesFeedAsync(user, ua, token);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/categories/{category} - Series in a specific category.
    /// </summary>
    [HttpGet("/{opdsPath}/category/{categorybase64}")]
    public async Task<ActionResult> GetCategoryFeed(string opdsPath, string categorybase64, CancellationToken token)
    {
        string category = DecodeBase64Url(categorybase64);
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildSeriesFeedAsync(user, $"category:{categorybase64}", category, ua, category, null, null, false, false, token).ConfigureAwait(false);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }
    /// <summary>
    /// GET /{opdsPath}/tags/{tag} - Series in a specific tag.
    /// </summary>
    [HttpGet("/{opdsPath}/tag/{tagbase64}")]
    public async Task<ActionResult> GetTagsFeed(string opdsPath, string tagbase64, CancellationToken token)
    {
        string tag = DecodeBase64Url(tagbase64);
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildSeriesFeedAsync(user, $"tag:{tagbase64}", tag, ua, null, tag, null, false, false, token).ConfigureAwait(false);
        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }
    /// <summary>
    /// GET /{opdsPath}/sources/{source} - Series in a specific source.
    /// </summary>
    [HttpGet("/{opdsPath}/source/{sourcebase64}")]
    public async Task<ActionResult> GetSourcesFeed(string opdsPath, string sourcebase64, CancellationToken token)
    {
        string source = DecodeBase64Url(sourcebase64);
        (string ua, UserEntity? user) = await CheckUserAndUserAgentAsync(opdsPath, token).ConfigureAwait(false);
        if (user == null) return NotFound();
        string feed = await _feedService.BuildSeriesFeedAsync(user, $"source:{sourcebase64}", source, ua, null, null, source, false, false, token).ConfigureAwait(false);
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
        string ua = Request.Headers.UserAgent.ToString() ?? "";

        string feed = await _feedService.BuildSeriesFeedAsync(user, ua, seriesId, null, token);

        // After responding, proactively preload the first unread chapter
        // Query DB here (within the request scope) and capture the result
        var series = await _db.Series
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);
        var capturedUser = user;
        var capturedFormats = _clientCapabilitiesHelper.GetSupportedImageFormats(Request, HttpContext);
        var capturedStoragePath = series?.StoragePath;
        Response.OnCompleted(() =>
        {
            if (!string.IsNullOrWhiteSpace(capturedStoragePath))
            {
                _imageService.PreloadFirstUnreadChapterAsync(
                    capturedUser, seriesId, null, capturedStoragePath, capturedFormats);
            }
            return Task.CompletedTask;
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
        string ua = Request.Headers.UserAgent.ToString() ?? "";

        string feed = await _feedService.BuildSeriesFeedAsync(user, ua, seriesId, language, token);

        // After responding, proactively preload the first unread chapter (in this language)
        // Query DB here (within the request scope) and capture the result
        var series = await _db.Series
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);
        var capturedUser = user;
        var capturedFormats = _clientCapabilitiesHelper.GetSupportedImageFormats(Request, HttpContext);
        var capturedStoragePath = series?.StoragePath;
        Response.OnCompleted(() =>
        {
            if (!string.IsNullOrWhiteSpace(capturedStoragePath))
            {
                _imageService.PreloadFirstUnreadChapterAsync(
                    capturedUser, seriesId, language, capturedStoragePath, capturedFormats);
            }
            return Task.CompletedTask;
        });

        return Content(feed, "application/atom+xml", System.Text.Encoding.UTF8);
    }

    /// <summary>
    /// GET /{opdsPath}/series/{seriesId}/chapter/{base64Filename}
    /// Download Chapter
    /// </summary>
    [HttpGet("/{opdsPath}/series/{seriesId:guid}/chapter/{base64Filename}")]
    public async Task<ActionResult> GetChapterArchive(string opdsPath, Guid seriesId, string base64Filename, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();
        string? chapterFilename = DecodeBase64Url(base64Filename);
        if (chapterFilename == null)
            return BadRequest("Invalid chapter identifier");

        var result  = await _feedService.GetChapterStreamAsync(seriesId, chapterFilename, token);
        if (result == null)
            return NotFound();
        return File(result.Value.Item1, result.Value.Item2, chapterFilename);
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
        _clientCapabilitiesHelper.Capture(Request, HttpContext);

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
        _clientCapabilitiesHelper.Capture(Request, HttpContext);

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
    [HttpPost("/{opdsPath}/reading-state/{seriesId:guid}/{base64Filename}")]
    public async Task<ActionResult> PostReadingState(
        string opdsPath, string user_agent, Guid seriesId, string base64Filename,
        CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string? chapterFilename = DecodeBase64Url(base64Filename);
        if (chapterFilename == null)
            return BadRequest("Invalid chapter identifier");

        var series = await _db.Series
            .Include(s=>s.Sources).AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound("Series not found");

        SeriesProviderEntity? source = series.Sources.FirstOrDefault(a => a.Chapters.Any(c => c.Filename != null && c.Filename.Equals(chapterFilename, StringComparison.OrdinalIgnoreCase)));
        Chapter? chapter = source?.Chapters.FirstOrDefault(c => c.Filename != null && c.Filename.Equals(chapterFilename, StringComparison.OrdinalIgnoreCase));
        if (source == null || chapter == null)
            return NotFound("Chapter not found");
        string language = source?.Language ?? "en";
        decimal? chapterNumber = chapter.ChapterNumber;

        // Parse the incoming read state
        var body = await ParseReadingStateBodyAsync();
        if (body == null)
            return BadRequest("Invalid or missing request body");

        int lastReadPage = body.Page ?? body.PageNum ?? body.LastReadPage ?? 0;
        int totalPages = body.Total ?? body.TotalPages ?? 0;
        bool isCompleted = body.Completed ?? (totalPages > 0 && lastReadPage >= totalPages);

     
        _readStateService.SetReadState(user.Username, user.Id, seriesId, chapterFilename, null, null,
            series.StoragePath,
            chapterNumber ?? 0,
            lastReadPage,
            totalPages);


        // If progress is >80% or chapter is completed, proactively preload the next chapter
        bool shouldPreloadNext = isCompleted || (totalPages > 0 && lastReadPage >= (int)(totalPages * 0.8));
        if (shouldPreloadNext)
        {
            var capturedFormats = _clientCapabilitiesHelper.GetSupportedImageFormats(Request, HttpContext);
            _imageService.PreloadNextChapterAsync(
                user, seriesId, language, chapterNumber ?? 0, series.StoragePath, capturedFormats);
        }

        // Return the updated state
        var state = _readStateService.GetReadState(user.Username, series.StoragePath, chapterNumber ?? 0);
  
        return Ok(state);
    }

    /// <summary>
    /// GET /{opdsPath}/reading-state/{seriesId}/{base64Filename}
    /// Returns the current read state for a chapter.
    /// </summary>
    [HttpGet("/{opdsPath}/reading-state/{seriesId:guid}/{base64Filename}")]
    public async Task<ActionResult> GetReadingState(
        string opdsPath, Guid seriesId, string base64Filename,
        CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string? chapterFilename = DecodeBase64Url(base64Filename);
        if (chapterFilename == null)
            return BadRequest("Invalid chapter identifier");

        var series = await _db.Series
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound("Series not found");
        
        SeriesProviderEntity? source = series.Sources.FirstOrDefault(a => a.Chapters.Any(c => c.Filename != null && c.Filename.Equals(chapterFilename, StringComparison.OrdinalIgnoreCase)));
        Chapter? chapter = source?.Chapters.FirstOrDefault(c => c.Filename != null && c.Filename.Equals(chapterFilename, StringComparison.OrdinalIgnoreCase));
        if (source == null || chapter == null)
            return NotFound("Chapter not found");
        decimal? chapterNumber = chapter.ChapterNumber;

        var state = _readStateService.GetReadState(user.Username, series.StoragePath, chapterNumber ?? 0);


        return Ok(state);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // OPDS Progression 1.0 Endpoints
    // ──────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// GET /{opdsPath}/progression/{seriesId}/{base64Filename}
    /// Returns the current reading progression for a chapter per OPDS Progression 1.0 spec.
    /// </summary>
    [HttpGet("/{opdsPath}/progression/{seriesId:guid}/{base64Filename}")]
    public async Task<ActionResult> GetProgression(
        string opdsPath, Guid seriesId, string base64Filename,
        CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string? chapterFilename = DecodeBase64Url(base64Filename);
        if (chapterFilename == null)
            return BadRequest("Invalid chapter identifier");

        var series = await _db.Series
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound("Series not found");
        SeriesProviderEntity? source = series.Sources.FirstOrDefault(a => a.Chapters.Any(c => c.Filename != null && c.Filename.Equals(chapterFilename, StringComparison.OrdinalIgnoreCase)));
        Chapter? chapter = source?.Chapters.FirstOrDefault(c => c.Filename != null && c.Filename.Equals(chapterFilename, StringComparison.OrdinalIgnoreCase));
        if (source == null || chapter == null)
            return NotFound("Chapter not found");
        decimal? chapterNumber = chapter.ChapterNumber;

        var state = _readStateService.GetReadState(user.Username, series.StoragePath, chapterNumber ?? 0);

        var dto = BuildProgressionDto(user.Username, state);
        return Ok(dto);
    }

    /// <summary>
    /// POST /{opdsPath}/progression/{seriesId}/{base64Filename}
    /// Receives reading progression from OPDS clients per OPDS Progression 1.0 spec.
    /// </summary>
    [HttpPost("/{opdsPath}/progression/{seriesId:guid}/{base64Filename}")]
    public async Task<ActionResult> PostProgression(
        string opdsPath, Guid seriesId, string base64Filename,
        CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        string? chapterFilename = DecodeBase64Url(base64Filename);
        if (chapterFilename == null)
            return BadRequest("Invalid chapter identifier");

        var series = await _db.Series
            .Include(a=>a.Sources).AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound("Series not found");
        var provider = series.Sources.FirstOrDefault(a => a.Chapters.Any(c => c.Filename != null && c.Filename.Equals(chapterFilename, StringComparison.OrdinalIgnoreCase)));
        var chapter = provider?.Chapters?.FirstOrDefault(c => c.Filename != null && c.Filename.Equals(chapterFilename, StringComparison.OrdinalIgnoreCase));
        string language = provider?.Language ?? "en";
        decimal? chapterNumber = chapter.ChapterNumber;


        // Parse the incoming progression body
        OpdsProgressionRequest? body;
        try
        {
            using var reader = new StreamReader(Request.Body, Encoding.UTF8);
            string json = await reader.ReadToEndAsync(token);
            body = JsonSerializer.Deserialize<OpdsProgressionRequest>(json, _jsonOptions);
        }
        catch
        {
            return BadRequest("Invalid or missing request body");
        }

        if (body == null)
            return BadRequest("Invalid or missing request body");

        // Look up the chapter to get page count
        int pageCount = 0;
        try
        {
            if (chapter?.PageCount > 0)
                pageCount = chapter.PageCount.Value;
        }
        catch
        {
            // Fallback
        }

        // Convert progression float to page number (ignore device field — do not persist)
        double progressionValue = body.Progression ?? 0.0;
        int lastReadPage = pageCount > 0
            ? (int)Math.Round(progressionValue * pageCount)
            : 0;
        int totalPages = pageCount;

     
        _readStateService.SetReadState(user.Username, user.Id, seriesId, chapterFilename, body?.Device?.Id, body?.Device?.Name,
            series.StoragePath,
            chapterNumber ?? 0,
            lastReadPage,
            totalPages);



        // Return the updated state
        var updatedState = _readStateService.GetReadState(user.Username, series.StoragePath, chapterNumber ?? 0);
        var dto = BuildProgressionDto(user.Username, updatedState);
        return Ok(dto);
    }

    /// <summary>
    /// Builds an OpdsProgressionDto from a ChapterReadState.
    /// </summary>
    private static OpdsProgressionDto BuildProgressionDto(string username, ChapterReadState? state)
    {
        return new OpdsProgressionDto
        {
            Modified = state?.LastReadAt ?? DateTime.UtcNow,
            Device = new OpdsProgressionDeviceDto
            {
                Id = state?.LastReadDeviceId ?? $"urn:rensaio:user:{username}",
                Name = string.IsNullOrEmpty(state?.LastReadDeviceName) ? "Rensaiō" : state.LastReadDeviceName
            },
            
            Progression = state?.Progress ?? 0,
            References = []
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private Helpers
    // ──────────────────────────────────────────────────────────────────────────

    public static string DecodeBase64Url(string base64Url)
    {
        try
        {
            var base64 = base64Url.Replace('-', '+').Replace('_', '/');
            string padded = base64.PadRight(
                base64.Length + (4 - base64.Length % 4) % 4, '=');
            byte[] bytes = Convert.FromBase64String(padded);
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return "";
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
