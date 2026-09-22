using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Npgsql;

namespace RensaioBackend.Data
{
    /// <summary>
    /// <see cref="AppDbContext"/> on PostgreSQL, the opt-in provider. Owns the migrations
    /// under <c>Migrations/Rensaio/Postgres</c>.
    /// </summary>
    public class PostgresAppDbContext : AppDbContext
    {
        public PostgresAppDbContext(DbContextOptions<PostgresAppDbContext> options) : base(options)
        {
        }

        public static void Configure(DbContextOptionsBuilder options, string connectionString)
        {
            options.UseNpgsql(connectionString);
        }

        /// <summary>
        /// Turns the resolved settings into an Npgsql connection string. Npgsql only accepts
        /// its own keyword names, so libpq-style input (URI, <c>sslrootcert</c>, ...) is
        /// translated here rather than passed through.
        /// </summary>
        public static string BuildConnectionString(PostgresSettings settings)
        {
            ArgumentNullException.ThrowIfNull(settings);

            NpgsqlConnectionStringBuilder builder;
            if (settings.RawConnectionString is not null)
            {
                // Validates keyword names; an unknown one throws "Keyword not supported".
                builder = new NpgsqlConnectionStringBuilder(settings.RawConnectionString);
            }
            else
            {
                builder = new NpgsqlConnectionStringBuilder
                {
                    Host = settings.Host,
                    Port = settings.Port,
                    Database = settings.Database,
                    Username = settings.Username,
                    Password = settings.Password,
                };
                if (settings.SslMode is not null)
                    builder.SslMode = ParseSslMode(settings.SslMode);
                if (settings.RootCertificate is not null)
                    builder.RootCertificate = settings.RootCertificate;
            }

            if (string.IsNullOrEmpty(builder.Host))
                throw new InvalidOperationException("PostgreSQL connection has no host.");
            if (string.IsNullOrEmpty(builder.ApplicationName))
                builder.ApplicationName = "Rensaio";
            return builder.ConnectionString;
        }

        /// <summary>A safe-to-log description: provider, host, port and database only.</summary>
        public static string Describe(string connectionString)
        {
            var b = new NpgsqlConnectionStringBuilder(connectionString);
            return $"PostgreSQL {b.Host}:{b.Port}/{b.Database} as {b.Username}";
        }

        private static SslMode ParseSslMode(string value)
            => value.Trim().ToLowerInvariant() switch
            {
                "disable" => SslMode.Disable,
                "allow" => SslMode.Allow,
                "prefer" => SslMode.Prefer,
                "require" => SslMode.Require,
                "verify-ca" or "verifyca" => SslMode.VerifyCA,
                "verify-full" or "verifyfull" => SslMode.VerifyFull,
                _ => throw new InvalidOperationException(
                    $"Unknown SSL mode '{value}'. Expected one of: disable, allow, prefer, require, verify-ca, verify-full.")
            };
    }

    /// <summary>
    /// Used by <c>dotnet ef</c> only. No connection is opened when scaffolding a migration,
    /// so a placeholder server is enough:
    /// <c>dotnet ef migrations add Name --context PostgresAppDbContext --output-dir Migrations/Rensaio/Postgres</c>
    /// </summary>
    public class PostgresAppDbContextDesignTimeFactory : IDesignTimeDbContextFactory<PostgresAppDbContext>
    {
        public PostgresAppDbContext CreateDbContext(string[] args)
        {
            var builder = new DbContextOptionsBuilder<PostgresAppDbContext>();
            PostgresAppDbContext.Configure(builder, "Host=localhost;Database=rensaio;Username=rensaio;Password=design");
            return new PostgresAppDbContext(builder.Options);
        }
    }
}
