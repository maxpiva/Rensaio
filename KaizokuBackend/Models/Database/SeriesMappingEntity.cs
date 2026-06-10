using KaizokuBackend.Models.Enums;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizokuBackend.Models.Database;

/// <summary>
/// Stores the global mapping between a local series and its ID on an external scrobbling service.
/// Unlike UserSeriesMappingEntity, this is shared across all users with role-based overwrite protection.
/// </summary>
public class SeriesMappingEntity
{
    [Key]
    public Guid Id { get; set; }

    /// <summary>
    /// The local series ID.
    /// </summary>
    [Required]
    public Guid SeriesId { get; set; }

    /// <summary>
    /// The scrobbling provider (MyAnimeList, AniList, etc.).
    /// </summary>
    [Required]
    public ScrobblerProvider Provider { get; set; }

    /// <summary>
    /// The external series ID on the scrobbling service.
    /// </summary>
    [Required]
    public string ExternalSeriesId { get; set; } = string.Empty;


    /// <summary>
    /// Cached external title from the scrobbler.
    /// </summary>
    public string? ExternalSeriesTitle { get; set; }

    /// <summary>
    /// The user who last created or updated this mapping.
    /// </summary>
    public Guid? UserUid { get; set; }

    /// <summary>
    /// The user-level (role) at the time of update, used for overwrite priority.
    /// Higher-level users can overwrite mappings set by lower-level users.
    /// </summary>
    public UserLevel UserRole { get; set; }

    /// <summary>
    /// Timestamp of when this mapping was last created or updated.
    /// </summary>
    public DateTime UpdateDate { get; set; }

    [ForeignKey(nameof(SeriesId))]
    public SeriesEntity? Series { get; set; }
}