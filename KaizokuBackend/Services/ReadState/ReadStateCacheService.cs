using KaizokuBackend.Models;
using KaizokuBackend.Models.ReadState;
using Microsoft.Extensions.Caching.Memory;

namespace KaizokuBackend.Services.ReadState;

/// <summary>
/// In-memory cache for read state data to avoid reading kaizoku.json on every OPDS request.
/// </summary>
public class ReadStateCacheService
{
    private readonly MemoryCache _cache;
    private readonly TimeSpan _cacheDuration = TimeSpan.FromMinutes(5);

    public ReadStateCacheService()
    {
        _cache = new MemoryCache(new MemoryCacheOptions());
    }

    /// <summary>
    /// Gets cached read states for a user and series.
    /// Key format: "readstate:{username}:{seriesStoragePath}"
    /// </summary>
    public List<ChapterReadState>? GetCachedReadStates(string username, string seriesStoragePath)
    {
        string key = BuildKey(username, seriesStoragePath);
        if (_cache.TryGetValue(key, out List<ChapterReadState>? states))
            return states;
        return null;
    }

    /// <summary>
    /// Sets cached read states for a user and series.
    /// </summary>
    public void SetCachedReadStates(string username, string seriesStoragePath, List<ChapterReadState> states)
    {
        string key = BuildKey(username, seriesStoragePath);
        _cache.Set(key, states, _cacheDuration);
    }

    /// <summary>
    /// Invalidates the cache for a specific user+series combination.
    /// </summary>
    public void Invalidate(string username, string seriesStoragePath)
    {
        string key = BuildKey(username, seriesStoragePath);
        _cache.Remove(key);
    }

    /// <summary>
    /// Invalidates all cached read states.
    /// </summary>
    public void InvalidateAll()
    {
        _cache.Compact(1.0);
    }

    private static string BuildKey(string username, string seriesStoragePath)
    {
        return $"readstate:{username}:{seriesStoragePath}";
    }
}