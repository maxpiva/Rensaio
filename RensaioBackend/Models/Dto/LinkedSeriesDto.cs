using RensaioBackend.Models;
using RensaioBackend.Models.Abstractions;
using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Dto;
// [Schema] // Controller I/O Model
public class LinkedSeriesDto : SeriesSummaryBase
{
    public string ProviderId { get; set; } = "";
    [JsonPropertyName("linkedIds")]
    public List<string> LinkedIds { get; set; } = new List<string>();


}