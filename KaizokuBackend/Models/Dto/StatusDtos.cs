using System.Text.Json.Serialization;
using KaizokuBackend.Models.Enums;

namespace KaizokuBackend.Models.Dto;

public class SeriesHealthDto
{
    [JsonPropertyName("seriesId")]
    public Guid SeriesId { get; set; }

    [JsonPropertyName("seriesTitle")]
    public string SeriesTitle { get; set; } = string.Empty;

    [JsonPropertyName("seriesThumbnail")]
    public string? SeriesThumbnail { get; set; }

    [JsonPropertyName("level")]
    public HealthStatusLevel Level { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("lastChapterDate")]
    public DateTime? LastChapterDate { get; set; }

    [JsonPropertyName("daysWithoutRelease")]
    public int? DaysWithoutRelease { get; set; }

    [JsonPropertyName("providers")]
    public List<SmallProviderHealthDto> Providers { get; set; } = [];
}

public class ProviderHealthDto
{
    [JsonPropertyName("providerId")]
    public Guid ProviderId { get; set; }

    [JsonPropertyName("providerName")]
    public string ProviderName { get; set; } = string.Empty;

    [JsonPropertyName("scanlator")]
    public string Scanlator { get; set; } = string.Empty;

    [JsonPropertyName("language")]
    public string Language { get; set; } = string.Empty;

    [JsonPropertyName("level")]
    public HealthStatusLevel Level { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("lastErrorDate")]
    public DateTime? LastErrorDate { get; set; }

    [JsonPropertyName("consecutiveErrors")]
    public int ConsecutiveErrors { get; set; }

    [JsonPropertyName("isMihonInstalled")]
    public bool IsMihonInstalled { get; set; } = true;

    /// <summary>
    /// Only series that have their own active alerts (yellow/red) appear here.
    /// </summary>
    [JsonPropertyName("affectedSeries")]
    public List<SeriesHealthDto> AffectedSeries { get; set; } = [];
}

public class SmallProviderHealthDto
{
    [JsonPropertyName("providerId")]
    public Guid ProviderId { get; set; }

    [JsonPropertyName("providerName")]
    public string ProviderName { get; set; } = string.Empty;

    [JsonPropertyName("language")]
    public string Language { get; set; } = string.Empty;

    [JsonPropertyName("level")]
    public HealthStatusLevel Level { get; set; }
}

public class StatusSummaryDto
{
    [JsonPropertyName("totalYellowSeries")]
    public int TotalYellowSeries { get; set; }

    [JsonPropertyName("totalRedSeries")]
    public int TotalRedSeries { get; set; }

    [JsonPropertyName("totalYellowProviders")]
    public int TotalYellowProviders { get; set; }

    [JsonPropertyName("totalRedProviders")]
    public int TotalRedProviders { get; set; }
}

public class ClearAlertRequest
{
    [JsonPropertyName("targetType")]
    public HealthStatusTargetType TargetType { get; set; }

    [JsonPropertyName("targetId")]
    public Guid TargetId { get; set; }
}