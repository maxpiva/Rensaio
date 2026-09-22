using Microsoft.EntityFrameworkCore;
using RensaioBackend.Data;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Enums;

namespace RensaioBackend.Tests.Database;

/// <summary>
/// A small library covering the value shapes that differ between providers: Guid keys,
/// DateTime with and without Kind, decimal, enum, CSV and JSON list columns, bytea, and
/// a bool that is false where the column default is true.
/// </summary>
public static class Seed
{
    public static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid SeriesId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid MappingId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    public static readonly Guid ScrobblerId = Guid.Parse("44444444-4444-4444-4444-444444444444");
    public static readonly Guid ProviderId = Guid.Parse("55555555-5555-5555-5555-555555555555");

    /// <summary>
    /// A chapter list as older versions stored it: no <c>Memo</c> key, which deserializes
    /// to a default <c>JsonElement</c> that cannot be serialized again. The copy must move
    /// this text untouched.
    /// </summary>
    public const string LegacyChaptersJson =
        "[{\"Url\":\"/chapter/1\",\"Name\":\"Chapter 1\",\"DateUpload\":\"2026-01-01T00:00:00+00:00\",\"ChapterNumber\":1,\"Scanlator\":null}]";
    public static readonly DateTime CreatedAt = new(2026, 3, 4, 5, 6, 7, DateTimeKind.Utc);

    public static async Task PopulateAsync(AppDbContext db)
    {
        db.Users.Add(new UserEntity
        {
            Id = UserId,
            Username = "Alice",
            OpdsPath = "feather-flood",
            Level = UserLevel.Manager,
            CreatedAt = CreatedAt,
            AvatarBlob = [1, 2, 3, 250],
            AvatarContentType = "image/png",
        });
        db.Series.Add(new SeriesEntity
        {
            Id = SeriesId,
            Title = "Naruto Shippuden",
            StoragePath = "Naruto Shippuden",
            ThumbnailUrl = "thumb/naruto.png",
            Artist = "Kishimoto",
            Author = "Kishimoto",
            Description = "Ninja",
            Genre = ["Action", "Adventure"],
            Status = SeriesStatus.ONGOING,
            ChapterCount = 700,
            StartFromChapter = 12.5m,
            LastChapterDate = DateTime.SpecifyKind(CreatedAt, DateTimeKind.Unspecified),
        });
        db.SeriesProviders.Add(new SeriesProviderEntity
        {
            Id = ProviderId,
            SeriesId = SeriesId,
            Title = "Naruto Shippuden",
            Provider = "MangaDex",
            Scanlator = "Group",
            Language = "en",
            MihonProviderId = "provider-1",
            MihonId = "mihon-1",
            Genre = ["Action"],
            FetchDate = CreatedAt,
            ChapterCount = 1,
            ContinueAfterChapter = 0.5m,
            IsTitle = true,
            Status = SeriesStatus.ONGOING,
        });
        db.SeriesMappings.Add(new SeriesMappingEntity
        {
            Id = MappingId,
            SeriesId = SeriesId,
            Provider = ExternalSeriesProvider.AniList,
            ExternalSeriesId = "30002",
            AlternativeTitles = ["NARUTO -ナルト-", "Naruto"],
            LinkedSitesIds = ["anilist:30002", "myanimelist:2"],
            UserUid = UserId,
            UserRole = UserLevel.Manager,
            UpdateDate = CreatedAt,
            LinkedDate = CreatedAt,
        });
        db.LatestSeries.Add(new LatestSerieEntity
        {
            MihonId = "mihon-1",
            MihonProviderId = "provider-1",
            Provider = "MangaDex",
            Title = "Naruto Shippuden",
            FetchDate = CreatedAt,
            LatestChapter = 700.5m,
        });
        var scrobbler = new UserScrobblerConfigEntity
        {
            Id = ScrobblerId,
            UserId = UserId,
            Provider = ExternalSeriesProvider.AniList,
            TokenExpiresAt = CreatedAt,
        };
        db.UserScrobblerConfigs.Add(scrobbler);
        await db.SaveChangesAsync();

        // EF omits a property equal to its CLR default on insert when the column has a
        // database default, so "false" has to be written as an update.
        scrobbler.IsEnabled = false;
        await db.SaveChangesAsync();

        // Stored JSON that EF could not write itself (see LegacyChaptersJson).
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE \"SeriesProviders\" SET \"Chapters\" = {0} WHERE \"Id\" = {1}", LegacyChaptersJson, ProviderId);
    }

    public static async Task<string?> ReadChaptersJsonAsync(AppDbContext db)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
            await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT \"Chapters\" FROM \"SeriesProviders\"";
        return (await command.ExecuteScalarAsync()) as string;
    }
}
