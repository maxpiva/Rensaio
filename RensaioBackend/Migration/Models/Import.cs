using RensaioBackend.Extensions;
using RensaioBackend.Models.Enums;
using System.ComponentModel.DataAnnotations;

namespace RensaioBackend.Migration.Models
{
    public class Import
    {
        private string _path = string.Empty;


        [Key]
        public required string Path
        {
            get => _path.SanitizeDirectory();
            set => _path = value;
        }
        public required string Title { get; set; }
        public ImportStatus Status { get; set; } = ImportStatus.Import;
        public RensaioBackend.Models.Action Action { get; set; } = RensaioBackend.Models.Action.Add;
        public required RensaioBackend.Models.ImportSeriesSnapshot Info { get; set; }
        public List<ProviderSeriesDetails>? Series { get; set; }

        public decimal? ContinueAfterChapter { get; set; } = null;


    }
}
