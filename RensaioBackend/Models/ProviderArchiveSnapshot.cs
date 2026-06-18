using System.Text.Json.Serialization;

namespace RensaioBackend.Models;

public class ProviderArchiveSnapshot : ChapterDescriptorBase
{
    [JsonPropertyName("archiveName")]
    public required string ArchiveName { get; set; }

    [JsonPropertyName("creationDate")]
    public DateTime? CreationDate { get; set; }
}
