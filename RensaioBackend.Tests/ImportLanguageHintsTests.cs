using RensaioBackend.Services.Import;
using Xunit;

namespace RensaioBackend.Tests;

public class ImportLanguageHintsTests
{
    [Theory]
    [InlineData("隣のステラ", new[] { "en", "ja" })]            // kana present -> Japanese only
    [InlineData("気になってる人が男じゃなかった", new[] { "en", "ja" })]
    [InlineData("スタジオカバナ", new[] { "en", "ja" })]
    [InlineData("花野井くんと恋の病", new[] { "en", "ja" })]
    [InlineData("鬼滅", new[] { "en", "ja", "zh" })]             // Han only -> ambiguous
    [InlineData("나 혼자만 레벨업", new[] { "en", "ko" })]
    [InlineData("Medalist", new[] { "en" })]
    [InlineData("Gazing at the Star Next Door (2022)", new[] { "en" })]
    [InlineData("", new[] { "en" })]
    public void AddsLanguagesFromScript(string title, string[] expected)
    {
        Assert.Equal(expected, ImportLanguageHints.WithScriptLanguages(new[] { "en" }, title));
    }

    [Fact]
    public void NullTitleKeepsInput()
    {
        Assert.Equal(new[] { "en" }, ImportLanguageHints.WithScriptLanguages(new[] { "en" }, null));
    }

    [Fact]
    public void NeverRemovesOrDuplicates()
    {
        Assert.Equal(new[] { "JA", "en" }, ImportLanguageHints.WithScriptLanguages(new[] { "JA", "en" }, "隣のステラ"));
    }
}

public class LanguagesForSearchTests
{
    private static readonly (string, string)[] Unknown = { ("Unknown", "en") };

    [Fact]
    public void GuessedLanguageWithJapaneseTitleAddsJa() =>
        Assert.Equal(new[] { "en", "ja" }, ImportLanguageHints.LanguagesForSearch(Unknown, "隣のステラ"));

    [Fact]
    public void GuessedLanguageWithEnglishTitleStaysEnglish() =>
        Assert.Equal(new[] { "en" }, ImportLanguageHints.LanguagesForSearch(Unknown, "Medalist"));

    [Fact]
    public void NoProvidersWithJapaneseTitleAddsJa() =>
        Assert.Equal(new[] { "en", "ja" }, ImportLanguageHints.LanguagesForSearch(Array.Empty<(string, string)>(), "隣のステラ"));

    [Fact]
    public void ExplicitEnglishProviderWithJapaneseTitleIsNotWidened() =>
        Assert.Equal(new[] { "en" }, ImportLanguageHints.LanguagesForSearch(new[] { ("SoraRaw", "en") }, "隣のステラ"));

    [Fact]
    public void ExplicitJapaneseProviderIsUnchanged() =>
        Assert.Equal(new[] { "ja" }, ImportLanguageHints.LanguagesForSearch(new[] { ("SoraRaw", "ja") }, "隣のステラ"));

    [Fact]
    public void MixedFolderIsNotWidened() =>
        Assert.Equal(new[] { "en" }, ImportLanguageHints.LanguagesForSearch(new[] { ("SoraRaw", "en"), ("Unknown", "en") }, "隣のステラ"));

    [Fact]
    public void EmptyProviderNameCountsAsGuessed() =>
        Assert.Equal(new[] { "en", "ja" }, ImportLanguageHints.LanguagesForSearch(new[] { ("", "en") }, "隣のステラ"));
}
