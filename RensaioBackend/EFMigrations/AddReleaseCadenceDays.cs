using RensaioBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace RensaioBackend.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260603150000_AddReleaseCadenceDays")]
public partial class AddReleaseCadenceDays : Microsoft.EntityFrameworkCore.Migrations.Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "ReleaseCadenceDays",
            table: "Series",
            type: "INTEGER",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "ReleaseCadenceDays",
            table: "Series");
    }
}
