using Mihon.ExtensionsBridge.Models;
using Mihon.ExtensionsBridge.Models.Abstractions;

namespace Mihon.ExtensionsBridge.Models
{
    public class ExtensionWorkUnit
    {
        public required ITemporaryDirectory WorkingFolder { get; set; }
        public required RepositoryEntry Entry { get; set; }
    }

}
