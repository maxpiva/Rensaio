using RensaioBackend.Services.Downloads;
using Xunit;
using Copy = RensaioBackend.Services.Downloads.DuplicateChapterRules.StoredCopy;

namespace RensaioBackend.Tests;

public class DuplicateChapterRulesTests
{
    private static readonly Guid Self = Guid.NewGuid();
    private static readonly Guid Other = Guid.NewGuid();

    [Fact]
    public void PermanentSource_NeverDefersToAnotherSource()
    {
        // Several permanent sources are allowed on purpose (provider swap, multiple scanlators),
        // and a permanent source replaces temporary copies.
        var copies = new[] { new Copy(Other, Number: 60m, Filename: "a.cbz") };
        Assert.False(DuplicateChapterRules.HasCopyFromOtherSource(Self, true, copies, 60m));
    }

    [Fact]
    public void TemporarySource_SkipsChapterAnyOtherSourceStores()
    {
        // The race: a temporary download finishing after another source's must be discarded.
        var copies = new[] { new Copy(Other, Number: 145m, Filename: "a.cbz") };
        Assert.True(DuplicateChapterRules.HasCopyFromOtherSource(Self, false, copies, 145m));
    }

    [Fact]
    public void TemporarySource_IgnoresOwnCopyAndOtherChapterNumbers()
    {
        var copies = new[] { new Copy(Self, Number: 60m, Filename: "a.cbz"), new Copy(Other, Number: 61m, Filename: "b.cbz") };
        Assert.False(DuplicateChapterRules.HasCopyFromOtherSource(Self, false, copies, 60m));
    }

    [Fact]
    public void ArchiveName_StaysUnchangedWhenOnlyThisSourceUsesIt()
    {
        var copies = new[] { new Copy(Self, 60m, "[P][en] Hero 60.cbz"), new Copy(Other, 60m, "[Q][en] Hero 60.cbz") };
        Assert.Equal("[P][en] Hero 60.cbz", DuplicateChapterRules.DistinctArchiveName(Self, copies, "[P][en] Hero 60.cbz"));
    }

    [Fact]
    public void ArchiveName_DiffersWhenAnotherSourceStoresThatName()
    {
        // Scanlators "Group[A]" and "Group(A)" normalize to the same file name.
        const string name = "[P-Group(A)][en] Hero 60.5.cbz";
        var copies = new[] { new Copy(Other, 60.5m, name) };

        string distinct = DuplicateChapterRules.DistinctArchiveName(Self, copies, name);

        Assert.NotEqual(name, distinct);
        Assert.EndsWith(".cbz", distinct);
        Assert.StartsWith("[P-Group(A)][en] Hero 60.5 [", distinct);
        // The next re-download from this source lands on the same file.
        var withOwn = new[] { new Copy(Other, 60.5m, name), new Copy(Self, 60.5m, distinct) };
        Assert.Equal(distinct, DuplicateChapterRules.DistinctArchiveName(Self, withOwn, distinct));
    }

    [Fact]
    public void OldFileIsProtectedOnlyWhenAnotherSourceStillStoresIt()
    {
        var copies = new[] { new Copy(Self, 60m, "mine.cbz"), new Copy(Other, 60m, "Shared.cbz") };
        Assert.True(DuplicateChapterRules.IsFileUsedByOtherSource(Self, copies, "shared.cbz"));
        Assert.False(DuplicateChapterRules.IsFileUsedByOtherSource(Self, copies, "mine.cbz"));
    }

    [Theory]
    [InlineData(true, true, false)]   // another permanent source keeps its copy
    [InlineData(true, false, true)]   // a temporary copy is replaced by the permanent download
    [InlineData(false, true, true)]   // a temporary target must clear the way or its download is discarded
    [InlineData(false, false, true)]
    public void Redownload_ClearsOtherSourcesAsExpected(bool targetPermanent, bool sourcePermanent, bool expected)
    {
        Assert.Equal(expected, DuplicateChapterRules.RedownloadReplacesCopy(Self, targetPermanent, Other, sourcePermanent));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Redownload_AlwaysClearsTheTargetsOwnCopy(bool permanent)
    {
        Assert.True(DuplicateChapterRules.RedownloadReplacesCopy(Self, permanent, Self, permanent));
    }

    [Fact]
    public void CaseOnlyRenameCountsAsTheSameArchive()
    {
        Assert.True(DuplicateChapterRules.IsSameArchive("[X][en] Hero 060.cbz", "[X][en] hero 060.cbz"));
        Assert.True(DuplicateChapterRules.IsSameArchive("[X][en] Hero 060.cbz", "[X][en] Hero 060.cbz"));
        Assert.False(DuplicateChapterRules.IsSameArchive("[X][en] Hero 60.cbz", "[X][en] Hero 060.cbz"));
    }
}
