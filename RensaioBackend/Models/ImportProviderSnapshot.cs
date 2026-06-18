using RensaioBackend.Models.Enums;
using System.Text.Json.Serialization;

namespace RensaioBackend.Models;

public class ImportProviderSnapshot : ProviderSummaryBase
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("thumbnailUrl")]
    public override string? ThumbnailUrl { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public override SeriesStatus Status { get; set; } = SeriesStatus.UNKNOWN;

    [JsonPropertyName("chapterCount")]
    public int ChapterCount { get; set; }

    [JsonPropertyName("chapterList")]
    public List<StartStop> ChapterList { get; set; } = [];

    [JsonPropertyName("isDisabled")]
    public bool IsDisabled { get; set; }

    [JsonPropertyName("archives")]
    public List<ProviderArchiveSnapshot> Archives { get; set; } = [];
}
