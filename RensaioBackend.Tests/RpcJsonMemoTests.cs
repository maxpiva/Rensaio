using System.Text.Json;
using Mihon.ExtensionsBridge.Models.Extensions;
using Rensaio.RPC.Contracts;
using Xunit;

namespace RensaioBackend.Tests;

/// <summary>
/// Regression guard for the "Unable to get Chapters" failure: a <see cref="Manga"/> (or
/// <see cref="Chapter"/>) constructed without a memo carries a default, <c>Undefined</c>
/// <see cref="JsonElement"/>. The stock System.Text.Json converter throws
/// <c>InvalidOperationException: Operation is not valid due to the current state of the object.</c>
/// from <c>JsonElement.WriteTo</c> when it serializes that value, which aborted every catalogue
/// RPC call whose payload contained such a model. <see cref="RpcJson"/> must normalise it to null.
/// </summary>
public sealed class RpcJsonMemoTests
{
    [Fact]
    public void Serialize_MangaWithUndefinedMemo_DoesNotThrowAndWritesNull()
    {
        var manga = new Manga
        {
            Url = "/series/example",
            Title = "The Return of the Crazy Demon",
            // Memo intentionally left unset -> default(JsonElement) with ValueKind.Undefined.
        };

        Assert.Equal(JsonValueKind.Undefined, manga.Memo.ValueKind);

        string json = RpcJson.Serialize(manga);

        using JsonDocument doc = JsonDocument.Parse(json);
        Assert.True(doc.RootElement.TryGetProperty("memo", out JsonElement memo));
        Assert.Equal(JsonValueKind.Null, memo.ValueKind);
        Assert.Equal("/series/example", doc.RootElement.GetProperty("url").GetString());
    }

    [Fact]
    public void Serialize_ChapterWithUndefinedMemo_DoesNotThrowAndWritesNull()
    {
        var chapter = new Chapter { Url = "/series/example/chapter-1", Name = "Chapter 1" };

        string json = RpcJson.Serialize(chapter);

        using JsonDocument doc = JsonDocument.Parse(json);
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("memo").ValueKind);
    }

    [Fact]
    public void Serialize_MangaWithRealMemo_PreservesTheValue()
    {
        using JsonDocument memoDoc = JsonDocument.Parse("""{"key":"value"}""");
        var manga = new Manga { Title = "X", Memo = memoDoc.RootElement.Clone() };

        string json = RpcJson.Serialize(manga);

        using JsonDocument doc = JsonDocument.Parse(json);
        Assert.Equal(JsonValueKind.Object, doc.RootElement.GetProperty("memo").ValueKind);
        Assert.Equal("value", doc.RootElement.GetProperty("memo").GetProperty("key").GetString());
    }

    [Fact]
    public void UndefinedMemo_RoundTripsBackToUndefined()
    {
        var manga = new Manga { Url = "/u", Title = "T" };

        string json = RpcJson.Serialize(manga);
        Manga? roundTripped = RpcJson.Deserialize<Manga>(json);

        Assert.NotNull(roundTripped);
        Assert.Equal(JsonValueKind.Null, roundTripped!.Memo.ValueKind);
        Assert.Equal("/u", roundTripped.Url);
    }
}
