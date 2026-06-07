using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace KaizokuBackend.Services.Auth;

/// <summary>
/// Generates unique two-word hyphenated OPDS paths for users.
/// </summary>
public class OpdsPathGenerator
{
    private static readonly string[] Words =
    [
        "autumn", "breeze", "crystal", "dawn", "ember", "feather", "glacier", "hollow",
        "ivory", "jade", "kindle", "lunar", "mist", "nebula", "ocean", "pearl",
        "quartz", "raven", "silver", "thunder", "umbrella", "velvet", "willow", "xenon",
        "yonder", "zenith", "amber", "bloom", "coral", "dusk", "echo", "frost",
        "garden", "harbor", "island", "jewel", "kelp", "lilac", "maple", "night",
        "olive", "pine", "rain", "snow", "tide", "unity", "vale", "wave",
        "alpaca", "birch", "cedar", "delta", "elm", "fjord", "grove", "heath",
        "iris", "juniper", "koi", "lark", "moss", "nova", "orchid", "plum",
        "ridge", "sage", "thorn", "uluru", "vine", "wren", "yarrow", "zebra",
        "acacia", "basil", "cypress", "dahlia", "elder", "fern", "ginger", "hemlock",
        "indigo", "jasmine", "knot", "laurel", "myrtle", "nettle", "oleander", "poppy",
        "radish", "saffron", "thyme", "umbel", "verbena", "wisteria", "yucca", "zinnia",
        "adobe", "brick", "clay", "dome", "flint", "granite", "ivy", "joint",
        "keystone", "lime", "marble", "nickel", "oak", "pumice", "resin", "slate",
        "topaz", "umber", "violet", "wheat", "abyss", "basin", "cave", "dune",
        "edge", "fault", "geode", "hill", "ink", "lagoon", "marsh", "peak",
        "reef", "spring", "terra", "undergrowth", "volcano", "water", "arch", "bay",
        "cove", "deep", "estuary", "flood", "gorge", "harbour", "inlet", "jetty",
        "key", "lock", "moor", "pier", "quay", "reach", "shore", "strait",
        "tributary", "upstream", "valley", "wharf", "anchorage", "banks", "channel", "dock",
        "ford", "gulf", "haven", "isle", "ledge", "mouth", "narrows", "port",
        "rivulet", "shallows", "spit", "swamp", "torrent", "basalt", "coal", "drift",
        "fossil", "gem", "iron", "lava", "mica", "obsidian", "pyrite", "ruby",
        "sapphire", "tuff", "zinc", "boulder", "crater", "faultline", "granitepeak", "highland",
        "lowland", "mantle", "plateau", "summit", "tundra", "aster", "bell", "cosmos",
        "daisy", "eden", "fuchsia", "gladiola", "hibiscus", "impatiens", "jonquil", "lantern",
        "marigold", "narcissus", "phlox", "rose", "snapdragon", "tulip", "witchhazel", "chime",
        "drum", "flute", "gong", "harp", "lyre", "melody", "note", "piano",
        "rhythm", "song", "tune", "vocal", "whistle", "zen", "alto", "bass",
        "chord", "echoes", "fret", "harmony", "keynote", "lyric", "octave", "refrain",
        "scale", "tempo", "verse", "aria", "ballad", "chorus", "duet", "finale",
        "hymn", "interlude", "minuet", "opera", "prelude", "reprise", "serenade", "sonata",
        "treble", "adagio", "crescendo", "forte", "legato", "staccato", "vibrato", "allegro"
    ];

    private readonly IServiceProvider _serviceProvider;

    public OpdsPathGenerator(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    /// <summary>
    /// Generates a unique two-word hyphenated OPDS path.
    /// Ensures uniqueness against existing OpdsPath values in the database.
    /// </summary>
    public async Task<string> GenerateUniquePathAsync()
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Data.AppDbContext>();

        int maxAttempts = 100;
        for (int attempt = 0; attempt < maxAttempts; attempt++)
        {
            string word1 = Words[RandomNumberGenerator.GetInt32(Words.Length)];
            string word2 = Words[RandomNumberGenerator.GetInt32(Words.Length)];

            // Avoid duplicate words
            if (word1 == word2)
                continue;

            string path = $"{word1}-{word2}";

            // Check uniqueness
            bool exists = await db.Users.AnyAsync(u => u.OpdsPath == path);
            if (!exists)
                return path;
        }

        // Fallback: extremely unlikely, but handle it
        string fallback = $"user-{Guid.NewGuid():N}"[..20];
        return fallback;
    }
}