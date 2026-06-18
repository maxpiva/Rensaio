using RensaioBackend.Models.Enums;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RensaioBackend.Models.Database;

/// <summary>
/// Stores per-user scrobbler/tracker configuration (OAuth tokens, sync preferences).
/// </summary>
public class UserScrobblerConfigEntity
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required]
    public ScrobblerProvider Provider { get; set; }

    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? TokenExpiresAt { get; set; }

    public bool IsEnabled { get; set; } = true;
    public bool AutoSync { get; set; } = true;

    public DateTime? LastSyncAt { get; set; }
    public DateTime? LastUploadAt { get; set; }
    public DateTime? LastDownloadAt { get; set; }

    [ForeignKey(nameof(UserId))]
    public UserEntity? User { get; set; }
}