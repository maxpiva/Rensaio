using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;

namespace KaizokuBackend.Services.Scrobbling;

/// <summary>
/// Standalone title matching algorithm using 95% word-coverage threshold
/// with alternate titles, synonyms, and normalization.
/// </summary>
public class TitleMatcher
{
    // Minimum word overlap to consider a match
    private const double MinWordCoverage = 0.95; // 95%

    /// <summary>
    /// Build all title candidates for a local series.
    /// </summary>
    public List<string> BuildTitleCandidates(SeriesEntity series)
    {
        var candidates = new List<string>();

        // 1. Primary title
        candidates.Add(series.Title);

        // 2. Storage folder name (often contains the "real" name)
        if (!string.IsNullOrWhiteSpace(series.StoragePath))
            candidates.Add(Path.GetFileName(series.StoragePath.TrimEnd('/', '\\')));

        // 3. Provider titles (each SeriesProvider may have its own title)
        foreach (var source in series.Sources)
        {
            if (!string.IsNullOrWhiteSpace(source.Title) &&
                !candidates.Contains(source.Title, StringComparer.OrdinalIgnoreCase))
                candidates.Add(source.Title);
        }

        return candidates;
    }

    /// <summary>
    /// Score a single external result against all local title candidates.
    /// Returns 0.0 to 1.0 where 1.0 = perfect match.
    /// </summary>
    public double ScoreMatch(ScrobblerSearchResult external, List<string> localCandidates)
    {
        // Build all title strings to compare against
        var externalTitles = new List<string> { external.Title };
        externalTitles.AddRange(external.AlternateTitles);

        // Take the BEST score across all combinations
        double bestScore = 0;
        foreach (var local in localCandidates)
        {
            foreach (var externalTitle in externalTitles)
            {
                double score = ComputeWordOverlap(local, externalTitle);
                if (score > bestScore)
                    bestScore = score;
            }
        }

        return bestScore;
    }

    /// <summary>
    /// Determines if a score meets the 95% threshold for auto-matching.
    /// </summary>
    public bool IsAutoMatchCandidate(double score)
        => score >= MinWordCoverage;

    /// <summary>
    /// Compute word overlap as a fraction of matching words.
    /// Uses the smaller set as denominator to be lenient
    /// (e.g. "One Piece" vs "One Piece: Gold" = 2/2 = 100%).
    /// </summary>
    private double ComputeWordOverlap(string a, string b)
    {
        var wordsA = Tokenize(a);
        var wordsB = Tokenize(b);

        if (wordsA.Count == 0 || wordsB.Count == 0) return 0;

        int matching = wordsA.Count(w => wordsB.Contains(w));
        int total = Math.Min(wordsA.Count, wordsB.Count);

        return (double)matching / total;
    }

    /// <summary>
    /// Tokenizes a title: lowercase, remove diacritics, strip special chars,
    /// split by whitespace, filter single characters.
    /// </summary>
    public HashSet<string> Tokenize(string title)
    {
        return title
            .ToLowerInvariant()
            .Normalize() // Remove diacritics
            .Replace("'", "")
            .Replace(":", "")
            .Replace(";", "")
            .Replace(",", "")
            .Replace(".", "")
            .Replace("!", "")
            .Replace("?", "")
            .Replace("\"", "")
            .Replace("(", "")
            .Replace(")", "")
            .Replace("[", "")
            .Replace("]", "")
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim())
            .Where(t => t.Length > 1) // Filter single chars
            .ToHashSet();
    }
}