using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace RensaioBackend.Data
{
    /// <summary>
    /// Runs before the host starts so that every hosted service finds a reachable,
    /// fully migrated database. SQLite keeps its file-based bootstrap in
    /// <see cref="Migration.MigrationService"/>; this only acts for server databases.
    /// </summary>
    public static class DatabaseStartup
    {
        public static async Task PrepareAsync(IServiceProvider services, CancellationToken cancellationToken = default)
        {
            var config = services.GetRequiredService<DatabaseConfig>();
            if (config.Provider == DatabaseProvider.Sqlite)
                return;

            using var scope = services.CreateScope();
            var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Database");
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            string target = PostgresAppDbContext.Describe(db.Database.GetConnectionString()!);

            logger.LogInformation("Database: {Target}", target);
            if (!await db.Database.CanConnectAsync(cancellationToken).ConfigureAwait(false))
            {
                // No fallback to SQLite on purpose: a silent fallback would create a second,
                // empty library that nobody asked for.
                throw new InvalidOperationException(
                    $"Cannot connect to {target}. Check Database:Host/Port/Name/Username/Password or ConnectionStrings:DefaultConnection, and that the server accepts this client.");
            }

            var pending = (await db.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).ToList();
            if (pending.Count > 0)
                logger.LogInformation("Applying {Count} database migration(s): {Migrations}", pending.Count, string.Join(", ", pending));
            await db.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("Database schema is up to date.");
        }
    }
}
