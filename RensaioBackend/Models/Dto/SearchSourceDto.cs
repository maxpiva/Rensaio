using System.Text.Json.Serialization;
using RensaioBackend.Models;

namespace RensaioBackend.Models.Dto;

public class SearchSourceDto : ProviderSummaryBase
{
    [JsonPropertyName("mihonProviderId")]
    public string MihonProviderId { get; set; } = string.Empty;

}