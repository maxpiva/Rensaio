using RensaioBackend.Models.Abstractions;
using RensaioBackend.Models;
using RensaioBackend.Models.Enums;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Database;
[Index(nameof(MihonProviderId))]
[Index(nameof(MihonId))]
[Index(nameof(SeriesId))]
[Index(nameof(Title), nameof(Language))]
[Index(nameof(Provider), nameof(Language), nameof(Scanlator))]
public class SeriesProviderEntity : ProviderSummaryBase, IBridgeItemInfo, IThumb
{
    [Key]
    public Guid Id { get; set; }
    public Guid SeriesId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? MihonProviderId { get; set; }
    public string? MihonId { get; set; }
    public string? BridgeItemInfo { get; set; }
    public string? Artist { get; set; } = null;
    public string? Author { get; set; } = null;
    public string? Description { get; set; } = null;
    public List<string> Genre { get; set; } = new();
    public DateTime? FetchDate { get; set; }
    public long? ChapterCount { get; set; } = null;
    public decimal? ContinueAfterChapter { get; set; }
    public bool IsTitle { get; set; }
    public bool IsCover { get; set; }
    public bool IsUnknown { get; set; }
    public bool IsNSFW { get; set; }
    public bool IsLocal { get; set; }
    public bool IsDisabled { get; set; }
    public bool IsUninstalled { get; set; }
    public List<Chapter> Chapters { get; set; } = [];

    /// <summary>
    /// The last time an error occurred while fetching chapters from this provider.
    /// </summary>
    public DateTime? LastErrorDate { get; set; }

    /// <summary>
    /// Number of consecutive errors since the last successful fetch.
    /// </summary>
    public int ConsecutiveErrorCount { get; set; }

    /// <summary>
    /// The last time chapters were successfully fetched from this provider.
    /// </summary>
    public DateTime? LastSuccessfulFetchDate { get; set; }

    /// <summary>
    /// The last time the series metadata (status, description, etc.) was refreshed from the extension.
    /// </summary>
    public DateTime? LastSeriesInfoRefreshDate { get; set; }

    /// <summary>
    /// The last known series status reported by the extension, used for change detection.
    /// </summary>
    public SeriesStatus? LastKnownStatus { get; set; }

    /// <summary>
    /// Creates a new user-based (non-Mihon) provider entity.
    /// Used when matching unknown chapters to a user-defined source.
    /// </summary>
    public static SeriesProviderEntity CreateUserBased(string provider, string scanlator, string language, string title = "")
    {
        return new SeriesProviderEntity
        {
            Id = Guid.NewGuid(),
            Provider = provider,
            Scanlator = scanlator ?? string.Empty,
            Language = language,
            Title = title,
            IsUnknown = false,
            IsLocal = true,
            IsStorage = false,
            IsDisabled = false,
            IsUninstalled = false,
            Chapters = new List<Chapter>()
        };
    }
}
