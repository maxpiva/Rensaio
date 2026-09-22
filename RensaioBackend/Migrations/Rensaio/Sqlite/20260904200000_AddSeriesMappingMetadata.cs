using RensaioBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RensaioBackend.Migrations.Rensaio.Sqlite
{
    [DbContext(typeof(SqliteAppDbContext))]
    [Migration("20260904200000_AddSeriesMappingMetadata")]
    public partial class AddSeriesMappingMetadata : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // MetaData: provider-native JSON (verbatim detail-call payload)
            migrationBuilder.AddColumn<string>(
                name: "MetaData",
                table: "SeriesMappings",
                type: "TEXT",
                nullable: true,
                collation: "BINARY");

            // LinkedSitesIds: comma-separated "site:id" pairs (e.g. "anilist:30002,myanimelist:2")
            migrationBuilder.AddColumn<string>(
                name: "LinkedSitesIds",
                table: "SeriesMappings",
                type: "TEXT",
                nullable: true,
                collation: "BINARY");

            // AlternativeTitles: JSON-encoded string[] including the main title
            migrationBuilder.AddColumn<string>(
                name: "AlternativeTitles",
                table: "SeriesMappings",
                type: "TEXT",
                nullable: true,
                collation: "BINARY");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MetaData",
                table: "SeriesMappings");

            migrationBuilder.DropColumn(
                name: "LinkedSitesIds",
                table: "SeriesMappings");

            migrationBuilder.DropColumn(
                name: "AlternativeTitles",
                table: "SeriesMappings");
        }
    }
}