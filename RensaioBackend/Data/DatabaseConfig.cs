using Microsoft.Extensions.Configuration;

namespace RensaioBackend.Data
{
    public enum DatabaseProvider
    {
        Sqlite,
        Postgres
    }

    /// <summary>
    /// PostgreSQL connection settings as configured, before any driver-specific
    /// connection string is built from them. Exactly one of
    /// <see cref="RawConnectionString"/> or <see cref="Host"/> is expected to be set.
    /// </summary>
    public sealed record PostgresSettings
    {
        /// <summary>An Npgsql keyword=value connection string supplied verbatim by the user.</summary>
        public string? RawConnectionString { get; init; }
        public string? Host { get; init; }
        public int Port { get; init; } = 5432;
        public string? Database { get; init; }
        public string? Username { get; init; }
        public string? Password { get; init; }
        /// <summary>libpq-style value: disable, allow, prefer, require, verify-ca, verify-full.</summary>
        public string? SslMode { get; init; }
        /// <summary>Path to the CA certificate used to verify the server.</summary>
        public string? RootCertificate { get; init; }
    }

    /// <summary>
    /// Resolves which database engine Rensaio runs on and how to reach it. This is the
    /// only place that interprets <c>ConnectionStrings:DefaultConnection</c> and the
    /// <c>Database</c> configuration section; everything else asks this class.
    /// </summary>
    /// <remarks>
    /// Precedence:
    /// <list type="number">
    /// <item><c>Database:Provider</c> (<c>sqlite</c> or <c>postgres</c>) when set.</item>
    /// <item>Otherwise <c>postgres</c> when <c>Database:Host</c> is set or
    /// <c>ConnectionStrings:DefaultConnection</c> looks like a PostgreSQL URI or an
    /// Npgsql keyword string.</item>
    /// <item>Otherwise <c>sqlite</c>.</item>
    /// </list>
    /// SQLite keeps today's behaviour: <c>DefaultConnection</c> is <c>Data Source=&lt;file&gt;</c>,
    /// defaulting to <c>rensaio.db</c>.
    /// </remarks>
    public sealed class DatabaseConfig
    {
        public const string ProviderKey = "Database:Provider";
        public const string ConnectionName = "DefaultConnection";
        public const string DefaultSqliteFile = "rensaio.db";
        private const string SqlitePrefix = "Data Source=";

        public DatabaseProvider Provider { get; }

        /// <summary>Absolute path of the SQLite database file. Null unless <see cref="Provider"/> is SQLite.</summary>
        public string? SqlitePath { get; }

        /// <summary>SQLite connection string. Null unless <see cref="Provider"/> is SQLite.</summary>
        public string? SqliteConnectionString => SqlitePath is null ? null : SqlitePrefix + SqlitePath;

        /// <summary>PostgreSQL settings. Null unless <see cref="Provider"/> is PostgreSQL.</summary>
        public PostgresSettings? Postgres { get; }

        private DatabaseConfig(DatabaseProvider provider, string? sqlitePath, PostgresSettings? postgres)
        {
            Provider = provider;
            SqlitePath = sqlitePath;
            Postgres = postgres;
        }

        public static DatabaseConfig Resolve(IConfiguration configuration)
            => Resolve(configuration, null);

        /// <summary>
        /// Resolves for a specific provider regardless of <c>Database:Provider</c>. Used by
        /// the copy command, which needs both the SQLite and the PostgreSQL side of the
        /// same configuration.
        /// </summary>
        public static DatabaseConfig Resolve(IConfiguration configuration, DatabaseProvider? forceProvider)
        {
            ArgumentNullException.ThrowIfNull(configuration);

            string? connectionString = configuration.GetConnectionString(ConnectionName);
            var section = configuration.GetSection("Database");
            string? host = section["Host"];

            DatabaseProvider provider = forceProvider
                ?? ParseProvider(section["Provider"])
                ?? (!string.IsNullOrWhiteSpace(host) || LooksLikePostgres(connectionString)
                    ? DatabaseProvider.Postgres
                    : DatabaseProvider.Sqlite);

            if (provider == DatabaseProvider.Sqlite)
            {
                if (LooksLikePostgres(connectionString))
                {
                    if (forceProvider is null)
                        throw new InvalidOperationException(
                            $"{ProviderKey} is 'sqlite' but ConnectionStrings:{ConnectionName} is a PostgreSQL connection string.");
                    connectionString = null; // forced SQLite side: fall back to the default file
                }
                return new DatabaseConfig(provider, ResolveSqlitePath(connectionString), null);
            }

            return new DatabaseConfig(provider, null, ResolvePostgres(connectionString, section, host));
        }

        /// <summary>True when the value is a SQLite <c>Data Source=</c> connection string.</summary>
        public static bool IsSqliteConnectionString(string? connectionString)
            => connectionString is not null
               && connectionString.TrimStart().StartsWith(SqlitePrefix, StringComparison.OrdinalIgnoreCase);

        /// <summary>True for a <c>postgres://</c>/<c>postgresql://</c> URI or an Npgsql <c>Host=</c>/<c>Server=</c> keyword string.</summary>
        public static bool LooksLikePostgres(string? connectionString)
        {
            if (string.IsNullOrWhiteSpace(connectionString) || IsSqliteConnectionString(connectionString))
                return false;
            return IsPostgresUri(connectionString)
                   || connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase)
                   || connectionString.Contains("Server=", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsPostgresUri(string value)
        {
            string v = value.TrimStart();
            return v.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
                   || v.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase);
        }

        private static DatabaseProvider? ParseProvider(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;
            return value.Trim().ToLowerInvariant() switch
            {
                "sqlite" => DatabaseProvider.Sqlite,
                "postgres" or "postgresql" or "npgsql" => DatabaseProvider.Postgres,
                _ => throw new InvalidOperationException(
                    $"{ProviderKey} is '{value}'; expected 'sqlite' or 'postgres'.")
            };
        }

        private static string ResolveSqlitePath(string? connectionString)
        {
            string path = IsSqliteConnectionString(connectionString)
                ? connectionString!.TrimStart().Substring(SqlitePrefix.Length).Trim()
                : DefaultSqliteFile;
            if (string.IsNullOrWhiteSpace(path))
                path = DefaultSqliteFile;
            return Path.GetFullPath(path);
        }

        private static PostgresSettings ResolvePostgres(string? connectionString, IConfigurationSection section, string? host)
        {
            if (LooksLikePostgres(connectionString))
            {
                return IsPostgresUri(connectionString!)
                    ? ParsePostgresUri(connectionString!.Trim())
                    : new PostgresSettings { RawConnectionString = connectionString!.Trim() };
            }

            if (string.IsNullOrWhiteSpace(host))
                throw new InvalidOperationException(
                    "PostgreSQL was selected but no server was given. Set Database:Host (with Database:Port, Database:Name, " +
                    $"Database:Username, Database:Password) or put a postgresql:// URI or an Npgsql connection string in ConnectionStrings:{ConnectionName}.");

            return new PostgresSettings
            {
                Host = host.Trim(),
                Port = section.GetValue<int?>("Port") ?? 5432,
                Database = Trimmed(section["Name"]) ?? "rensaio",
                Username = Trimmed(section["Username"]),
                Password = section["Password"],
                SslMode = Trimmed(section["SslMode"]),
                RootCertificate = Trimmed(section["RootCertificate"]),
            };
        }

        /// <summary>
        /// Parses a libpq-style URI. Npgsql does not accept URIs or libpq parameter names,
        /// so this produces discrete settings that the provider turns into its own format.
        /// </summary>
        private static PostgresSettings ParsePostgresUri(string uriString)
        {
            if (!Uri.TryCreate(uriString, UriKind.Absolute, out var uri))
                throw new InvalidOperationException($"ConnectionStrings:{ConnectionName} is not a valid postgresql:// URI.");

            string? username = null, password = null;
            if (!string.IsNullOrEmpty(uri.UserInfo))
            {
                var creds = uri.UserInfo.Split(':', 2);
                username = Uri.UnescapeDataString(creds[0]);
                if (creds.Length > 1)
                    password = Uri.UnescapeDataString(creds[1]);
            }

            string? sslMode = null, rootCertificate = null;
            string query = uri.Query.TrimStart('?');
            if (query.Length > 0)
            {
                foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
                {
                    var kv = pair.Split('=', 2);
                    string key = Uri.UnescapeDataString(kv[0]).ToLowerInvariant();
                    string value = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;
                    switch (key)
                    {
                        case "sslmode": sslMode = value; break;
                        case "sslrootcert": rootCertificate = value; break;
                        default:
                            throw new InvalidOperationException(
                                $"Unsupported parameter '{key}' in the PostgreSQL URI. Supported: sslmode, sslrootcert. " +
                                "For anything else use an Npgsql keyword connection string instead.");
                    }
                }
            }

            string database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
            return new PostgresSettings
            {
                Host = uri.Host,
                Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
                Database = string.IsNullOrEmpty(database) ? "rensaio" : database,
                Username = username,
                Password = password,
                SslMode = sslMode,
                RootCertificate = rootCertificate,
            };
        }

        private static string? Trimmed(string? value)
            => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
