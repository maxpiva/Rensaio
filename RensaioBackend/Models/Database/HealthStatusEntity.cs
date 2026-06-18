using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using RensaioBackend.Models.Enums;

namespace RensaioBackend.Models.Database;

public class HealthStatusEntity
{
    [Key]
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("targetType")]
    public HealthStatusTargetType TargetType { get; set; }

    [JsonPropertyName("targetId")]
    public Guid TargetId { get; set; }

    [JsonPropertyName("level")]
    public HealthStatusLevel Level { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("affectedSeriesJson")]
    public string? AffectedSeriesJson { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("resolvedAt")]
    public DateTime? ResolvedAt { get; set; }

    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;
}