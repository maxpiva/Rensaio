using KaizokuBackend.Models;
using System.Text.Json;

namespace KaizokuBackend.Models.ReadState;

/// <summary>
/// Per-user read state stored in kaizoku.json (never in the database).
/// </summary>
public class UserReadStateSnapshot
{
    public string Username { get; set; } = string.Empty;
    public List<ChapterReadState> Chapters { get; set; } = [];
}

public class ChapterReadState
{
    public decimal ChapterNumber { get; set; }
    public int LastReadPage { get; set; }
    public int TotalPages { get; set; }
    public bool IsCompleted { get; set; }
    public DateTime LastReadAt { get; set; }
}

/// <summary>
/// Hash cache for a series' chapters (stored in hashes directory, not kaizoku.json).
/// </summary>
public class SeriesHashCache
{
    public List<ChapterHashCache> Chapters { get; set; } = [];
}

public class ChapterHashCache
{
    public string ArchiveFilename { get; set; } = string.Empty;
    public DateTime ArchiveLastModifiedUtc { get; set; }
    /// <summary>
    /// Dictionary of page index -> Dictionary of mime type -> MD5 hex hash.
    /// </summary>
    public Dictionary<int, Dictionary<string,  string>> PageHashes { get; set; } = [];
}