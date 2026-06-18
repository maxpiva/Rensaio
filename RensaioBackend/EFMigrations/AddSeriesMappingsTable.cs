using RensaioBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using System;

#nullable disable

namespace RensaioBackend.EFMigrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260609135605_AddSeriesMappingsTable")]
    public partial class AddSeriesMappingsTable : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SeriesMappings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SeriesId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Provider = table.Column<int>(type: "INTEGER", nullable: false),
                    ExternalSeriesId = table.Column<string>(type: "TEXT", nullable: false, collation: "BINARY"),
                    ExternalSeriesRAW = table.Column<string>(type: "TEXT", nullable: true, collation: "BINARY"),
                    ExternalSeriesTitle = table.Column<string>(type: "TEXT", nullable: true, collation: "BINARY"),
                    UserUid = table.Column<Guid>(type: "TEXT", nullable: true),
                    UserRole = table.Column<int>(type: "INTEGER", nullable: false),
                    UpdateDate = table.Column<DateTime>(type: "TEXT", nullable: false)
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

     
            migrationBuilder.CreateIndex(
                name: "IX_SeriesMapping_SeriesId_Provider",
                table: "SeriesMappings",
                columns: new[] { "SeriesId", "Provider" },
                unique: true);

       
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SeriesMappings");

        }
    }
}
