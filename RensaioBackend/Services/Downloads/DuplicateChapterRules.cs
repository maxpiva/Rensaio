namespace RensaioBackend.Services.Downloads;

/// <summary>
/// Rules that keep a series from storing the same chapter twice. Kept free of EF and bridge
/// types so the test project can compile this file on its own.
/// </summary>
public static class DuplicateChapterRules
{
    /// <summary>One chapter file a source of the series stores on disk.</summary>
    public readonly record struct StoredCopy(Guid SourceId, bool IsPermanent, bool IsActive, decimal? Number);

    /// <summary>
    /// True when a source other than <paramref name="selfId"/> already stores chapter
    /// <paramref name="number"/> in a way that makes a download by the current source redundant.
    /// A temporary source defers to a copy from any other source. A permanent source replaces
    /// temporary copies, so it only defers to another active permanent source.
    /// </summary>
    public static bool HasCopyFromOtherSource(Guid selfId, bool selfIsPermanent, IEnumerable<StoredCopy> copies, decimal? number)
    {
        foreach (StoredCopy c in copies)
        {
            if (c.SourceId == selfId || c.Number != number)
                continue;
            if (selfIsPermanent && !(c.IsPermanent && c.IsActive))
                continue;
            return true;
        }
        return false;
    }

    /// <summary>
    /// True when two archive names in the same folder may point at the same file. Case
    /// sensitivity depends on the storage (an SMB share under Linux can ignore case), not the
    /// host OS, so names that differ only by case count as the same file. Deleting the old name
    /// after a case-only rename could otherwise delete the archive that was just written; at
    /// worst, case-sensitive storage keeps one stale file.
    /// </summary>
    public static bool IsSameArchive(string a, string b) =>
        string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
}
