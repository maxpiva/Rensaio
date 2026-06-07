using System.Text.Json.Serialization;

namespace KaizokuBackend.Models;

public class ProviderArchiveSnapshot : ChapterDescriptorBase
{
    [JsonPropertyName("archiveName")]
    public required string ArchiveName { get; set; }

    [JsonPropertyName("creationDate")]
    public DateTime? CreationDate { get; set; }
}
