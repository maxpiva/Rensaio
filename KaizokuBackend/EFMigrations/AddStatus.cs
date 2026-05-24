using KaizokuBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace KaizokuBackend.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260524180000_AddStatus")]
public partial class AddStatus : Microsoft.EntityFrameworkCore.Migrations.Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "ConsecutiveErrorCount",
            table: "SeriesProviders",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0);


        migrationBuilder.AddColumn<DateTime>(
            name: "LastErrorDate",
            table: "SeriesProviders",
            type: "TEXT",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "LastKnownStatus",
            table: "SeriesProviders",
            type: "INTEGER",
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "LastSeriesInfoRefreshDate",
            table: "SeriesProviders",
            type: "TEXT",
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "LastSuccessfulFetchDate",
            table: "SeriesProviders",
            type: "TEXT",
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "LastChapterDate",
            table: "Series",
            type: "TEXT",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "HealthStatuses",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "TEXT", nullable: false),
                TargetType = table.Column<int>(type: "INTEGER", nullable: false),
                TargetId = table.Column<Guid>(type: "TEXT", nullable: false),
                Level = table.Column<int>(type: "INTEGER", nullable: false),
                Message = table.Column<string>(type: "TEXT", nullable: false),
                AffectedSeriesJson = table.Column<string>(type: "TEXT", nullable: true),
                CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                ResolvedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                IsActive = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_HealthStatuses", x => x.Id);
            });

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
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "HealthStatuses");

        migrationBuilder.DropColumn(
            name: "ConsecutiveErrorCount",
            table: "SeriesProviders");

        migrationBuilder.DropColumn(
            name: "LastErrorDate",
            table: "SeriesProviders");

        migrationBuilder.DropColumn(
            name: "LastKnownStatus",
            table: "SeriesProviders");

        migrationBuilder.DropColumn(
            name: "LastSeriesInfoRefreshDate",
            table: "SeriesProviders");

        migrationBuilder.DropColumn(
            name: "LastSuccessfulFetchDate",
            table: "SeriesProviders");

        migrationBuilder.DropColumn(
            name: "LastChapterDate",
            table: "Series");
    }
}
