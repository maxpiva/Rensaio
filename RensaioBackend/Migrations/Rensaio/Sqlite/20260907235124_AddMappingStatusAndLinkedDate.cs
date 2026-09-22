using RensaioBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RensaioBackend.Migrations.Rensaio.Sqlite
{
    /// <summary>
    /// Adds the mapping-status refactor columns:
    ///   SeriesMappings.MappingStatus   (shared SeriesMappingStatus enum, default AutoMatched)
    ///   SeriesMappings.LinkedDate      (UTC link/decision timestamp; temp-ignore review basis)
    ///   UserSeriesMappings.LinkedDate  (per-user UTC timestamp; informational)
    /// </summary>
    [DbContext(typeof(SqliteAppDbContext))]
    [Migration("20260907235124_AddMappingStatusAndLinkedDate")]
    public partial class AddMappingStatusAndLinkedDate : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Global SeriesMappings: app-wide link/decision state.
            migrationBuilder.AddColumn<int>(
                name: "MappingStatus",
                table: "SeriesMappings",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1); // SeriesMappingStatus.AutoMatched

            migrationBuilder.AddColumn<DateTime>(
                name: "LinkedDate",
                table: "SeriesMappings",
                type: "TEXT",
                nullable: true);

            // Per-user UserSeriesMappings: informational UTC timestamp.
            migrationBuilder.AddColumn<DateTime>(
                name: "LinkedDate",
                table: "UserSeriesMappings",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LinkedDate",
                table: "UserSeriesMappings");

            migrationBuilder.DropColumn(
                name: "LinkedDate",
                table: "SeriesMappings");

            migrationBuilder.DropColumn(
                name: "MappingStatus",
                table: "SeriesMappings");
        }
    }
}