using KaizokuBackend.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Services.Auth
{
    /// <summary>
    /// Generates a unique two-word hyphenated OPDS path (e.g. "feather-flood") for a user.
    /// Retries on collision against existing OpdsPath values in the database.
    /// </summary>
    public class OpdsPathGenerator
    {
        private readonly AppDbContext _db;
        private readonly ILogger<OpdsPathGenerator> _logger;

        private static readonly string[] Words =
        [
            "amber", "anchor", "angle", "apple", "arrow", "aspen", "atlas", "azure",
            "badge", "baker", "basin", "bench", "birch", "blade", "blaze", "bloom",
            "board", "boreal", "boxer", "brace", "braid", "brake", "brand", "brave",
            "briar", "brick", "bridge", "brine", "brook", "brush", "bugle", "cairn",
            "canoe", "cape", "cargo", "cedar", "chase", "chief", "chord", "cider",
            "cliff", "cloak", "cloud", "clover", "comet", "coral", "crest", "croft",
            "crown", "crush", "curve", "dagger", "delta", "depot", "drift", "dune",
            "eagle", "echo", "ember", "envoy", "equinox", "fable", "falcon", "fawn",
            "feather", "fern", "ferry", "field", "finch", "fjord", "flame", "flare",
            "flint", "flood", "flora", "flume", "foam", "forge", "forte", "forum",
            "frost", "gale", "garnet", "gavel", "glade", "glare", "glen", "glint",
            "globe", "gloom", "glow", "gorge", "grain", "grant", "gravel", "grove",
            "guard", "guild", "gust", "haven", "hawk", "hazel", "heath", "hedge",
            "helm", "herald", "heron", "hinge", "hollow", "holly", "honor", "horizon",
            "hound", "hull", "inlet", "isle", "ivory", "jade", "jasper", "jetty",
            "kayak", "kelp", "knoll", "larch", "latch", "laurel", "ledge", "level",
            "light", "lime", "linden", "locket", "lodge", "loft", "lore", "lotus",
            "lunar", "lynx", "maple", "marble", "marsh", "mast", "meadow", "mesa",
            "mist", "morel", "moss", "motif", "mound", "mount", "mulch", "nave",
            "nebula", "nettle", "niche", "noble", "north", "notch", "nova", "oak",
            "oaken", "opal", "orbit", "otter", "outpost", "oxbow", "paddle", "parch",
            "patrol", "peak", "pebble", "pelican", "pine", "pivot", "plank", "plume",
            "plunge", "ponder", "portal", "prism", "probe", "pulsar", "quartz", "quill",
            "radiant", "rapid", "raven", "reach", "reef", "relay", "ridge", "rift",
            "rivet", "robin", "rock", "rogue", "rosewood", "rowan", "rudder", "rush",
            "sable", "saddle", "sage", "sail", "sand", "sapling", "scout", "seam",
            "sedge", "shade", "shaft", "shale", "shore", "signal", "silver", "slate",
            "sleet", "slope", "snare", "solar", "spar", "spark", "spire", "spoke",
            "spray", "spruce", "spur", "squad", "squall", "stag", "stake", "steed",
            "stern", "stone", "storm", "strand", "stream", "surge", "swift", "tallow",
            "talon", "tangle", "tarn", "terrace", "thorn", "tidal", "tide", "timber",
            "token", "torch", "totem", "tower", "trace", "track", "trail", "traverse",
            "trek", "trident", "tundra", "turret", "vale", "valor", "vault", "vector",
            "veil", "velvet", "venture", "vernal", "vessel", "vigil", "viper", "vista",
            "vortex", "warden", "wave", "wedge", "willow", "wind", "wing", "wolf",
            "yew", "zenith"
        ];

        public OpdsPathGenerator(AppDbContext db, ILogger<OpdsPathGenerator> logger)
        {
            _db = db;
            _logger = logger;
        }

        /// <summary>
        /// Generates a unique two-word hyphenated OPDS path.
        /// Retries up to 50 times before throwing if every attempt collides.
        /// </summary>
        public async Task<string> GenerateUniqueAsync(CancellationToken cancellationToken = default)
        {
            const int maxAttempts = 50;
            var rng = Random.Shared;

            for (int attempt = 0; attempt < maxAttempts; attempt++)
            {
                var word1 = Words[rng.Next(Words.Length)];
                var word2 = Words[rng.Next(Words.Length)];
                var candidate = $"{word1}-{word2}";

                bool exists = await _db.Users
                    .AsNoTracking()
                    .AnyAsync(u => u.OpdsPath == candidate, cancellationToken)
                    .ConfigureAwait(false);

                if (!exists)
                    return candidate;

                _logger.LogDebug("OPDS path collision on attempt {Attempt}: {Candidate}", attempt + 1, candidate);
            }

            throw new InvalidOperationException($"Failed to generate a unique OPDS path after {maxAttempts} attempts.");
        }
    }
}
