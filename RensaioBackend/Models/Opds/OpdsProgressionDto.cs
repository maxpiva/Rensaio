using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Opds;

public class OpdsProgressionDto
{
    [JsonPropertyName("modified")]
    public DateTime Modified { get; set; }

    [JsonPropertyName("device")]
    public OpdsProgressionDeviceDto Device { get; set; } = new();

    [JsonPropertyName("progression")]
    public double Progression { get; set; }

    [JsonPropertyName("references")]
    public List<string> References { get; set; } = [];
}

public class OpdsProgressionDeviceDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}