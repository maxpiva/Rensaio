using Microsoft.EntityFrameworkCore;
using RensaioBackend.Data;
using Xunit;

namespace RensaioBackend.Tests.Database;

[Collection(PostgresCollection.Name)]
public sealed class DatabaseCopyTests : IClassFixture<SqliteHarness>
{
    private readonly SqliteHarness _sqlite;
    private readonly PostgresHarness _postgres;

    public DatabaseCopyTests(SqliteHarness sqlite, PostgresHarness postgres)
    {
        _sqlite = sqlite;
        _postgres = postgres;
    }

    [Fact]
    public void Tables_are_ordered_parents_first()
    {
        using var db = SqliteHarness.Open(Path.Combine(Path.GetTempPath(), "rensaio-order-probe.db"));
        var order = DatabaseCopy.TablesInDependencyOrder(db.Model).Select(t => t.GetTableName()).ToList();

        Assert.True(order.IndexOf("Series") < order.IndexOf("SeriesProviders"));
        Assert.True(order.IndexOf("Series") < order.IndexOf("SeriesMappings"));
        Assert.True(order.IndexOf("Users") < order.IndexOf("UserScrobblerConfigs"));
        Assert.True(order.IndexOf("Users") < order.IndexOf("UserExternalLogins"));
        Assert.Equal(db.Model.GetEntityTypes().Count(), order.Count);
    }

    [Fact]
    public async Task Sqlite_to_postgres_preserves_every_value()
    {
        await using var source = await _sqlite.CreateEmptyAsync();
        await Seed.PopulateAsync(source);
        source.ChangeTracker.Clear();

        await using var target = await _postgres.CreateEmptyAsync();
        Assert.True(await DatabaseCopy.IsEmptyAsync(target));

        var results = await DatabaseCopy.CopyAsync(source, target);
        Assert.All(results, r => Assert.True(r.Matches, $"{r.Table}: {r.SourceRows} vs {r.TargetRows}"));
        Assert.Equal(1, results.Single(r => r.Table == "Series").TargetRows);
        Assert.False(await DatabaseCopy.IsEmptyAsync(target));

        var scrobbler = await target.UserScrobblerConfigs.SingleAsync(c => c.Id == Seed.ScrobblerId);
        Assert.False(scrobbler.IsEnabled);
        Assert.Equal(Seed.CreatedAt, scrobbler.TokenExpiresAt);
        Assert.Equal(DateTimeKind.Utc, scrobbler.TokenExpiresAt!.Value.Kind);

        var mapping = await target.SeriesMappings.SingleAsync(m => m.Id == Seed.MappingId);
        Assert.Equal(["NARUTO -ナルト-", "Naruto"], mapping.AlternativeTitles);
        Assert.Equal(Seed.SeriesId, mapping.SeriesId);

        var series = await target.Series.SingleAsync(s => s.Id == Seed.SeriesId);
        Assert.Equal(["Action", "Adventure"], series.Genre);
        Assert.Equal(12.5m, series.StartFromChapter);

        var user = await target.Users.SingleAsync(u => u.Id == Seed.UserId);
        Assert.Equal(new byte[] { 1, 2, 3, 250 }, user.AvatarBlob);

        // JSON moved as text, never re-serialized.
        Assert.Equal(Seed.LegacyChaptersJson, await Seed.ReadChaptersJsonAsync(target));
        var provider = await target.SeriesProviders.SingleAsync(p => p.Id == Seed.ProviderId);
        Assert.Equal(0.5m, provider.ContinueAfterChapter);
        Assert.True(provider.IsTitle);
        Assert.False(provider.IsNSFW);
    }

    [Fact]
    public async Task Postgres_to_sqlite_round_trips()
    {
        await using var source = await _postgres.CreateEmptyAsync();
        await Seed.PopulateAsync(source);
        source.ChangeTracker.Clear();

        await using var target = await _sqlite.CreateEmptyAsync();
        var results = await DatabaseCopy.CopyAsync(source, target);
        Assert.All(results, r => Assert.True(r.Matches, $"{r.Table}: {r.SourceRows} vs {r.TargetRows}"));

        var scrobbler = await target.UserScrobblerConfigs.SingleAsync(c => c.Id == Seed.ScrobblerId);
        Assert.False(scrobbler.IsEnabled);
        var series = await target.Series.SingleAsync(s => s.Id == Seed.SeriesId);
        Assert.Equal("Naruto Shippuden", series.Title);
        Assert.Equal(Seed.CreatedAt, series.LastChapterDate);
        Assert.Equal(Seed.LegacyChaptersJson, await Seed.ReadChaptersJsonAsync(target));
    }

    [Fact]
    public async Task Copy_refuses_a_non_empty_target()
    {
        await using var target = await _postgres.CreateEmptyAsync();
        await Seed.PopulateAsync(target);
        Assert.False(await DatabaseCopy.IsEmptyAsync(target));
    }
}
