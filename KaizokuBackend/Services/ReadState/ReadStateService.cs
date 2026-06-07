using KaizokuBackend.Models;
using KaizokuBackend.Models.ReadState;
using System.Text.Json;

namespace KaizokuBackend.Services.ReadState;

/// <summary>
/// Service for reading and writing read state to kaizoku.json files.
/// Read state is NEVER stored in the database.
/// </summary>
public class ReadStateService
{
    private readonly ReadStateCacheService _cacheService;
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public ReadStateService(ReadStateCacheService cacheService)
    {
        _cacheService = cacheService;
    }

    /// <summary>
    /// Gets the read state for a specific chapter for a user.
    /// </summary>
    public ChapterReadState? GetReadState(string username, string seriesStoragePath, decimal chapterNumber)
    {
        var states = GetSeriesReadStates(username, seriesStoragePath);
        return states.FirstOrDefault(s => s.ChapterNumber == chapterNumber);
    }

    /// <summary>
    /// Gets all chapter read states for a user in a series.
    /// Uses in-memory cache with 5-minute TTL.
    /// </summary>
    public List<ChapterReadState> GetSeriesReadStates(string username, string seriesStoragePath)
    {
        // Try cache first
        var cached = _cacheService.GetCachedReadStates(username, seriesStoragePath);
        if (cached != null)
            return cached;

        // Load from kaizoku.json
        var snapshot = LoadKaizokuJson(seriesStoragePath);
        var userStates = snapshot?.UserReadStates?
            .FirstOrDefault(u => u.Username == username)?
            .Chapters ?? [];

        // Cache and return
        _cacheService.SetCachedReadStates(username, seriesStoragePath, userStates);
        return userStates;
    }

    /// <summary>
    /// Gets all user read states (all users) from a series.
    /// </summary>
    public List<UserReadStateSnapshot> GetAllUserReadStates(string seriesStoragePath)
    {
        var snapshot = LoadKaizokuJson(seriesStoragePath);
        return snapshot?.UserReadStates ?? [];
    }

    /// <summary>
    /// Sets the read state for a chapter (page-level tracking).
    /// </summary>
    public void SetReadState(string username, string seriesStoragePath, decimal chapterNumber, int lastReadPage, int totalPages)
    {
        var snapshot = LoadOrCreateKaizokuJson(seriesStoragePath);

        var userState = snapshot.UserReadStates.FirstOrDefault(u => u.Username == username);
        if (userState == null)
        {
            userState = new UserReadStateSnapshot { Username = username, Chapters = [] };
            snapshot.UserReadStates.Add(userState);
        }

        var chapterState = userState.Chapters.FirstOrDefault(c => c.ChapterNumber == chapterNumber);
        if (chapterState == null)
        {
            chapterState = new ChapterReadState
            {
                ChapterNumber = chapterNumber,
                LastReadPage = lastReadPage,
                TotalPages = totalPages,
                IsCompleted = lastReadPage >= totalPages,
                LastReadAt = DateTime.UtcNow
            };
            userState.Chapters.Add(chapterState);
        }
        else
        {
            chapterState.LastReadPage = lastReadPage;
            chapterState.TotalPages = totalPages;
            chapterState.IsCompleted = lastReadPage >= totalPages;
            chapterState.LastReadAt = DateTime.UtcNow;
        }

        SaveKaizokuJson(seriesStoragePath, snapshot);

        // Invalidate cache
        _cacheService.Invalidate(username, seriesStoragePath);
    }

    /// <summary>
    /// Marks a chapter as completed.
    /// </summary>
    public void MarkChapterCompleted(string username, string seriesStoragePath, decimal chapterNumber)
    {
        var snapshot = LoadOrCreateKaizokuJson(seriesStoragePath);

        var userState = snapshot.UserReadStates.FirstOrDefault(u => u.Username == username);
        if (userState == null)
        {
            userState = new UserReadStateSnapshot { Username = username, Chapters = [] };
            snapshot.UserReadStates.Add(userState);
        }

        var chapterState = userState.Chapters.FirstOrDefault(c => c.ChapterNumber == chapterNumber);
        if (chapterState != null)
        {
            chapterState.IsCompleted = true;
            chapterState.LastReadAt = DateTime.UtcNow;
        }
        else
        {
            userState.Chapters.Add(new ChapterReadState
            {
                ChapterNumber = chapterNumber,
                LastReadPage = 0,
                TotalPages = 0,
                IsCompleted = true,
                LastReadAt = DateTime.UtcNow
            });
        }

        SaveKaizokuJson(seriesStoragePath, snapshot);
        _cacheService.Invalidate(username, seriesStoragePath);
    }

    /// <summary>
    /// Calculates the number of unread chapters for a user in a series.
    /// </summary>
    public int GetUnreadChaptersCount(string username, string seriesStoragePath, int totalChapters)
    {
        var readStates = GetSeriesReadStates(username, seriesStoragePath);
        int completedCount = readStates.Count(c => c.IsCompleted);
        return Math.Max(0, totalChapters - completedCount);
    }

    /// <summary>
    /// Imports user read states into a series' kaizoku.json.
    /// Used during the import wizard flow.
    /// </summary>
    public void ImportUserReadStates(string seriesStoragePath, List<UserReadStateSnapshot> readStates)
    {
        var snapshot = LoadOrCreateKaizokuJson(seriesStoragePath);

        foreach (var incoming in readStates)
        {
            var existing = snapshot.UserReadStates.FirstOrDefault(u => u.Username == incoming.Username);
            if (existing != null)
            {
                // Merge chapters (incoming ones replace existing for same chapter number)
                foreach (var chapter in incoming.Chapters)
                {
                    var existingChapter = existing.Chapters.FirstOrDefault(c => c.ChapterNumber == chapter.ChapterNumber);
                    if (existingChapter != null)
                    {
                        existingChapter.LastReadPage = chapter.LastReadPage;
                        existingChapter.TotalPages = chapter.TotalPages;
                        existingChapter.IsCompleted = chapter.IsCompleted;
                        existingChapter.LastReadAt = chapter.LastReadAt;
                    }
                    else
                    {
                        existing.Chapters.Add(chapter);
                    }
                }
            }
            else
            {
                snapshot.UserReadStates.Add(incoming);
            }
        }

        snapshot.KaizokuVersion = 2; // Bump version to indicate read state support
        SaveKaizokuJson(seriesStoragePath, snapshot);
    }

    /// <summary>
    /// Loads the kaizoku.json for a series and adds the UserReadStates field if missing.
    /// </summary>
    private ImportSeriesSnapshot LoadOrCreateKaizokuJson(string seriesStoragePath)
    {
        var snapshot = LoadKaizokuJson(seriesStoragePath);
        if (snapshot == null)
        {
            snapshot = new ImportSeriesSnapshot
            {
                KaizokuVersion = 2,
                UserReadStates = []
            };
        }
        else if (snapshot.UserReadStates == null)
        {
            snapshot.UserReadStates = [];
        }
        return snapshot;
    }

    /// <summary>
    /// Loads the kaizoku.json file for a series directory.
    /// Returns null if the file doesn't exist.
    /// </summary>
    private ImportSeriesSnapshot? LoadKaizokuJson(string seriesStoragePath)
    {
        string kaizokuPath = GetKaizokuJsonPath(seriesStoragePath);
        if (!File.Exists(kaizokuPath))
            return null;

        string json = File.ReadAllText(kaizokuPath);
        return JsonSerializer.Deserialize<ImportSeriesSnapshot>(json, _jsonOptions);
    }

    /// <summary>
    /// Saves the kaizoku.json file atomically (write to temp, then rename).
    /// </summary>
    private void SaveKaizokuJson(string seriesStoragePath, ImportSeriesSnapshot snapshot)
    {
        string kaizokuPath = GetKaizokuJsonPath(seriesStoragePath);
        string tempPath = kaizokuPath + ".tmp";

        string json = JsonSerializer.Serialize(snapshot, _jsonOptions);
        File.WriteAllText(tempPath, json);
        File.Move(tempPath, kaizokuPath, overwrite: true);
    }

    /// <summary>
    /// Resolves the full path to kaizoku.json for a series storage path.
    /// </summary>
    private static string GetKaizokuJsonPath(string seriesStoragePath)
    {
        return System.IO.Path.Combine(seriesStoragePath, "kaizoku.json");
    }
}