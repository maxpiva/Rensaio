using System.Text.Json.Serialization;

namespace KaizokuBackend.Models.Dto.Auth
{
    public class UserPreferencesDto
    {
        [JsonPropertyName("theme")]
        public string Theme { get; set; } = "dark";

        [JsonPropertyName("defaultLanguage")]
        public string DefaultLanguage { get; set; } = "en";

        [JsonPropertyName("cardSize")]
        public string CardSize { get; set; } = "medium";

        [JsonPropertyName("nsfwVisibility")]
        [JsonConverter(typeof(JsonStringEnumConverter))]
        public NsfwVisibility NsfwVisibility { get; set; } = NsfwVisibility.HideByDefault;
    }

    /// <summary>
    /// Partial update: only the properties present in the request body are applied;
    /// omitted properties keep their stored values.
    /// </summary>
    public class UpdatePreferencesDto
    {
        [JsonPropertyName("theme")]
        public string? Theme { get; set; }

        [JsonPropertyName("defaultLanguage")]
        public string? DefaultLanguage { get; set; }

        [JsonPropertyName("cardSize")]
        public string? CardSize { get; set; }

        [JsonPropertyName("nsfwVisibility")]
        [JsonConverter(typeof(JsonStringEnumConverter))]
        public NsfwVisibility? NsfwVisibility { get; set; }
    }
}
