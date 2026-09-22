using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using RensaioBackend.Data;
using System;

#nullable disable

namespace RensaioBackend.Migrations.Rensaio.Sqlite
{
    /// <inheritdoc />
    // NOTE: [DbContext] / [Migration] attributes intentionally live in the
    // auto-generated .Designer.cs partial for this migration to avoid CS0579
    // duplicate-attribute errors (attributes are AllowMultiple = false).
    public partial class DropUserSeriesMappingsAddSeriesCoverUrl : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SeriesMappings_Series_SeriesId",
                table: "SeriesMappings");

            migrationBuilder.DropTable(
                name: "UserSeriesMappings");

            migrationBuilder.AlterColumn<Guid>(
                name: "SeriesId",
                table: "SeriesMappings",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "TEXT");

            migrationBuilder.AddColumn<string>(
                name: "SeriesCoverUrl",
                table: "SeriesMappings",
                type: "TEXT",
                nullable: true,
                collation: "BINARY");

            migrationBuilder.AddForeignKey(
                name: "FK_SeriesMappings_Series_SeriesId",
                table: "SeriesMappings",
                column: "SeriesId",
                principalTable: "Series",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SeriesMappings_Series_SeriesId",
                table: "SeriesMappings");

            migrationBuilder.DropColumn(
                name: "SeriesCoverUrl",
                table: "SeriesMappings");

            migrationBuilder.AlterColumn<Guid>(
                name: "SeriesId",
                table: "SeriesMappings",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "UserSeriesMappings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExternalSeriesId = table.Column<string>(type: "TEXT", nullable: false, collation: "BINARY"),
                    ExternalSeriesTitle = table.Column<string>(type: "TEXT", nullable: true, collation: "BINARY"),
                    LinkedDate = table.Column<DateTime>(type: "TEXT", nullable: true),
                    MappingStatus = table.Column<int>(type: "INTEGER", nullable: false),
                    Provider = table.Column<int>(type: "INTEGER", nullable: false),
                    SeriesId = table.Column<Guid>(type: "TEXT", nullable: false)
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
                name: "IX_UserSeriesMapping_UserId_SeriesId_Provider",
                table: "UserSeriesMappings",
                columns: new[] { "UserId", "SeriesId", "Provider" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_SeriesMappings_Series_SeriesId",
                table: "SeriesMappings",
                column: "SeriesId",
                principalTable: "Series",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
