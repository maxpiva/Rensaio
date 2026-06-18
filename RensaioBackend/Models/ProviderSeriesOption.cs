using System.Text.Json.Serialization;

namespace RensaioBackend.Models;

public class ProviderSeriesOption : SeriesProviderDetailsBase
{
    [JsonPropertyName("lastChapter")]
    public decimal? LastChapter { get; set; }

    [JsonPropertyName("preferred")]
    public bool Preferred { get; set; }
}
