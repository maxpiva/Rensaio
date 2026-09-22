using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RensaioBackend.Migrations.Rensaio.Sqlite
{
    /// <inheritdoc />
    public partial class RestoreSeriesMappingDeleteCascade : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SeriesMappings_Series_SeriesId",
                table: "SeriesMappings");

            migrationBuilder.AddForeignKey(
                name: "FK_SeriesMappings_Series_SeriesId",
                table: "SeriesMappings",
                column: "SeriesId",
                principalTable: "Series",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SeriesMappings_Series_SeriesId",
                table: "SeriesMappings");

            migrationBuilder.AddForeignKey(
                name: "FK_SeriesMappings_Series_SeriesId",
                table: "SeriesMappings",
                column: "SeriesId",
                principalTable: "Series",
                principalColumn: "Id");
        }
    }
}
