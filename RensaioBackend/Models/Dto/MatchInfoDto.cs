using System.Text.Json.Serialization;
using RensaioBackend.Models;

namespace RensaioBackend.Models.Dto;

public class MatchInfoDto : ProviderSummaryBase
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
}