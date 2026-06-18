using RensaioBackend.Models.Abstractions;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Enums;
using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Dto;

public class ScrobblerConfigDto
{
    [JsonPropertyName("provider")]
    public ScrobblerProvider Provider { get; set; }

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("icon")]
    public string Icon { get; set; } = string.Empty;

    [JsonPropertyName("link")]
    public string? Link { get; set; }

    [JsonPropertyName("linkDescription")]
    public string? LinkDescription { get; set; }

    [JsonPropertyName("isEnabled")]
    public bool IsEnabled { get; set; }

    [JsonPropertyName("isConnected")]
    public bool IsConnected { get; set; }

    [JsonPropertyName("autoSync")]
    public bool AutoSync { get; set; }

    [JsonPropertyName("lastSyncAt")]
    public DateTime? LastSyncAt { get; set; }

    [JsonPropertyName("lastUploadAt")]
    public DateTime? LastUploadAt { get; set; }

    [JsonPropertyName("lastDownloadAt")]
    public DateTime? LastDownloadAt { get; set; }

    [JsonPropertyName("supportsDirectAuth")]
    public bool SupportsDirectAuth { get; set; }

    [JsonPropertyName("seriesUrlTemplate")]
    public string? SeriesUrlTemplate { get; set; }

    [JsonPropertyName("imageTemplateUrl")]
    public string? ImageTemplateUrl { get; set; }
}

public class ScrobblerConfigUpdateDto
{
    [JsonPropertyName("isEnabled")]
    public bool? IsEnabled { get; set; }

    [JsonPropertyName("autoSync")]
    public bool? AutoSync { get; set; }
}

public class OAuthAuthorizeResponseDto
{
    [JsonPropertyName("authUrl")]
    public string AuthUrl { get; set; } = string.Empty;

    [JsonPropertyName("state")]
    public string State { get; set; } = string.Empty;
}

public class OAuthCallbackRequestDto
{
    [JsonPropertyName("provider")]
    public ScrobblerProvider Provider { get; set; }

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("state")]
    public string State { get; set; } = string.Empty;

    [JsonPropertyName("codeVerifier")]
    public string? CodeVerifier { get; set; }
}

public class SeriesMatchStatusDto
{
    [JsonPropertyName("seriesId")]
    public Guid SeriesId { get; set; }

    [JsonPropertyName("seriesTitle")]
    public string SeriesTitle { get; set; } = string.Empty;

    [JsonPropertyName("seriesCoverUrl")]
    public string? SeriesCoverUrl { get; set; }

    [JsonPropertyName("alternativeTitles")]
    public string AlternativeTitles { get; set; } = string.Empty;

    [JsonPropertyName("provider")]
    public ScrobblerProvider Provider { get; set; }

    [JsonPropertyName("mappingStatus")]
    public SeriesMappingStatus MappingStatus { get; set; }

    [JsonPropertyName("externalSeriesId")]
    public string? ExternalSeriesId { get; set; }

    [JsonPropertyName("externalSeriesTitle")]
    public string? ExternalSeriesTitle { get; set; }

    [JsonPropertyName("externalCoverUrl")]
    public string? ExternalCoverUrl { get; set; }

    [JsonPropertyName("externalSeriesUrl")]
    public string? ExternalSeriesUrl { get; set; }

    [JsonPropertyName("matchScore")]
    public double? MatchScore { get; set; }
}

public class AutoMatchResultDto
{
    [JsonPropertyName("autoMatched")]
    public int AutoMatched { get; set; }

    [JsonPropertyName("leftUnmatched")]
    public int LeftUnmatched { get; set; }

    [JsonPropertyName("totalSeries")]
    public int TotalSeries { get; set; }

    [JsonPropertyName("suggestedMatches")]
    public List<SeriesMatchStatusDto> SuggestedMatches { get; set; } = [];
}

public class SeriesMatchSearchDto
{
    [JsonPropertyName("provider")]
    public ScrobblerProvider Provider { get; set; }

    [JsonPropertyName("query")]
    public string Query { get; set; } = string.Empty;
}

public class SeriesMatchSearchResultDto
{
    [JsonPropertyName("provider")]
    public ScrobblerProvider Provider { get; set; }

    [JsonPropertyName("results")]
    public List<ScrobblerSearchResult> Results { get; set; } = [];
}

public class ConfirmMatchRequestDto
{
    [JsonPropertyName("seriesId")]
    public Guid SeriesId { get; set; }

    [JsonPropertyName("provider")]
    public ScrobblerProvider Provider { get; set; }

    [JsonPropertyName("externalSeriesId")]
    public string ExternalSeriesId { get; set; } = string.Empty;

    [JsonPropertyName("externalSeriesTitle")]
    public string? ExternalSeriesTitle { get; set; }
}

public class DisableLinkRequestDto
{
    [JsonPropertyName("seriesId")]
    public Guid SeriesId { get; set; }

    [JsonPropertyName("provider")]
    public ScrobblerProvider Provider { get; set; }
}

public class SyncStatusDto
{
    [JsonPropertyName("provider")]
    public ScrobblerProvider Provider { get; set; }

    [JsonPropertyName("lastSyncAt")]
    public DateTime? LastSyncAt { get; set; }

    [JsonPropertyName("lastUploadAt")]
    public DateTime? LastUploadAt { get; set; }

    [JsonPropertyName("lastDownloadAt")]
    public DateTime? LastDownloadAt { get; set; }

    [JsonPropertyName("seriesMatched")]
    public int SeriesMatched { get; set; }

    [JsonPropertyName("seriesUnmatched")]
    public int SeriesUnmatched { get; set; }

    [JsonPropertyName("seriesIgnored")]
    public int SeriesIgnored { get; set; }
}

public class ComicVineApiKeyDto
{
    [JsonPropertyName("apiKey")]
    public string ApiKey { get; set; } = string.Empty;
}

public class ScrobblerSearchResult
{
    [JsonPropertyName("externalId")]
    public string ExternalId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("alternateTitles")]
    public List<string> AlternateTitles { get; set; } = [];

    [JsonPropertyName("coverUrl")]
    public string? CoverUrl { get; set; }

    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("chapterCount")]
    public int? ChapterCount { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("synopsis")]
    public string? Synopsis { get; set; }

    [JsonPropertyName("score")]
    public decimal? Score { get; set; }

    [JsonPropertyName("year")]
    public string? Year { get; set; }
}

public class KitsuDirectAuthDto
{
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}

public class MangaDexDirectAuthDto
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;

    [JsonPropertyName("clientId")]
    public string ClientId { get; set; } = string.Empty;

    [JsonPropertyName("clientSecret")]
    public string ClientSecret { get; set; } = string.Empty;
}