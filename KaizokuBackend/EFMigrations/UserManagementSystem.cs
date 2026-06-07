using System;
using KaizokuBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizokuBackend.EFMigrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20260605000426_UserManagementSystem")]
    public partial class UserManagementSystem : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Username = table.Column<string>(type: "TEXT", nullable: false, collation: "BINARY"),
                    AvatarBlob = table.Column<byte[]>(type: "BLOB", nullable: true),
                    AvatarContentType = table.Column<string>(type: "TEXT", nullable: true),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: true),
                    Salt = table.Column<string>(type: "TEXT", nullable: true),
                    PasswordSetToken = table.Column<string>(type: "TEXT", nullable: true),
                    RefreshTokenHash = table.Column<string>(type: "TEXT", nullable: true),
                    RefreshTokenExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Level = table.Column<int>(type: "INTEGER", nullable: false),
                    OpdsPath = table.Column<string>(type: "TEXT", nullable: false, collation: "BINARY"),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastLoginAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserScrobblerConfigs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Provider = table.Column<int>(type: "INTEGER", nullable: false),
                    AccessToken = table.Column<string>(type: "TEXT", nullable: true),
                    RefreshToken = table.Column<string>(type: "TEXT", nullable: true),
                    TokenExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    IsEnabled = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true),
                    AutoSync = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true),
                    LastSyncAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    LastUploadAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    LastDownloadAt = table.Column<DateTime>(type: "TEXT", nullable: true)
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

            migrationBuilder.CreateTable(
                name: "UserSeriesMappings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SeriesId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Provider = table.Column<int>(type: "INTEGER", nullable: false),
                    ExternalSeriesId = table.Column<string>(type: "TEXT", nullable: false, collation: "BINARY"),
                    ExternalSeriesTitle = table.Column<string>(type: "TEXT", nullable: true, collation: "BINARY"),
                    MappingStatus = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSeriesMappings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserSeriesMappings_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

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

            migrationBuilder.CreateIndex(
                name: "IX_UserScrobblerConfig_UserId_Provider",
                table: "UserScrobblerConfigs",
                columns: new[] { "UserId", "Provider" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserSeriesMapping_UserId_SeriesId_Provider",
                table: "UserSeriesMappings",
                columns: new[] { "UserId", "SeriesId", "Provider" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserScrobblerConfigs");

            migrationBuilder.DropTable(
                name: "UserSeriesMappings");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
