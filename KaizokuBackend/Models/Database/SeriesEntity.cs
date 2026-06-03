using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using KaizokuBackend.Extensions;
using KaizokuBackend.Models.Enums;

namespace KaizokuBackend.Models.Database
{
    public class SeriesEntity
    {
        private string _storagePath = string.Empty;
        private int _chapterCount;
        [JsonPropertyName("id")]
        [Key]
        public Guid Id { get; set; }
        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;
        [JsonPropertyName("thumbnailUrl")]
        public string ThumbnailUrl { get; set; } = string.Empty;
        [JsonPropertyName("artist")]
        public string Artist { get; set; } = string.Empty;

        [JsonPropertyName("author")]
        public string Author { get; set; } = string.Empty;
        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;
        [JsonPropertyName("genre")]
        public List<string> Genre { get; set; } = new List<string>();
        [JsonPropertyName("status")]
        public SeriesStatus Status { get; set; } = SeriesStatus.UNKNOWN;

        [JsonPropertyName("storagePath")]
        public string StoragePath
        {
            get => _storagePath;
            set => _storagePath = SeriesModelExtensions.NormalizeStoragePath(value);
        }
        [JsonPropertyName("type")]
        public string? Type { get; set; }
        [JsonPropertyName("chapterCount")]
        public int ChapterCount
        {
            get => _chapterCount;
            set => _chapterCount = SeriesModelExtensions.ClampChapterCount(value);
        }
        [JsonPropertyName("pauseDownloads")]
        public bool PauseDownloads { get; set; } = false;

        [JsonPropertyName("startFromChapter")]
        public decimal? StartFromChapter { get; set; }

        [JsonPropertyName("lastChapterDate")]
        public DateTime? LastChapterDate { get; set; }

        /// <summary>
        /// Computed release cadence in days. Null = not yet determined.
        /// Mapped values: 7 (1 week), 15 (half month), 30 (1 month).
        /// Recalculated after each download or chapter fetch.
        /// </summary>
        [JsonPropertyName("releaseCadenceDays")]
        public int? ReleaseCadenceDays { get; set; }

        public virtual ICollection<SeriesProviderEntity> Sources { get; set; } = [];
    }
}
