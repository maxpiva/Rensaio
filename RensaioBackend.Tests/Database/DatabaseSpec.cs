using Microsoft.EntityFrameworkCore;
using RensaioBackend.Data;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Series;
using Xunit;

namespace RensaioBackend.Tests.Database;

/// <summary>
/// Every test here runs once per provider through the two subclasses at the bottom.
/// Add provider-sensitive behaviour here, never in a provider-specific class.
/// </summary>
public abstract class DatabaseSpec
{
    protected abstract IDbHarness Harness { get; }

    [Fact]
    public async Task Schema_matches_model_after_migrating_from_empty()
    {
        await using var db = await Harness.CreateEmptyAsync();

        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.False(db.Database.HasPendingModelChanges(), "the migration set is behind the model; run add_migration");
        Assert.True(await db.Database.CanConnectAsync());
        Assert.Equal(0, await db.Series.CountAsync());
    }

    [Fact]
    public async Task Values_round_trip()
    {
        await using var db = await Harness.CreateEmptyAsync();
        await Seed.PopulateAsync(db);
        db.ChangeTracker.Clear();

        var user = await db.Users.SingleAsync(u => u.Id == Seed.UserId);
        Assert.Equal("Alice", user.Username);
        Assert.Equal(UserLevel.Manager, user.Level);
        Assert.Equal(Seed.CreatedAt, user.CreatedAt);
        Assert.Equal(new byte[] { 1, 2, 3, 250 }, user.AvatarBlob);
        Assert.True(user.IsActive);

        var series = await db.Series.SingleAsync(s => s.Id == Seed.SeriesId);
        Assert.Equal(["Action", "Adventure"], series.Genre);
        Assert.Equal(SeriesStatus.ONGOING, series.Status);
        Assert.Equal(12.5m, series.StartFromChapter);
        Assert.Equal(Seed.CreatedAt, series.LastChapterDate);

        var mapping = await db.SeriesMappings.SingleAsync(m => m.Id == Seed.MappingId);
        Assert.Equal(["NARUTO -ナルト-", "Naruto"], mapping.AlternativeTitles);
        Assert.Equal(["anilist:30002", "myanimelist:2"], mapping.LinkedSitesIds);
        Assert.Equal(ExternalSeriesProvider.AniList, mapping.Provider);
        Assert.Equal(SeriesMappingStatus.AutoMatched, mapping.MappingStatus);

        var latest = await db.LatestSeries.SingleAsync(l => l.MihonId == "mihon-1");
        Assert.Equal(700.5m, latest.LatestChapter);

        var scrobbler = await db.UserScrobblerConfigs.SingleAsync(c => c.Id == Seed.ScrobblerId);
        Assert.False(scrobbler.IsEnabled);
        Assert.True(scrobbler.AutoSync);
    }

    [Fact]
    public async Task Second_save_of_a_read_back_DateTime_succeeds()
    {
        // SQLite hands back DateTimeKind.Unspecified; Npgsql refuses that for timestamptz
        // unless the model converts it. This is the failure that shows up on the second save.
        await using var db = await Harness.CreateEmptyAsync();
        await Seed.PopulateAsync(db);
        db.ChangeTracker.Clear();

        var user = await db.Users.SingleAsync(u => u.Id == Seed.UserId);
        user.LastLoginAt = user.CreatedAt.AddDays(1);
        user.Username = "Alice2";
        await db.SaveChangesAsync();

        db.ChangeTracker.Clear();
        var again = await db.Users.SingleAsync(u => u.Id == Seed.UserId);
        Assert.Equal(Seed.CreatedAt.AddDays(1), again.LastLoginAt);
    }

    [Fact]
    public async Task Title_search_ignores_case()
    {
        await using var db = await Harness.CreateEmptyAsync();
        await Seed.PopulateAsync(db);

        var hits = await SeriesQueryService.WhereTitleContains(db, db.LatestSeries, "naruto").ToListAsync();
        Assert.Single(hits);

        var misses = await SeriesQueryService.WhereTitleContains(db, db.LatestSeries, "bleach").ToListAsync();
        Assert.Empty(misses);
    }

    [Fact]
    public async Task Bulk_update_translates()
    {
        await using var db = await Harness.CreateEmptyAsync();
        await Seed.PopulateAsync(db);

        int changed = await db.Series
            .Where(s => s.Id == Seed.SeriesId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.PauseDownloads, true));
        Assert.Equal(1, changed);

        db.ChangeTracker.Clear();
        Assert.True((await db.Series.SingleAsync(s => s.Id == Seed.SeriesId)).PauseDownloads);
    }

    [Fact]
    public async Task Deleting_a_series_cascades_to_its_mappings()
    {
        await using var db = await Harness.CreateEmptyAsync();
        await Seed.PopulateAsync(db);
        db.ChangeTracker.Clear();

        var series = await db.Series.SingleAsync(s => s.Id == Seed.SeriesId);
        db.Series.Remove(series);
        await db.SaveChangesAsync();

        Assert.Equal(0, await db.SeriesMappings.CountAsync());
    }
}

public sealed class SqliteDatabaseSpec : DatabaseSpec, IClassFixture<SqliteHarness>
{
    private readonly SqliteHarness _harness;
    public SqliteDatabaseSpec(SqliteHarness harness) => _harness = harness;
    protected override IDbHarness Harness => _harness;
}

[Collection(PostgresCollection.Name)]
public sealed class PostgresDatabaseSpec : DatabaseSpec
{
    private readonly PostgresHarness _harness;
    public PostgresDatabaseSpec(PostgresHarness harness) => _harness = harness;
    protected override IDbHarness Harness => _harness;
}
