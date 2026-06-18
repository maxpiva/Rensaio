using System.Text.Json.Serialization;

namespace RensaioBackend.Models.Dto
{
    public class SeriesInfoDto : BaseSeriesDto
    {
        
        [JsonPropertyName("providers")]
        public List<SmallProviderDto> Providers { get; set; } = [];
    }
}
