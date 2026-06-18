using RensaioBackend.Models;
using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Dto;

public class DownloadCardInfoDto : DownloadSummaryBase
{
    [JsonPropertyName("pageCount")]
    public int PageCount { get; set; }

    [JsonPropertyName("chapterNumber")]
    public decimal? ChapterNumber { get; set; }

    [JsonPropertyName("chapterName")]
    public string ChapterName { get; set; } = string.Empty;
}