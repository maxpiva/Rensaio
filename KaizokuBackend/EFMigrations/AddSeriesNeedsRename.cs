using KaizokuBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace KaizokuBackend.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260325120000_AddSeriesNeedsRename")]
public partial class AddSeriesNeedsRename : Microsoft.EntityFrameworkCore.Migrations.Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "NeedsRename",
            table: "Series",
            type: "INTEGER",
            nullable: false,
            defaultValue: false);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "NeedsRename",
            table: "Series");
    }
}
