using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Dto;

/// <summary>
/// A single chapter in the unified, series-level chapter list. Chapters are merged across every
/// source so the UI can tell, per chapter, whether it is downloaded (and from which source) or
/// genuinely missing — independent of which provider happens to hold the file.
/// </summary>
public class ChapterDetailDto
{
    /// <summary>Chapter number (natural key together with the series).</summary>
    [JsonPropertyName("number")]
    public decimal? Number { get; set; }

    /// <summary>Chapter title, if known.</summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>True when at least one source holds a downloaded file for this chapter.</summary>
    [JsonPropertyName("downloaded")]
    public bool Downloaded { get; set; }

    /// <summary>Id of the source whose file is on disk (storage source preferred). Null when missing.</summary>
    [JsonPropertyName("sourceProviderId")]
    public Guid? SourceProviderId { get; set; }

    /// <summary>Display name of the source holding the file. Null when missing.</summary>
    [JsonPropertyName("sourceProviderName")]
    public string? SourceProviderName { get; set; }

    /// <summary>
    /// Remote-capable sources that know this chapter (drives the re-download source picker).
    /// </summary>
    [JsonPropertyName("availableProviders")]
    public List<ChapterSourceDto> AvailableProviders { get; set; } = [];
}

/// <summary>A selectable source for (re-)downloading a chapter.</summary>
public class ChapterSourceDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}
