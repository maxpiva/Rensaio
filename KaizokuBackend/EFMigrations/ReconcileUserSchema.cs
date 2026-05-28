using KaizokuBackend.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace KaizokuBackend.Migrations;

/// <summary>
/// Adds new columns to the Users table (Level, OpdsPath, AvatarBlob, AvatarContentType,
/// PasswordSetToken) and backfills Level from the existing Role column.
///
/// Double-add safety: EF Core's __EFMigrationsHistory table ensures this migration runs exactly
/// once per database. New installs have the migration pre-marked as applied via
/// MarkAllMigrationsAsApplied, so EnsureCreatedAsync builds the full schema without this
/// migration ever running. For existing installs StartupHostedService.EnsureAuthTablesAsync
/// also applies these columns using PRAGMA table_info guards — whichever runs first "wins"
/// and the other is a no-op. The migration therefore does not duplicate the PRAGMA guards;
/// __EFMigrationsHistory is the authoritative idempotency gate.
///
/// OpdsPath backfill (generating unique word-pair slugs) cannot run in pure SQL, so it is left
/// empty here and performed at startup by StartupHostedService after this migration completes.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260528120000_ReconcileUserSchema")]
public partial class ReconcileUserSchema : Microsoft.EntityFrameworkCore.Migrations.Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "Level",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<string>(
            name: "OpdsPath",
            table: "Users",
            type: "TEXT",
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<byte[]>(
            name: "AvatarBlob",
            table: "Users",
            type: "BLOB",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "AvatarContentType",
            table: "Users",
            type: "TEXT",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "PasswordSetToken",
            table: "Users",
            type: "TEXT",
            nullable: true);

        // Backfill Level from Role:
        //   Role.Admin = 0  → Level.Admin = 2
        //   Role.User  = 1  → Level.User  = 0
        migrationBuilder.Sql(@"
            UPDATE ""Users""
            SET ""Level"" = CASE ""Role""
                WHEN 0 THEN 2
                WHEN 1 THEN 0
                ELSE 0
            END;
        ");

        // Note: IX_User_OpdsPath is NOT created here. The OpdsPath column defaults to '' for all
        // existing rows, so creating a unique index before the C# backfill runs would cause a
        // unique-constraint violation on any install with two or more users. The index is created
        // unconditionally by StartupHostedService.EnsureAuthTablesAsync after BackfillOpdsPathsAsync
        // has assigned distinct slugs to every row. New installs get the index from EnsureCreatedAsync
        // via the EF model definition.
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // SQLite does not support DROP COLUMN natively in the version used by this project.
        // Mirror the no-op Down pattern of sibling migrations; only the index can be dropped.
        migrationBuilder.Sql(@"DROP INDEX IF EXISTS ""IX_User_OpdsPath"";");
    }
}
