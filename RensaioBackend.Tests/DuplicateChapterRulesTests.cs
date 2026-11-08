using RensaioBackend.Services.Downloads;
using Xunit;
using Copy = RensaioBackend.Services.Downloads.DuplicateChapterRules.StoredCopy;

namespace RensaioBackend.Tests;

public class DuplicateChapterRulesTests
{
    private static readonly Guid Self = Guid.NewGuid();
    private static readonly Guid Other = Guid.NewGuid();

    [Fact]
    public void PermanentSource_SkipsChapterAnotherPermanentSourceStores()
    {
        // The reported bug: two permanent sources on one series each downloaded every chapter.
        var copies = new[] { new Copy(Other, IsPermanent: true, IsActive: true, Number: 60m) };
        Assert.True(DuplicateChapterRules.HasCopyFromOtherSource(Self, true, copies, 60m));
    }

    [Fact]
    public void PermanentSource_StillReplacesTemporaryCopy()
    {
        var copies = new[] { new Copy(Other, IsPermanent: false, IsActive: true, Number: 60m) };
        Assert.False(DuplicateChapterRules.HasCopyFromOtherSource(Self, true, copies, 60m));
    }

    [Fact]
    public void PermanentSource_IgnoresDisabledPermanentSource()
    {
        var copies = new[] { new Copy(Other, IsPermanent: true, IsActive: false, Number: 60m) };
        Assert.False(DuplicateChapterRules.HasCopyFromOtherSource(Self, true, copies, 60m));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void TemporarySource_SkipsChapterAnyOtherSourceStores(bool otherIsPermanent)
    {
        // The race: a temporary download finishing after the permanent one must be discarded.
        var copies = new[] { new Copy(Other, otherIsPermanent, IsActive: true, Number: 145m) };
        Assert.True(DuplicateChapterRules.HasCopyFromOtherSource(Self, false, copies, 145m));
    }

    [Fact]
    public void OwnCopyAndOtherChapterNumbers_DoNotCount()
    {
        var copies = new[]
        {
            new Copy(Self, IsPermanent: true, IsActive: true, Number: 60m),
            new Copy(Other, IsPermanent: true, IsActive: true, Number: 61m),
        };
        Assert.False(DuplicateChapterRules.HasCopyFromOtherSource(Self, true, copies, 60m));
        Assert.False(DuplicateChapterRules.HasCopyFromOtherSource(Self, false, copies, 60m));
    }
}
