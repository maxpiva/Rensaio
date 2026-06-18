using RensaioBackend.Models;
using RensaioBackend.Models.ReadState;
using System.Collections.Concurrent;

namespace RensaioBackend.Services.ReadState;

/// <summary>
/// Cache for read state data to avoid reading rensaio.json on every OPDS request.
/// </summary>
public class ReadStateCacheService
{
    private readonly ConcurrentDictionary<string, List<ChapterReadState>> _cache = new();

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
        _cache[key] = states;
    }

    /// <summary>
    /// Invalidates the cache for a specific user+series combination.
    /// </summary>
    public void Invalidate(string username, string seriesStoragePath)
    {
        string key = BuildKey(username, seriesStoragePath);
        _cache.TryRemove(key, out _);
    }

    /// <summary>
    /// Invalidates all cached read states.
    /// </summary>
    public void InvalidateAll()
    {
        _cache.Clear();
    }

    private static string BuildKey(string username, string seriesStoragePath)
    {
        return $"{username}:{seriesStoragePath}";
    }
}