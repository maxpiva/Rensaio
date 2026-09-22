using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RensaioBackend.Migration;

namespace RensaioBackend.Data
{
    /// <summary>
    /// <c>RensaioBackend migrate-db --to postgres|sqlite</c>: copies the library from the
    /// current database to the other provider, using the same configuration the server
    /// reads (<c>Database:*</c>, <c>ConnectionStrings:DefaultConnection</c>). The source is
    /// never modified. Exit codes: 0 done, 1 bad arguments or configuration, 2 target not
    /// empty, 3 row counts differ after the copy.
    /// </summary>
    public static class MigrateDbCommand
    {
        public const string MarkerSuffix = ".migrated-to-postgres";

        public static async Task<int> RunAsync(string[] args, IConfiguration configuration, CancellationToken token = default)
        {
            DatabaseProvider? to = null;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--to" && i + 1 < args.Length)
                    to = args[++i].ToLowerInvariant() switch
                    {
                        "postgres" or "postgresql" => DatabaseProvider.Postgres,
                        "sqlite" => DatabaseProvider.Sqlite,
                        _ => null
                    };
            }
            if (to is null)
            {
                Console.Error.WriteLine("usage: RensaioBackend migrate-db --to postgres|sqlite");
                Console.Error.WriteLine("Configure the PostgreSQL side with Database__Host/Port/Name/Username/Password or ConnectionStrings__DefaultConnection.");
                return 1;
            }

            DatabaseConfig sqlite, postgres;
            try
            {
                sqlite = DatabaseConfig.Resolve(configuration, DatabaseProvider.Sqlite);
                postgres = DatabaseConfig.Resolve(configuration, DatabaseProvider.Postgres);
            }
            catch (InvalidOperationException ex)
            {
                Console.Error.WriteLine(ex.Message);
                return 1;
            }

            string postgresConnectionString = PostgresAppDbContext.BuildConnectionString(postgres.Postgres!);
            var sqliteOptions = new DbContextOptionsBuilder<SqliteAppDbContext>();
            SqliteAppDbContext.Configure(sqliteOptions, sqlite.SqliteConnectionString!);
            var postgresOptions = new DbContextOptionsBuilder<PostgresAppDbContext>();
            PostgresAppDbContext.Configure(postgresOptions, postgresConnectionString);

            await using var sqliteDb = new SqliteAppDbContext(sqliteOptions.Options);
            await using var postgresDb = new PostgresAppDbContext(postgresOptions.Options);

            AppDbContext source, target;
            string sourceName = "SQLite " + sqlite.SqlitePath;
            string targetName = PostgresAppDbContext.Describe(postgresConnectionString);
            if (to == DatabaseProvider.Postgres)
            {
                if (!File.Exists(sqlite.SqlitePath!))
                {
                    Console.Error.WriteLine($"Source database not found: {sqlite.SqlitePath}");
                    return 1;
                }
                (source, target) = (sqliteDb, postgresDb);
            }
            else
            {
                if (File.Exists(sqlite.SqlitePath!) && new FileInfo(sqlite.SqlitePath!).Length > 0)
                {
                    Console.Error.WriteLine($"Target file already exists: {sqlite.SqlitePath}. Move it away first; the copy only writes into an empty database.");
                    return 2;
                }
                (source, target) = (postgresDb, sqliteDb);
                (sourceName, targetName) = (targetName, sourceName);
            }

            Console.WriteLine($"Source: {sourceName}");
            Console.WriteLine($"Target: {targetName}");

            if (!await source.Database.CanConnectAsync(token).ConfigureAwait(false))
            {
                Console.Error.WriteLine("Cannot connect to the source database.");
                return 1;
            }

            // Prepare the target schema. PostgreSQL has a complete migration set; SQLite's
            // schema comes from the model, the same way a fresh install builds it.
            if (target == postgresDb)
            {
                if (!await target.Database.CanConnectAsync(token).ConfigureAwait(false))
                {
                    Console.Error.WriteLine("Cannot connect to the target database. Check Database__Host/Port/Name/Username/Password.");
                    return 1;
                }
                await target.Database.MigrateAsync(token).ConfigureAwait(false);
            }
            else
            {
                await target.Database.EnsureCreatedAsync(token).ConfigureAwait(false);
                await MigrationService.MarkAllMigrationsAsAppliedAsync(target, token).ConfigureAwait(false);
            }

            if (!await DatabaseCopy.IsEmptyAsync(target, token).ConfigureAwait(false))
            {
                Console.Error.WriteLine("The target database already contains data. The copy only writes into an empty database.");
                return 2;
            }

            Console.WriteLine("Copying...");
            var results = await DatabaseCopy.CopyAsync(source, target, line => Console.WriteLine("  " + line), token).ConfigureAwait(false);

            Console.WriteLine();
            Console.WriteLine($"{"Table",-26} {"Source",10} {"Target",10}");
            bool ok = true;
            foreach (var r in results)
            {
                Console.WriteLine($"{r.Table,-26} {r.SourceRows,10} {r.TargetRows,10} {(r.Matches ? "" : "  MISMATCH")}");
                ok &= r.Matches;
            }
            if (!ok)
            {
                Console.Error.WriteLine("Row counts differ. The target is not trustworthy; drop it and retry.");
                return 3;
            }

            if (to == DatabaseProvider.Postgres)
            {
                string marker = sqlite.SqlitePath + MarkerSuffix;
                await File.WriteAllTextAsync(marker, DateTime.UtcNow.ToString("O") + Environment.NewLine, token).ConfigureAwait(false);
                Console.WriteLine();
                Console.WriteLine("Done. The SQLite file was left untouched.");
                Console.WriteLine("Now start Rensaio with Database__Provider=postgres (and the same Database__* settings). To go back, start it without them.");
            }
            else
            {
                Console.WriteLine();
                Console.WriteLine($"Done. Start Rensaio with Database__Provider=sqlite (or no Database__* settings) to use {sqlite.SqlitePath}.");
            }
            return 0;
        }
    }
}
