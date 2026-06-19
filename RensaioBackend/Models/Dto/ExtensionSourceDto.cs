using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Dto;

public class ExtensionSourceDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";
    [JsonPropertyName("lang")]
    public string Language { get; set; } = "";
}
