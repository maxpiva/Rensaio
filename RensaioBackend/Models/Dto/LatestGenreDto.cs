using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Dto
{
    /// <summary>
    /// A distinct tag/genre present in the cached "Latest" cloud catalogue, with the
    /// number of series that carry it. Used to populate the browse-screen tag filter.
    /// </summary>
    public class LatestGenreDto
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("count")]
        public int Count { get; set; }
    }
}
