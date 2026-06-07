using KaizokuBackend.Models.Enums;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizokuBackend.Models.Database;

/// <summary>
/// Stores the mapping between a local series and its ID on an external scrobbling service.
/// </summary>
public class UserSeriesMappingEntity
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required]
    public Guid SeriesId { get; set; }

    [Required]
    public ScrobblerProvider Provider { get; set; }

    public string ExternalSeriesId { get; set; } = string.Empty;
    public string? ExternalSeriesTitle { get; set; }

    public SeriesMappingStatus MappingStatus { get; set; } = SeriesMappingStatus.Unmatched;

    [ForeignKey(nameof(UserId))]
    public UserEntity? User { get; set; }
}

public enum SeriesMappingStatus
{
    Unmatched = 0,
    AutoMatched = 1,
    UserConfirmed = 2,
    Ignored = 3
}