using System.Text.Json.Serialization;
using RensaioBackend.Models;

namespace RensaioBackend.Models.Dto;

public class SmallProviderDto : ProviderSummaryBase
{
    [JsonPropertyName("url")]
    public override string? Url { get; set; } = string.Empty;
}
