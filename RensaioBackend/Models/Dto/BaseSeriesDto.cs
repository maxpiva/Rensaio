using System.Text.Json.Serialization;
using RensaioBackend.Extensions;
using RensaioBackend.Models.Enums;
using RensaioBackend.Models.Abstractions;

namespace RensaioBackend.Models.Dto;



public class BaseSeriesDto : IThumb
{
    private string _storagePath = string.Empty;
    private int _chapterCount;
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;
    [JsonPropertyName("thumbnailUrl")]
    public string ThumbnailUrl { get; set; } = string.Empty;
    [JsonPropertyName("artist")]
    public string Artist { get; set; } = string.Empty;
    [JsonPropertyName("author")]
    public string Author { get; set; } = string.Empty;
    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;
    [JsonPropertyName("genre")]
    public List<string> Genre { get; set; } = new List<string>();
    [JsonPropertyName("status")]
    public SeriesStatus Status { get; set; } = SeriesStatus.UNKNOWN;
    
    [JsonPropertyName("storagePath")]
    public string StoragePath
    {
        get => _storagePath;
        set => _storagePath = SeriesModelExtensions.NormalizeStoragePath(value);
    }
    [JsonPropertyName("type")]
    public string? Type { get; set; }
    [JsonPropertyName("chapterCount")]
    public int ChapterCount
    {
        get => _chapterCount;
        set => _chapterCount = SeriesModelExtensions.ClampChapterCount(value);
    }
    [JsonPropertyName("lastChapter")]
    public decimal? LastChapter { get; set; }
    [JsonPropertyName("lastChangeUTC")]
    public DateTime? LastChangeUTC { get; set; }
    [JsonPropertyName("lastChangeProvider")]
    public SmallProviderDto LastChangeProvider { get; set; } = new SmallProviderDto();
    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;
    [JsonPropertyName("pausedDownloads")]
    public bool PausedDownloads { get; set; }
    [JsonPropertyName("hasUnknown")]
    public bool HasUnknown { get; set; } = false;

    [JsonPropertyName("startFromChapter")]
    public decimal? StartFromChapter { get; set; }

    /// <summary>
    /// Release cadence in days (absolute value, always positive for display).
    /// Null = not yet determined. Negative in DB indicates user-set, positive = system-calculated.
    /// </summary>
    [JsonPropertyName("releaseCadenceDays")]
    public int? ReleaseCadenceDays { get; set; }

    [JsonPropertyName("category")]
    public string? Category { get; set; }
}