using System;
using RensaioBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RensaioBackend.EFMigrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20260609000001_AddOwnerUserLevel")]
    public partial class AddOwnerUserLevel : Microsoft.EntityFrameworkCore.Migrations.Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Promote the first-created admin user to Owner level (3)
            // This handles existing deployments upgrading to the new owner user level system.
            // The first admin is identified as the earliest-created user with Level = 2 (Admin).
            // If no admin exists, this is a no-op.
            migrationBuilder.Sql(@"
                UPDATE ""Users""
                SET ""Level"" = 3
                WHERE ""Id"" = (
                    SELECT ""Id"" FROM ""Users""
                    WHERE ""Level"" = 2
                    ORDER BY ""CreatedAt"" ASC
                    LIMIT 1
                )
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Revert: set the owner back to admin level (2)
            migrationBuilder.Sql(@"
                UPDATE ""Users""
                SET ""Level"" = 2
                WHERE ""Level"" = 3
            ");
        }
    }
}