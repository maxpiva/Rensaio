using KaizokuBackend.Data;
using KaizokuBackend.Models;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Services.Images;
using KaizokuBackend.Services.ReadState;
using KaizokuBackend.Services.Settings;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace KaizokuBackend.Services.Opds;

/// <summary>
/// Service for building OPDS (Open Publication Distribution System) Atom XML feeds.
/// Supports per-user read-state tracking via kaizoku.json.
/// </summary>
public class OpdsFeedService
{
    private readonly AppDbContext _db;
    private readonly ReadStateService _readStateService;
    private readonly ThumbCacheService _thumbCache;
    private readonly SettingsService _settingsService;
    private readonly IConfiguration _configuration;

    private const string PseNs = "xmlns:p5=\"http://vaemendis.net/opds-pse/ns\"";
    private const string PseStreamRel = "http://vaemendis.net/opds-pse/stream";

    public OpdsFeedService(AppDbContext db, ReadStateService readStateService,
        ThumbCacheService thumbCache, SettingsService settingsService, IConfiguration configuration)
    {
        _db = db;
        _readStateService = readStateService;
        _thumbCache = thumbCache;
        _settingsService = settingsService;
        _configuration = configuration;
    }

    /// <summary>
    /// Whether the title text should include read-state suffixes (✓, page progress).
    /// When false (default), titles are clean — clients rely on <category> and p5:lastRead instead.
    /// </summary>
    private bool FallbackReadStateEnabled => _configuration.GetValue<bool>("FallbackReadState");

    /// <summary>
    /// Builds the root OPDS catalog feed for a user.
    /// Each folder entry gets a thumbnail from a random series within that folder.
    /// The Categories entry is only shown when categories are configured in settings.
    /// </summary>
    public async Task<string> BuildRootCatalogAsync(UserEntity user, CancellationToken token = default)
    {
        var allSeries = await _db.Series
            .AsNoTracking()
            .ToListAsync(token);

        var seriesWithThumb = allSeries
            .Where(s => !string.IsNullOrWhiteSpace(s.ThumbnailUrl))
            .ToList();

        // Check if categories are configured — only show the Categories folder if they exist
        var settings = _settingsService.DirectSettings;
        bool hasCategories = settings?.Categories is { Length: > 0 };

        // Pick random thumbnails for each folder
        string readingThumb = await PickRandomThumbnailAsync(user.OpdsPath, seriesWithThumb, token);
        string allThumb = await PickRandomThumbnailAsync(user.OpdsPath, seriesWithThumb, token);
        string catThumb = hasCategories
            ? await PickRandomThumbnailAsync(user.OpdsPath, seriesWithThumb, token)
            : string.Empty;
        string changedThumb = await PickRandomThumbnailAsync(user.OpdsPath, seriesWithThumb, token);

        var sb = new StringBuilder();
        sb.Append($@"<feed xmlns=""http://www.w3.org/2005/Atom"" xmlns:opds=""http://opds-spec.org/2010/catalog"">
  <id>kaizoku:{EscapeXml(user.OpdsPath)}</id>
  <title>Kaizoku - {EscapeXml(user.Username)}'s Library</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  <entry>
<id>Reading</id>
    <title>Reading</title>
    <link rel=""subsection"" href=""/{EscapeXml(user.OpdsPath)}/reading""/>
    {readingThumb}
    <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  </entry>
  <entry>
<id>Last_Changed</id>
    <title>Last Changed</title>
    <link rel=""subsection"" href=""/{EscapeXml(user.OpdsPath)}/last-changed""/>
    {changedThumb}
    <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  </entry>
  <entry>
<id>All_Series</id>
    <title>All Series</title>
    <link rel=""subsection"" href=""/{EscapeXml(user.OpdsPath)}/all-series""/>
    {allThumb}
    <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  </entry>");

        if (hasCategories)
        {
            sb.Append($@"
  <entry>
<id>Categories</id>
    <title>Categories</title>
    <link rel=""subsection"" href=""/{EscapeXml(user.OpdsPath)}/categories""/>
    {catThumb}
    <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  </entry>");
        }

        sb.Append("</feed>");
        return sb.ToString();
    }

    /// <summary>
    /// Builds the "Reading" folder feed showing series with unread chapters.
    /// </summary>
    public async Task<string> BuildReadingFeedAsync(UserEntity user, CancellationToken token = default)
    {
        var seriesList = await _db.Series
            .Include(s => s.Sources)
            .AsNoTracking()
            .ToListAsync(token);

        var sb = new StringBuilder();
        sb.Append($@"<?xml version=""1.0"" encoding=""UTF-8""?>
<feed xmlns=""http://www.w3.org/2005/Atom"">
  <id>kaizoku:{EscapeXml(user.OpdsPath)}:reading</id>
  <title>Reading - {EscapeXml(user.Username)}</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
");

        foreach (var series in seriesList.Where(s => s.Sources.Any(sp => !sp.IsUnknown)))
        {
            int totalChapters = series.ChapterCount;
            int unreadCount = _readStateService.GetUnreadChaptersCount(user.Username, series.StoragePath ?? "", totalChapters);
            string statusSuffix = unreadCount > 0 ? $" [{unreadCount}]" : "";
            string thumbnailLinks = await BuildThumbnailLinkAsync(user.OpdsPath, series.ThumbnailUrl, token);

            sb.Append($@"  <entry>
    <title>{EscapeXml(series.Title)}{EscapeXml(statusSuffix)}</title>
    <id>kaizoku:series:{series.Id}</id>
    {thumbnailLinks}
    <link rel=""subsection"" href=""/{EscapeXml(user.OpdsPath)}/series/{series.Id}""/>
    <updated>{series.LastChapterDate?.ToString("yyyy-MM-ddTHH:mm:ssZ") ?? DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")}</updated>
  </entry>
");
        }

        sb.Append("</feed>");
        return sb.ToString();
    }

    /// <summary>
    /// Builds the "All Series" feed.
    /// </summary>
    public async Task<string> BuildAllSeriesFeedAsync(UserEntity user, CancellationToken token = default)
    {
        var seriesList = await _db.Series
            .Include(s => s.Sources)
            .AsNoTracking()
            .ToListAsync(token);

        var sb = new StringBuilder();
        sb.Append($@"<?xml version=""1.0"" encoding=""UTF-8""?>
<feed xmlns=""http://www.w3.org/2005/Atom"">
  <id>kaizoku:{EscapeXml(user.OpdsPath)}:all-series</id>
  <title>All Series - {EscapeXml(user.Username)}</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
");

        foreach (var series in seriesList.OrderBy(s => s.Title))
        {
            int totalChapters = series.ChapterCount;
            int unreadCount = _readStateService.GetUnreadChaptersCount(user.Username, series.StoragePath ?? "", totalChapters);
            string thumbnailLinks = await BuildThumbnailLinkAsync(user.OpdsPath, series.ThumbnailUrl, token);

            sb.Append($@"  <entry>
    <title>{EscapeXml(series.Title)}{(unreadCount > 0 ? $" [{unreadCount}]" : "")}</title>
    <id>kaizoku:series:{series.Id}</id>
    {thumbnailLinks}
    <link rel=""subsection"" href=""/{EscapeXml(user.OpdsPath)}/series/{series.Id}""/>
    <updated>{series.LastChapterDate?.ToString("yyyy-MM-ddTHH:mm:ssZ") ?? DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")}</updated>
  </entry>
");
        }

        sb.Append("</feed>");
        return sb.ToString();
    }

    /// <summary>
    /// Builds a chapter list feed for a specific series.
    /// If the series has multiple languages, returns a language selection feed instead.
    /// </summary>
    public async Task<string> BuildSeriesFeedAsync(UserEntity user, Guid seriesId, string? language = null, CancellationToken token = default)
    {
        var series = await _db.Series
            .Include(s => s.Sources)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);

        if (series == null)
            return BuildErrorFeed("Series not found");

        var providers = series.Sources.ToList();

        // If no language specified, check if we need language selection
        if (language == null)
        {
            var languages = providers.Select(p => p.Language).Distinct().ToList();
            if (languages.Count > 1)
            {
                return BuildLanguageSelectionFeed(user, series, languages);
            }
            language = languages.FirstOrDefault() ?? "en";
        }

        // Get filtered providers for this language
        var langProviders = providers.Where(p => p.Language == language).ToList();
        if (langProviders.Count == 0)
            return BuildErrorFeed("No chapters found for this language");

        // Collect deduplicated chapters
        var allChapters = new List<Models.Chapter>();
        foreach (var p in langProviders)
        {
            if (p.Chapters != null)
                allChapters.AddRange(p.Chapters);
        }

        // Deduplicate by chapter number (prefer preferred provider)
        // Track the contributing provider for each chapter to detect multi-source feeds
        var dedupedChapters = new List<(Models.Chapter Chapter, SeriesProviderEntity Provider)>();
        foreach (var group in allChapters.GroupBy(c => c.ChapterNumber))
        {
            var winner = group.OrderByDescending(c =>
            {
                var prov = langProviders.FirstOrDefault(p => p.Chapters?.Any(pc => pc.ChapterNumber == c.ChapterNumber) == true);
                return prov?.IsUninstalled == false ? 1 : 0;
            }).First();

            var winnerProvider = langProviders.FirstOrDefault(p =>
                p.Chapters?.Any(pc => pc.ChapterNumber == winner.ChapterNumber && pc.Filename == winner.Filename) == true);

            dedupedChapters.Add((winner, winnerProvider ?? langProviders.First()));
        }
        dedupedChapters = dedupedChapters.OrderBy(dc => dc.Chapter.ChapterNumber).ToList();

        // Determine if multiple source providers contributed chapters (for [Source] suffix)
        var distinctProviders = dedupedChapters
            .Select(dc => dc.Provider.Provider)
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Distinct()
            .ToList();
        bool multiSource = distinctProviders.Count > 1;

        // Get read states
        var readStates = _readStateService.GetSeriesReadStates(user.Username, series.StoragePath ?? "");

        var sb = new StringBuilder();
        sb.Append($@"<?xml version=""1.0"" encoding=""UTF-8""?>
<feed xmlns=""http://www.w3.org/2005/Atom"" xmlns:opds=""http://opds-spec.org/2010/catalog"">
  <id>kaizoku:series:{seriesId}:lang:{EscapeXml(language)}</id>
  <title>{EscapeXml(series.Title)} ({EscapeXml(language)})</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
");

        foreach (var (chapter, provider) in dedupedChapters)
        {
            string chapterId = $"{seriesId}:{language}:{chapter.Filename}";
            string base64Filename = Convert.ToBase64String(Encoding.UTF8.GetBytes(chapter.Filename ?? ""))
                .TrimEnd('=');

            int pageCount = chapter.PageCount ?? 0;

            // Determine read state for display + category hints
            var chapterState = readStates.FirstOrDefault(rs => rs.ChapterNumber == chapter.ChapterNumber);
            bool isCompleted = chapterState?.IsCompleted ?? false;
            bool isPartial = chapterState != null && !isCompleted && chapterState.LastReadPage > 0;

            string acqHref = $"/{EscapeXml(user.OpdsPath)}/series/{seriesId}/language/{EscapeXml(language)}/chapter/{EscapeXml(base64Filename)}";
            string readingStateHref = $"/{EscapeXml(user.OpdsPath)}/reading-state/{seriesId}/{EscapeXml(language)}/{EscapeXml(base64Filename)}";

            // Build chapter title: Series Name + optional chapter number
            // If only 1 chapter total, omit number (e.g. "One Piece" instead of "One Piece 1")
            // If multiple sources, suffix with [ProviderName]
            string chapterTitle;
            if (dedupedChapters.Count > 1)
                chapterTitle = $"{series.Title} {chapter.ChapterNumber}";
            else
                chapterTitle = series.Title;

            if (multiSource)
            {
                string providerName = !string.IsNullOrWhiteSpace(provider.Provider)
                    ? provider.Provider
                    : "Unknown";
                chapterTitle += $" [{EscapeXml(providerName)}]";
            }

            // Optional read-state suffix — only when FallbackReadState is enabled (default: off).
            // Modern OPDS clients (Panels, Chunky) rely on <category> and p5:lastRead instead.
            string titleSuffix = "";
            if (FallbackReadStateEnabled)
            {
                if (isCompleted)
                    titleSuffix = " ✓";
                else if (isPartial)
                    titleSuffix = $" ({chapterState!.LastReadPage}/{chapterState.TotalPages})";
            }

            string thumbnailLinks = await BuildThumbnailLinkAsync(user.OpdsPath, series.ThumbnailUrl, token);

            sb.Append($@"  <entry>
    <title>{EscapeXml(chapterTitle)}{EscapeXml(titleSuffix)}</title>
    <id>kaizoku:chapter:{EscapeXml(chapterId)}</id>
    {thumbnailLinks}
    <link rel=""http://opds-spec.org/acquisition"" href=""{EscapeXml(acqHref)}"" opds:status=""ready""/>
    <link rel=""http://opds-spec.org/reading-state"" type=""application/json"" href=""{EscapeXml(readingStateHref)}""/>
    <link rel=""http://opds-spec.org/book/progress"" type=""application/json"" href=""{EscapeXml(readingStateHref)}""/>");

            // Inline read state category — standard OPDS 1.2 catalog convention
            // Used by Komga, Kavita, Panels, Chunky to show read/unread inline
            if (isCompleted)
            {
                sb.Append(@"
    <category term=""read"" scheme=""http://opds-spec.org/state"" label=""Read""/>");
            }
            else if (isPartial)
            {
                sb.Append(@"
    <category term=""reading"" scheme=""http://opds-spec.org/state"" label=""Reading""/>");
            }
            else
            {
                sb.Append(@"
    <category term=""unread"" scheme=""http://opds-spec.org/state"" label=""Unread""/>");
            }

            // Page Streaming Extension: single stream link with p5:count, p5:lastRead, p5:lastReadDate
            // Per OPDS-PSE 1.1 & 1.2 specs: https://github.com/anansi-project/opds-pse
            if (pageCount > 0)
            {
                string streamHref = $"/{EscapeXml(user.OpdsPath)}/image/{seriesId}/{EscapeXml(language)}/{EscapeXml(base64Filename)}/{{pageNumber}}";
                string contentType = GetChapterContentType(chapter.Filename);

                // Build PSE attributes: p5:count (required), p5:lastRead + p5:lastReadDate (optional per spec)
                string pseAttrs = $@"p5:count=""{pageCount}""";
                if (chapterState != null && chapterState.LastReadPage > 0)
                {
                    pseAttrs += $@" p5:lastRead=""{chapterState.LastReadPage}""";
                    pseAttrs += $@" p5:lastReadDate=""{chapterState.LastReadAt:yyyy-MM-ddTHH:mm:ssZ}""";
                }

                sb.Append($@"
    <link xmlns:p5=""http://vaemendis.net/opds-pse/ns"" rel=""http://vaemendis.net/opds-pse/stream"" type=""{EscapeXml(contentType)}"" href=""{EscapeXml(streamHref)}"" {pseAttrs}/>");
            }

            sb.Append($@"
    <updated>{chapter.DownloadDate?.ToString("yyyy-MM-ddTHH:mm:ssZ") ?? DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")}</updated>
  </entry>
");
        }

        sb.Append("</feed>");
        return sb.ToString();
    }

    /// <summary>
    /// Builds a Page Streaming Extension (PSE) feed for a chapter.
    /// Instead of individual page entries, uses a single stream link with p5:count.
    /// Per OPDS-PSE 1.1 & 1.2, includes p5:lastRead and p5:lastReadDate if available.
    /// </summary>
    public string BuildChapterPagesFeed(UserEntity user, Guid seriesId, string language, string chapterFilename, int pageCount,
        int? lastReadPage = null, DateTime? lastReadAt = null)
    {
        string base64Filename = Convert.ToBase64String(Encoding.UTF8.GetBytes(chapterFilename))
            .TrimEnd('=');

        string streamHref = $"/{EscapeXml(user.OpdsPath)}/image/{seriesId}/{EscapeXml(language)}/{EscapeXml(base64Filename)}/{{pageNumber}}";
        string contentType = GetChapterContentType(chapterFilename);

        // PSE attributes: p5:count (required), p5:lastRead + p5:lastReadDate (optional per OPDS-PSE 1.1/1.2)
        string pseAttrs = $@"p5:count=""{pageCount}""";
        if (lastReadPage > 0)
        {
            pseAttrs += $@" p5:lastRead=""{lastReadPage}""";
            if (lastReadAt.HasValue)
                pseAttrs += $@" p5:lastReadDate=""{lastReadAt.Value:yyyy-MM-ddTHH:mm:ssZ}""";
        }

        return $@"<?xml version=""1.0"" encoding=""UTF-8""?>
<feed xmlns=""http://www.w3.org/2005/Atom"" xmlns:p5=""http://vaemendis.net/opds-pse/ns"">
  <id>kaizoku:chapter:{seriesId}:{EscapeXml(language)}:{EscapeXml(base64Filename)}</id>
  <title>Chapter - {EscapeXml(chapterFilename)}</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  <entry>
    <title>Chapter - {EscapeXml(chapterFilename)}</title>
    <id>kaizoku:chapter:stream:{seriesId}:{EscapeXml(language)}:{EscapeXml(base64Filename)}</id>
    <link rel=""http://vaemendis.net/opds-pse/stream"" type=""{EscapeXml(contentType)}"" href=""{EscapeXml(streamHref)}"" {pseAttrs}/>
    <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  </entry>
</feed>";
    }

    /// <summary>
    /// Builds the categories feed with entries from the configured categories.
    /// Each category entry gets a thumbnail from a random series in that category.
    /// </summary>
    public async Task<string> BuildCategoriesFeedAsync(UserEntity user, CancellationToken token = default)
    {
        var settings = _settingsService.DirectSettings;
        string[] categories = settings?.Categories ?? [];
        if (categories.Length == 0)
        {
            return $@"<?xml version=""1.0"" encoding=""UTF-8""?>
<feed xmlns=""http://www.w3.org/2005/Atom"">
  <id>kaizoku:{EscapeXml(user.OpdsPath)}:categories</id>
  <title>Categories - {EscapeXml(user.Username)}</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
</feed>";
        }

        // Get all series to find thumbnails per category
        var allSeries = await _db.Series
            .AsNoTracking()
            .ToListAsync(token);

        var sb = new StringBuilder();
        sb.Append($@"<?xml version=""1.0"" encoding=""UTF-8""?>
<feed xmlns=""http://www.w3.org/2005/Atom"">
  <id>kaizoku:{EscapeXml(user.OpdsPath)}:categories</id>
  <title>Categories - {EscapeXml(user.Username)}</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
");

        foreach (var category in categories)
        {
            // Find series in this category (match against Genre list)
            var seriesInCategory = allSeries
                .Where(s => s.Genre.Any(g =>
                    g.Equals(category, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            // Pick a random thumbnail from the category
            string thumb = await PickRandomThumbnailAsync(user.OpdsPath,
                seriesInCategory.Where(s => !string.IsNullOrWhiteSpace(s.ThumbnailUrl)).ToList(), token);

            sb.Append($@"  <entry>
    <title>{EscapeXml(category)}</title>
    <id>kaizoku:category:{EscapeXml(category)}</id>
    <link rel=""subsection"" href=""/{EscapeXml(user.OpdsPath)}/categories/{EscapeXml(category)}""/>
    {thumb}
    <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  </entry>
");
        }

        sb.Append("</feed>");
        return sb.ToString();
    }

    private string BuildLanguageSelectionFeed(UserEntity user, Models.Database.SeriesEntity series, List<string> languages)
    {
        var sb = new StringBuilder();
        sb.Append($@"<?xml version=""1.0"" encoding=""UTF-8""?>
<feed xmlns=""http://www.w3.org/2005/Atom"">
  <id>kaizoku:series:{series.Id}:languages</id>
  <title>Select Language - {EscapeXml(series.Title)}</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
");

        foreach (var lang in languages.OrderBy(l => l))
        {
            sb.Append($@"  <entry>
    <title>{EscapeXml(lang)}</title>
    <link rel=""subsection"" href=""/{EscapeXml(user.OpdsPath)}/series/{series.Id}/language/{EscapeXml(lang)}""/>
    <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
  </entry>
");
        }

        sb.Append("</feed>");
        return sb.ToString();
    }

    private static string BuildErrorFeed(string message)
    {
        return $@"<?xml version=""1.0"" encoding=""UTF-8""?>
<feed xmlns=""http://www.w3.org/2005/Atom"">
  <id>kaizoku:error</id>
  <title>Error - {EscapeXml(message)}</title>
  <updated>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</updated>
</feed>";
    }

    /// <summary>
    /// Determines the image content type for an archive filename.
    /// </summary>
    private static string GetChapterContentType(string? filename)
    {
        if (string.IsNullOrWhiteSpace(filename))
            return "image/jpeg";
        string ext = System.IO.Path.GetExtension(filename).ToLowerInvariant();
        return ext switch
        {
            ".cbz" or ".zip" or ".cbr" or ".rar" or ".cb7" or ".7z" => "image/jpeg",
            _ => "image/jpeg"
        };
    }

    /// <summary>
    /// Picks a random thumbnail from a list of series and builds the link elements.
    /// Falls back to empty string if no series with thumbnails are available.
    /// </summary>
    private async Task<string> PickRandomThumbnailAsync(string opdsPath, List<SeriesEntity> seriesWithThumb, CancellationToken token)
    {
        if (seriesWithThumb.Count == 0)
            return string.Empty;

        var random = new Random();
        var pick = seriesWithThumb[random.Next(seriesWithThumb.Count)];
        return await BuildThumbnailLinkAsync(opdsPath, pick.ThumbnailUrl, token);
    }

    /// <summary>
    /// Builds the OPDS thumbnail link elements for a series entry.
    /// Resolves the thumbnail URL to a cache key and links directly to /api/image/{key}.
    /// Emits both image and image/thumbnail link relations per OPDS 1.2 spec.
    /// Returns an empty string if the series has no thumbnail.
    /// </summary>
    private async Task<string> BuildThumbnailLinkAsync(string opdsPath, string? thumbnailUrl, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(thumbnailUrl))
            return string.Empty;

        string key = await _thumbCache.GetKeyAsync(thumbnailUrl, token);
        if (string.IsNullOrEmpty(key))
            return string.Empty;

        // Use the OPDS-authenticated path instead of the raw /api/image/{key} endpoint
        string href = EscapeXml($"/{opdsPath}/image/{key}");
        return $@"    <link rel=""http://opds-spec.org/image"" href=""{href}""/>
    <link rel=""http://opds-spec.org/image/thumbnail"" href=""{href}""/>";
    }

    private static string EscapeXml(string value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;
        return value
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");
    }
}