using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RensaioBackend.Migrations.Rensaio.Postgres
{
    /// <inheritdoc />
    public partial class InitialCreate : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ETagCache",
                columns: table => new
                {
                    Key = table.Column<string>(type: "text", nullable: false),
                    Url = table.Column<string>(type: "text", nullable: false),
                    ExternalEtag = table.Column<string>(type: "text", nullable: false),
                    Etag = table.Column<string>(type: "text", nullable: false),
                    ContentType = table.Column<string>(type: "text", nullable: false),
                    Extension = table.Column<string>(type: "text", nullable: false),
                    MihonProviderId = table.Column<string>(type: "text", nullable: true),
                    NextUpdateUTC = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ETagCache", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "HealthStatuses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetType = table.Column<int>(type: "integer", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    Message = table.Column<string>(type: "text", nullable: false),
                    AffectedSeriesJson = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HealthStatuses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Imports",
                columns: table => new
                {
                    Path = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Action = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Info = table.Column<string>(type: "text", nullable: false),
                    Series = table.Column<string>(type: "text", nullable: true),
                    ContinueAfterChapter = table.Column<decimal>(type: "numeric", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Imports", x => x.Path);
                });

            migrationBuilder.CreateTable(
                name: "Jobs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    JobType = table.Column<int>(type: "integer", nullable: false),
                    JobParameters = table.Column<string>(type: "text", nullable: false),
                    Key = table.Column<string>(type: "text", nullable: false),
                    GroupKey = table.Column<string>(type: "text", nullable: false),
                    TimeBetweenJobs = table.Column<TimeSpan>(type: "interval", nullable: false),
                    MinutePlace = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    Priority = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    PreviousExecution = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    NextExecution = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Jobs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LatestSeries",
                columns: table => new
                {
                    MihonId = table.Column<string>(type: "text", nullable: false),
                    MihonProviderId = table.Column<string>(type: "text", nullable: true),
                    BridgeItemInfo = table.Column<string>(type: "text", nullable: true),
                    Provider = table.Column<string>(type: "text", nullable: false),
                    Language = table.Column<string>(type: "text", nullable: false),
                    Url = table.Column<string>(type: "text", nullable: true),
                    Title = table.Column<string>(type: "text", nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "text", nullable: true),
                    Artist = table.Column<string>(type: "text", nullable: true),
                    Author = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Genre = table.Column<string>(type: "text", nullable: false),
                    FetchDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ChapterCount = table.Column<long>(type: "bigint", nullable: true),
                    LatestChapter = table.Column<decimal>(type: "numeric", nullable: true),
                    LatestChapterTitle = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    InLibrary = table.Column<int>(type: "integer", nullable: false),
                    SeriesId = table.Column<Guid>(type: "uuid", nullable: true),
                    Chapters = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LatestSeries", x => x.MihonId);
                });

            migrationBuilder.CreateTable(
                name: "Providers",
                columns: table => new
                {
                    MihonProviderId = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Provider = table.Column<string>(type: "text", nullable: false),
                    Scanlator = table.Column<string>(type: "text", nullable: false),
                    Language = table.Column<string>(type: "text", nullable: false),
                    SourceRepositoryName = table.Column<string>(type: "text", nullable: true),
                    SourceRepositoryId = table.Column<string>(type: "text", nullable: true),
                    SourcePackageName = table.Column<string>(type: "text", nullable: true),
                    SourceSourceId = table.Column<string>(type: "text", nullable: true),
                    ThumbnailUrl = table.Column<string>(type: "text", nullable: true),
                    IsNSFW = table.Column<bool>(type: "boolean", nullable: false),
                    SupportLatest = table.Column<bool>(type: "boolean", nullable: false),
                    IsStorage = table.Column<bool>(type: "boolean", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    IsBroken = table.Column<bool>(type: "boolean", nullable: false),
                    IsDead = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Url = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Providers", x => x.MihonProviderId);
                });

            migrationBuilder.CreateTable(
                name: "Queues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Queue = table.Column<string>(type: "text", nullable: false),
                    JobType = table.Column<int>(type: "integer", nullable: false),
                    JobParameters = table.Column<string>(type: "text", nullable: true),
                    Key = table.Column<string>(type: "text", nullable: false),
                    GroupKey = table.Column<string>(type: "text", nullable: false),
                    ExtraKey = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Priority = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    EnqueuedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ScheduledDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FinishedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RetryCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Queues", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Series",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "text", nullable: false),
                    Artist = table.Column<string>(type: "text", nullable: false),
                    Author = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Genre = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    StoragePath = table.Column<string>(type: "text", nullable: true),
                    Type = table.Column<string>(type: "text", nullable: true),
                    ChapterCount = table.Column<int>(type: "integer", nullable: false),
                    PauseDownloads = table.Column<bool>(type: "boolean", nullable: false),
                    StartFromChapter = table.Column<decimal>(type: "numeric", nullable: true),
                    LastChapterDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReleaseCadenceDays = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Series", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Settings",
                columns: table => new
                {
                    Name = table.Column<string>(type: "text", nullable: false),
                    Value = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Settings", x => x.Name);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Username = table.Column<string>(type: "text", nullable: false),
                    AvatarBlob = table.Column<byte[]>(type: "bytea", nullable: true),
                    AvatarContentType = table.Column<string>(type: "text", nullable: true),
                    PasswordHash = table.Column<string>(type: "text", nullable: true),
                    Salt = table.Column<string>(type: "text", nullable: true),
                    PasswordSetToken = table.Column<string>(type: "text", nullable: true),
                    RefreshTokenHash = table.Column<string>(type: "text", nullable: true),
                    RefreshTokenExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    OpdsPath = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SeriesMappings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SeriesId = table.Column<Guid>(type: "uuid", nullable: true),
                    Provider = table.Column<int>(type: "integer", nullable: false),
                    ExternalSeriesId = table.Column<string>(type: "text", nullable: false),
                    ExternalSeriesTitle = table.Column<string>(type: "text", nullable: true),
                    SeriesCoverUrl = table.Column<string>(type: "text", nullable: true),
                    MetaData = table.Column<string>(type: "text", nullable: true),
                    LinkedSitesIds = table.Column<string>(type: "text", nullable: false),
                    AlternativeTitles = table.Column<string>(type: "text", nullable: false),
                    UserUid = table.Column<Guid>(type: "uuid", nullable: true),
                    UserRole = table.Column<int>(type: "integer", nullable: false),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    MappingStatus = table.Column<int>(type: "integer", nullable: false),
                    LinkedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeriesMappings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SeriesMappings_Series_SeriesId",
                        column: x => x.SeriesId,
                        principalTable: "Series",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SeriesProviders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SeriesId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    MihonProviderId = table.Column<string>(type: "text", nullable: true),
                    MihonId = table.Column<string>(type: "text", nullable: true),
                    BridgeItemInfo = table.Column<string>(type: "text", nullable: true),
                    Artist = table.Column<string>(type: "text", nullable: true),
                    Author = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Genre = table.Column<string>(type: "text", nullable: false),
                    FetchDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ChapterCount = table.Column<long>(type: "bigint", nullable: true),
                    ContinueAfterChapter = table.Column<decimal>(type: "numeric", nullable: true),
                    IsTitle = table.Column<bool>(type: "boolean", nullable: false),
                    IsCover = table.Column<bool>(type: "boolean", nullable: false),
                    IsUnknown = table.Column<bool>(type: "boolean", nullable: false),
                    IsNSFW = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsLocal = table.Column<bool>(type: "boolean", nullable: false),
                    IsDisabled = table.Column<bool>(type: "boolean", nullable: false),
                    IsUninstalled = table.Column<bool>(type: "boolean", nullable: false),
                    Chapters = table.Column<string>(type: "text", nullable: false),
                    LastErrorDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConsecutiveErrorCount = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    LastSuccessfulFetchDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastSeriesInfoRefreshDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastKnownStatus = table.Column<int>(type: "integer", nullable: true),
                    Provider = table.Column<string>(type: "text", nullable: false),
                    Scanlator = table.Column<string>(type: "text", nullable: false),
                    Language = table.Column<string>(type: "text", nullable: false),
                    IsStorage = table.Column<bool>(type: "boolean", nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Url = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeriesProviders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SeriesProviders_Series_SeriesId",
                        column: x => x.SeriesId,
                        principalTable: "Series",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserExternalLogins",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "text", nullable: false),
                    Subject = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserExternalLogins", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserExternalLogins_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserScrobblerConfigs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<int>(type: "integer", nullable: false),
                    AccessToken = table.Column<string>(type: "text", nullable: true),
                    RefreshToken = table.Column<string>(type: "text", nullable: true),
                    TokenExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    AutoSync = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    LastSyncAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastUploadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastDownloadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserScrobblerConfigs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserScrobblerConfigs_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ETagCache_NextUpdateUTC",
                table: "ETagCache",
                column: "NextUpdateUTC");

            migrationBuilder.CreateIndex(
                name: "IX_ETagCache_Url",
                table: "ETagCache",
                column: "Url");

            migrationBuilder.CreateIndex(
                name: "IX_HealthStatus_IsActive",
                table: "HealthStatuses",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_HealthStatus_Level",
                table: "HealthStatuses",
                column: "Level");

            migrationBuilder.CreateIndex(
                name: "IX_HealthStatus_Target",
                table: "HealthStatuses",
                columns: new[] { "TargetType", "TargetId" });

            migrationBuilder.CreateIndex(
                name: "IX_Import_Status_Action",
                table: "Imports",
                columns: new[] { "Status", "Action" });

            migrationBuilder.CreateIndex(
                name: "IX_Job_IsEnabled",
                table: "Jobs",
                column: "IsEnabled");

            migrationBuilder.CreateIndex(
                name: "IX_Job_JobType_GroupKey",
                table: "Jobs",
                columns: new[] { "JobType", "GroupKey" });

            migrationBuilder.CreateIndex(
                name: "IX_Job_JobType_Key",
                table: "Jobs",
                columns: new[] { "JobType", "Key" });

            migrationBuilder.CreateIndex(
                name: "IX_Jobs_Key",
                table: "Jobs",
                column: "Key");

            migrationBuilder.CreateIndex(
                name: "IX_Jobs_NextExecution",
                table: "Jobs",
                column: "NextExecution");

            migrationBuilder.CreateIndex(
                name: "IX_LatestSerie_FetchDate",
                table: "LatestSeries",
                column: "FetchDate");

            migrationBuilder.CreateIndex(
                name: "IX_LatestSerie_MihonProviderId",
                table: "LatestSeries",
                column: "MihonProviderId");

            migrationBuilder.CreateIndex(
                name: "IX_LatestSerie_Provider",
                table: "LatestSeries",
                column: "Provider");

            migrationBuilder.CreateIndex(
                name: "IX_LatestSerie_Title",
                table: "LatestSeries",
                column: "Title");

            migrationBuilder.CreateIndex(
                name: "IX_Providers_Name",
                table: "Providers",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Enqueue_FinishedDate",
                table: "Queues",
                column: "FinishedDate");

            migrationBuilder.CreateIndex(
                name: "IX_Enqueue_GroupKey",
                table: "Queues",
                column: "GroupKey");

            migrationBuilder.CreateIndex(
                name: "IX_Enqueue_JobType_ExtraKey",
                table: "Queues",
                columns: new[] { "JobType", "ExtraKey" });

            migrationBuilder.CreateIndex(
                name: "IX_Enqueue_JobType_Status",
                table: "Queues",
                columns: new[] { "JobType", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Queues_Key",
                table: "Queues",
                column: "Key");

            migrationBuilder.CreateIndex(
                name: "IX_Queues_Queue",
                table: "Queues",
                column: "Queue");

            migrationBuilder.CreateIndex(
                name: "IX_Queues_ScheduledDate",
                table: "Queues",
                column: "ScheduledDate");

            migrationBuilder.CreateIndex(
                name: "IX_Queues_Status",
                table: "Queues",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SeriesMapping_Provider_ExternalSeriesId",
                table: "SeriesMappings",
                columns: new[] { "Provider", "ExternalSeriesId" });

            migrationBuilder.CreateIndex(
                name: "IX_SeriesMapping_SeriesId_Provider",
                table: "SeriesMappings",
                columns: new[] { "SeriesId", "Provider" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SeriesProvider_MihonId",
                table: "SeriesProviders",
                column: "MihonId");

            migrationBuilder.CreateIndex(
                name: "IX_SeriesProvider_MihonProviderId",
                table: "SeriesProviders",
                column: "MihonProviderId");

            migrationBuilder.CreateIndex(
                name: "IX_SeriesProvider_Provider_Language_Scanlator",
                table: "SeriesProviders",
                columns: new[] { "Provider", "Language", "Scanlator" });

            migrationBuilder.CreateIndex(
                name: "IX_SeriesProvider_SeriesId",
                table: "SeriesProviders",
                column: "SeriesId");

            migrationBuilder.CreateIndex(
                name: "IX_SeriesProvider_Title_Language",
                table: "SeriesProviders",
                columns: new[] { "Title", "Language" });

            migrationBuilder.CreateIndex(
                name: "IX_UserExternalLogin_Issuer_Subject",
                table: "UserExternalLogins",
                columns: new[] { "Issuer", "Subject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserExternalLogin_UserId",
                table: "UserExternalLogins",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserScrobblerConfig_UserId_Provider",
                table: "UserScrobblerConfigs",
                columns: new[] { "UserId", "Provider" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_User_OpdsPath",
                table: "Users",
                column: "OpdsPath",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_User_Username",
                table: "Users",
                column: "Username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ETagCache");

            migrationBuilder.DropTable(
                name: "HealthStatuses");

            migrationBuilder.DropTable(
                name: "Imports");

            migrationBuilder.DropTable(
                name: "Jobs");

            migrationBuilder.DropTable(
                name: "LatestSeries");

            migrationBuilder.DropTable(
                name: "Providers");

            migrationBuilder.DropTable(
                name: "Queues");

            migrationBuilder.DropTable(
                name: "SeriesMappings");

            migrationBuilder.DropTable(
                name: "SeriesProviders");

            migrationBuilder.DropTable(
                name: "Settings");

            migrationBuilder.DropTable(
                name: "UserExternalLogins");

            migrationBuilder.DropTable(
                name: "UserScrobblerConfigs");

            migrationBuilder.DropTable(
                name: "Series");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
