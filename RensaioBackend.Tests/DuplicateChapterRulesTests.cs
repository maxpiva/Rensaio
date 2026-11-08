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
        var copies = new[] { new Copy(Other, Number: 60m) };
        Assert.False(DuplicateChapterRules.HasCopyFromOtherSource(Self, true, copies, 60m));
    }

    [Fact]
    public void TemporarySource_SkipsChapterAnyOtherSourceStores()
    {
        // The race: a temporary download finishing after another source's must be discarded.
        var copies = new[] { new Copy(Other, Number: 145m) };
        Assert.True(DuplicateChapterRules.HasCopyFromOtherSource(Self, false, copies, 145m));
    }

    [Fact]
    public void TemporarySource_IgnoresOwnCopyAndOtherChapterNumbers()
    {
        var copies = new[] { new Copy(Self, Number: 60m), new Copy(Other, Number: 61m) };
        Assert.False(DuplicateChapterRules.HasCopyFromOtherSource(Self, false, copies, 60m));
    }

    [Fact]
    public void CaseOnlyRenameCountsAsTheSameArchive()
    {
        Assert.True(DuplicateChapterRules.IsSameArchive("[X][en] Hero 060.cbz", "[X][en] hero 060.cbz"));
        Assert.True(DuplicateChapterRules.IsSameArchive("[X][en] Hero 060.cbz", "[X][en] Hero 060.cbz"));
        Assert.False(DuplicateChapterRules.IsSameArchive("[X][en] Hero 60.cbz", "[X][en] Hero 060.cbz"));
    }
}
