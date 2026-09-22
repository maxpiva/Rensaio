using RensaioBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RensaioBackend.Migrations.Rensaio.Sqlite
{
    /// <summary>
    /// Adds the non-unique (Provider, ExternalSeriesId) index on SeriesMappings so the
    /// mapping-conflict repair pass and the ownership guard can find every series claiming
    /// a given external id quickly.
    /// </summary>
    [DbContext(typeof(SqliteAppDbContext))]
    [Migration("20260916010000_AddSeriesMappingProviderExternalIndex")]
    public partial class AddSeriesMappingProviderExternalIndex : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_SeriesMapping_Provider_ExternalSeriesId",
                table: "SeriesMappings",
                columns: new[] { "Provider", "ExternalSeriesId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SeriesMapping_Provider_ExternalSeriesId",
                table: "SeriesMappings");
        }
    }
}