using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Enums;
using RensaioBackend.Models.ReadState;

namespace RensaioBackend.Models
{
    public class ImportSeriesSnapshot : ImportSummaryBase
    {
        private readonly ImportSeriesResult _series = new();

        public string Title
        {
            get => _series.Title;
            set => _series.Title = value;
        }

        public SeriesStatus Status
        {
            get => _series.Status;
            set => _series.Status = value;
        }

        public string Artist
        {
            get => _series.Artist;
            set => _series.Artist = value;
        }

        public string Author
        {
            get => _series.Author;
            set => _series.Author = value;
        }

        public string Description
        {
            get => _series.Description;
            set => _series.Description = value;
        }

        public List<string> Genre
        {
            get => _series.Genre;
            set => _series.Genre = value ?? [];
        }

        public string Type
        {
            get => _series.Type;
            set => _series.Type = value;
        }

        public int ChapterCount
        {
            get => _series.ChapterCount;
            set => _series.ChapterCount = value;
        }

        public DateTime? LastUpdatedUTC
        {
            get => _series.LastUpdatedUTC;
            set => _series.LastUpdatedUTC = value;
        }

        public List<ImportProviderSnapshot> Providers
        {
            get => _series.Providers;
            set => _series.Providers = value ?? [];
        }

        public bool IdDisabled
        {
            get => _series.IsDisabled;
            set => _series.IsDisabled = value;
        }

        public int Version
        {
            get => _series.Version;
            set => _series.Version = value;
        }
        [JsonPropertyName("KaizokuVersion")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWriting)]
        public int KaizokuVersion
        {
            get => 0;
            set => Version = value;
        }
        public List<UserReadStateSnapshot>? UserReadStates
        {
            get => _series.UserReadStates;
            set => _series.UserReadStates = value;
        }
        public string Path
        {
            get => NormalizedPath;
            set => NormalizedPath = value;
        }

        [JsonIgnore]
        public ImportSeriesResult Series => _series;

        [JsonIgnore]
        public ArchiveCompare ArchiveCompare { get; set; } = ArchiveCompare.Equal;
        [JsonIgnore]
        public Guid? MatchExisting { get; set; }
    }
}

