namespace RensaioBackend.Services.Downloads;

/// <summary>
/// Rules that keep a series from storing the same chapter twice. Kept free of EF and bridge
/// types so the test project can compile this file on its own.
/// </summary>
public static class DuplicateChapterRules
{
    /// <summary>One chapter file a source of the series stores on disk.</summary>
    public readonly record struct StoredCopy(Guid SourceId, decimal? Number, string Filename);

    /// <summary>
    /// True when a source other than <paramref name="selfId"/> already stores chapter
    /// <paramref name="number"/> in a way that makes a download by the current source redundant.
    /// A temporary source defers to a copy from any other source. A permanent source never
    /// defers: a series may carry several permanent sources on purpose (a provider swap, or
    /// keeping more than one scanlator), and each keeps its own copy.
    /// </summary>
    public static bool HasCopyFromOtherSource(Guid selfId, bool selfIsPermanent, IEnumerable<StoredCopy> copies, decimal? number)
    {
        if (selfIsPermanent)
            return false;
        return copies.Any(c => c.SourceId != selfId && c.Number == number);
    }

    /// <summary>
    /// True when a source other than <paramref name="selfId"/> stores its chapter in
    /// <paramref name="filename"/>, so writing over or deleting that name would destroy its copy.
    /// </summary>
    public static bool IsFileUsedByOtherSource(Guid selfId, IEnumerable<StoredCopy> copies, string filename) =>
        copies.Any(c => c.SourceId != selfId && IsSameArchive(c.Filename, filename));

    /// <summary>
    /// The archive name a source should write. Scanlator labels are normalized for the file name
    /// ("Group[A]" and "Group(A)" both become "Group(A)"), so two sources can compute one name;
    /// the later one gets a tag from its source id, as short as stays unused. The tag is stable,
    /// so re-downloading the chapter overwrites that source's own file.
    /// </summary>
    public static string DistinctArchiveName(Guid selfId, IEnumerable<StoredCopy> copies, string filename)
    {
        string id = selfId.ToString("N");
        string candidate = filename;
        for (int length = 8; length <= id.Length && IsFileUsedByOtherSource(selfId, copies, candidate); length += 8)
            candidate = $"{Path.GetFileNameWithoutExtension(filename)} [{id[..length]}]{Path.GetExtension(filename)}";
        return candidate;
    }

    /// <summary>
    /// True when an explicit re-download from the target source should remove the copy held by
    /// the given source. Re-downloading from a permanent source leaves other permanent sources'
    /// copies alone, because each keeps its own.
    /// </summary>
    public static bool RedownloadReplacesCopy(Guid targetId, bool targetIsPermanent, Guid sourceId, bool sourceIsPermanent) =>
        sourceId == targetId || !(targetIsPermanent && sourceIsPermanent);

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
