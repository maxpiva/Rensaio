using KaizokuBackend.Models.ReadState;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;

namespace KaizokuBackend.Services.ReadState;

/// <summary>
/// Hashes are used for ETag-based conditional requests in OPDS image serving.
/// Maintains an in-memory cache (per series storage path) for fast lookups
/// without hitting the disk on every request.
/// </summary>
public class HashCacheService
{
    private readonly string _hashesRootPath;
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    /// <summary>
    /// In-memory cache of series hash data, keyed by normalized seriesStoragePath.
    /// Populated on first access, updated on writes.
    /// </summary>
    private readonly ConcurrentDictionary<string, SeriesHashCache> _memoryCache = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Protects concurrent file reads/writes for the same series hash file.
    /// </summary>
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _fileLocks = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Initializes the hash cache service.
    /// Hashes root is: {runtimeDirectory}/hashes/
    /// </summary>
    public HashCacheService(IConfiguration configuration)
    {
        string runtimeDir = configuration["runtimeDirectory"] ?? ".";
        _hashesRootPath = System.IO.Path.Combine(runtimeDir, "hashes");
        if (!Directory.Exists(_hashesRootPath))
            Directory.CreateDirectory(_hashesRootPath);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Public API — Chapter-level operations
    // ──────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Gets the chapter hash cache for a specific archive in a series.
    /// Checks in-memory cache first; falls back to disk if not found.
    /// Returns null if the hash file or chapter entry doesn't exist.
    /// </summary>
    public ChapterHashCache? GetChapterHash(string seriesStoragePath, string archiveFilename)
    {
        var seriesCache = GetOrLoadSeriesHashCache(seriesStoragePath);
        return seriesCache?.Chapters.FirstOrDefault(c =>
            string.Equals(c.ArchiveFilename, archiveFilename, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Gets all chapter hash entries for a series archive.
    /// Checks in-memory cache first; falls back to disk if not found.
    /// Returns an empty list if no hashes exist.
    /// </summary>
    public List<ChapterHashCache> GetAllChapterHashes(string seriesStoragePath, string archiveFilename)
    {
        var chapter = GetChapterHash(seriesStoragePath, archiveFilename);
        return chapter != null ? [chapter] : [];
    }

    /// <summary>
    /// Saves (adds or updates) a chapter hash cache entry in both memory and disk.
    /// </summary>
    public void SaveChapterHash(string seriesStoragePath, ChapterHashCache cache)
    {
        var seriesCache = GetOrCreateSeriesHashCache(seriesStoragePath);

        var existing = seriesCache.Chapters.FirstOrDefault(c =>
            string.Equals(c.ArchiveFilename, cache.ArchiveFilename, StringComparison.OrdinalIgnoreCase));
        if (existing != null)
        {
            existing.ArchiveLastModifiedUtc = cache.ArchiveLastModifiedUtc;
            existing.PageHashes = cache.PageHashes;
        }
        else
        {
            seriesCache.Chapters.Add(cache);
        }

        SaveSeriesHashCache(seriesStoragePath, seriesCache);
    }

    /// <summary>
    /// Deletes a chapter hash cache entry from both memory and disk.
    /// </summary>
    public void DeleteChapterHash(string seriesStoragePath, string archiveFilename)
    {
        var seriesCache = GetOrCreateSeriesHashCache(seriesStoragePath);
        seriesCache.Chapters.RemoveAll(c =>
            string.Equals(c.ArchiveFilename, archiveFilename, StringComparison.OrdinalIgnoreCase));
        SaveSeriesHashCache(seriesStoragePath, seriesCache);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Public API — Page-level hash operations
    // ──────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Attempts to retrieve a cached MD5 hash for a specific page index and mime type.
    /// Returns true and sets <paramref name="md5Hash"/> if found; returns false if not.
    /// </summary>
    public bool TryGetPageHash(string seriesStoragePath, string archiveFilename, int pageIndex, string mimeType, out string? md5Hash)
    {
        md5Hash = null;
        var chapter = GetChapterHash(seriesStoragePath, archiveFilename);
        if (chapter == null)
            return false;

        if (chapter.PageHashes.TryGetValue(pageIndex, out var mimeMap) &&
            mimeMap.TryGetValue(mimeType, out var hash))
        {
            md5Hash = hash;
            return true;
        }

        return false;
    }

    /// <summary>
    /// Sets the MD5 hash for a specific page index and mime type in both memory and disk.
    /// </summary>
    public void SetPageHash(string seriesStoragePath, string archiveFilename, int pageIndex, string mimeType, string md5Hash)
    {
        var chapter = GetChapterHash(seriesStoragePath, archiveFilename);
        if (chapter == null)
        {
            // Create a new chapter entry
            chapter = new ChapterHashCache
            {
                ArchiveFilename = archiveFilename,
                ArchiveLastModifiedUtc = DateTime.UtcNow,
                PageHashes = new Dictionary<int, Dictionary<string, string>>
                {
                    [pageIndex] = new() { [mimeType] = md5Hash }
                }
            };
            SaveChapterHash(seriesStoragePath, chapter);
            return;
        }

        // Update existing chapter
        if (!chapter.PageHashes.TryGetValue(pageIndex, out var mimeMap))
        {
            mimeMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            chapter.PageHashes[pageIndex] = mimeMap;
        }

        mimeMap[mimeType] = md5Hash;
        SaveChapterHash(seriesStoragePath, chapter);
    }

    /// <summary>
    /// Computes the MD5 hash of a file and saves it to the cache for the given
    /// page index and mime type. Only computes if the hash doesn't already exist.
    /// Returns the MD5 hex string.
    /// </summary>
    public string ComputeAndSavePageHash(string seriesStoragePath, string archiveFilename, int pageIndex, string mimeType, string filePath)
    {
        // Check if already cached
        if (TryGetPageHash(seriesStoragePath, archiveFilename, pageIndex, mimeType, out var existingHash) && existingHash != null)
            return existingHash;

        // Compute MD5 from file bytes
        string md5Hex;
        using (var md5 = MD5.Create())
        {
            using var stream = System.IO.File.OpenRead(filePath);
            byte[] hashBytes = md5.ComputeHash(stream);
            md5Hex = Convert.ToHexString(hashBytes).ToLowerInvariant();
        }

        // Save to cache
        SetPageHash(seriesStoragePath, archiveFilename, pageIndex, mimeType, md5Hex);

        return md5Hex;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers — Memory + File operations
    // ──────────────────────────────────────────────────────────────────────────

    private string NormalizeSeriesPath(string seriesStoragePath)
    {
        return seriesStoragePath.TrimEnd(System.IO.Path.DirectorySeparatorChar, '/', '\\');
    }

    /// <summary>
    /// Gets the series hash cache from memory or loads it from disk.
    /// Populates the memory cache on a cache miss.
    /// </summary>
    private SeriesHashCache? GetOrLoadSeriesHashCache(string seriesStoragePath)
    {
        string key = NormalizeSeriesPath(seriesStoragePath);

        if (_memoryCache.TryGetValue(key, out var cached))
            return cached;

        var fromDisk = LoadSeriesHashCache(seriesStoragePath);
        if (fromDisk != null)
        {
            _memoryCache[key] = fromDisk;
        }

        return fromDisk;
    }

    private SeriesHashCache GetOrCreateSeriesHashCache(string seriesStoragePath)
    {
        return GetOrLoadSeriesHashCache(seriesStoragePath) ?? new SeriesHashCache();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers — File operations
    // ──────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Resolves the hash file path for a series.
    /// </summary>
    private string GetSeriesHashPath(string seriesStoragePath)
    {
        // Normalize: use the series storage path relative to hashes root
        string sanitized = seriesStoragePath
            .TrimEnd(System.IO.Path.DirectorySeparatorChar, '/', '\\')
            .Replace(':', '_')
            .Replace('/', System.IO.Path.DirectorySeparatorChar);

        // If series is in a category subfolder, preserve that structure
        string relativePath = sanitized;
        if (relativePath.Contains(System.IO.Path.DirectorySeparatorChar))
        {
            string dir = System.IO.Path.GetDirectoryName(relativePath) ?? "";
            string name = System.IO.Path.GetFileName(relativePath);
            string fullDir = System.IO.Path.Combine(_hashesRootPath, dir);
            if (!Directory.Exists(fullDir))
                Directory.CreateDirectory(fullDir);
            return System.IO.Path.Combine(fullDir, name + ".json");
        }

        return System.IO.Path.Combine(_hashesRootPath, relativePath + ".json");
    }

    private SeriesHashCache? LoadSeriesHashCache(string seriesStoragePath)
    {
        string hashPath = GetSeriesHashPath(seriesStoragePath);
        if (!File.Exists(hashPath))
            return null;

        string json = File.ReadAllText(hashPath);
        return JsonSerializer.Deserialize<SeriesHashCache>(json, _jsonOptions);
    }

    private void SaveSeriesHashCache(string seriesStoragePath, SeriesHashCache cache)
    {
        string key = NormalizeSeriesPath(seriesStoragePath);
        string hashPath = GetSeriesHashPath(seriesStoragePath);
        string tempPath = hashPath + ".tmp";
        string json = JsonSerializer.Serialize(cache, _jsonOptions);
        File.WriteAllText(tempPath, json);
        File.Move(tempPath, hashPath, overwrite: true);

        // Update memory cache after successful disk write
        _memoryCache[key] = cache;
    }
}