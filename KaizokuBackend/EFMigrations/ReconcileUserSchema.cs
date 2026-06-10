using KaizokuBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace KaizokuBackend.Migrations;

/// <summary>
/// Intentionally a no-op. The Users-table reconciliation (Level, OpdsPath, AvatarBlob,
/// AvatarContentType, PasswordSetToken, PasswordSetTokenExpiresAt columns, Level backfill,
/// and the legacy NOT NULL rebuild) is performed exclusively by
/// StartupHostedService.EnsureAuthTablesAsync, which runs immediately after MigrateAsync
/// on every startup and guards every step with PRAGMA table_info probes / IF NOT EXISTS.
///
/// It cannot be done here: a plain AddColumn crashes on databases that predate the Users
/// table (the table was only ever created by raw SQL at startup, never by an EF migration)
/// and equally crashes with "duplicate column" on databases EnsureAuthTablesAsync already
/// upgraded. SQLite offers no conditional DDL, so the guarded C# path is authoritative and
/// this migration exists only to keep the model snapshot and __EFMigrationsHistory aligned.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260528120000_ReconcileUserSchema")]
public partial class ReconcileUserSchema : Microsoft.EntityFrameworkCore.Migrations.Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // No-op — see class summary.
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // No-op — see class summary.
    }
}
