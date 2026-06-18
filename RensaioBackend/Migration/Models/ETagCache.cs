using System.ComponentModel.DataAnnotations;

namespace RensaioBackend.Migration.Models
{
    public class EtagCache
    {
        [Key]
        public string Key { get; set; } = "";

        public string Etag { get; set; } = "";
        public DateTime LastUpdated { get; set; }

    }
}
