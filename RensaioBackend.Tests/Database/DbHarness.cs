using Microsoft.EntityFrameworkCore;
using Npgsql;
using RensaioBackend.Data;
using RensaioBackend.Migration;
using Testcontainers.PostgreSql;
using Xunit;

namespace RensaioBackend.Tests.Database;

/// <summary>
/// Creates fresh, schema-complete databases for one provider. Each call returns a new
/// empty database so tests never share state.
/// </summary>
public interface IDbHarness
{
    string Provider { get; }
    Task<AppDbContext> CreateEmptyAsync();
}

/// <summary>SQLite on a temp file, bootstrapped the way a fresh install is.</summary>
public sealed class SqliteHarness : IDbHarness, IDisposable
{
    private readonly List<string> _files = [];

    public string Provider => "sqlite";

    public async Task<AppDbContext> CreateEmptyAsync()
    {
        string path = Path.Combine(Path.GetTempPath(), $"rensaio-test-{Guid.NewGuid():N}.db");
        _files.Add(path);
        var db = Open(path);
        await db.Database.EnsureCreatedAsync();
        await MigrationService.MarkAllMigrationsAsAppliedAsync(db, CancellationToken.None);
        return db;
    }

    public static SqliteAppDbContext Open(string path)
    {
        var options = new DbContextOptionsBuilder<SqliteAppDbContext>();
        SqliteAppDbContext.Configure(options, "Data Source=" + path);
        return new SqliteAppDbContext(options.Options);
    }

    public void Dispose()
    {
        foreach (var f in _files)
        {
            foreach (var suffix in new[] { "", "-wal", "-shm" })
            {
                try { File.Delete(f + suffix); } catch { /* best effort */ }
            }
        }
    }
}

/// <summary>
/// PostgreSQL from a Testcontainers container, or from the server named by the
/// <c>RENSAIO_TEST_POSTGRES</c> environment variable (an Npgsql connection string with
/// rights to CREATE DATABASE). One server per test assembly; one database per call.
/// </summary>
public sealed class PostgresHarness : IDbHarness, IAsyncLifetime
{
    private PostgreSqlContainer? _container;
    private string _adminConnectionString = string.Empty;
    private readonly List<string> _databases = [];

    public string Provider => "postgres";

    public async Task InitializeAsync()
    {
        string? external = Environment.GetEnvironmentVariable("RENSAIO_TEST_POSTGRES");
        if (!string.IsNullOrWhiteSpace(external))
        {
            _adminConnectionString = external;
            return;
        }
        _container = new PostgreSqlBuilder("postgres:18-alpine").Build();
        await _container.StartAsync();
        _adminConnectionString = _container.GetConnectionString();
    }

    public async Task DisposeAsync()
    {
        foreach (var name in _databases)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_adminConnectionString);
                await conn.OpenAsync();
                await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)", conn);
                await cmd.ExecuteNonQueryAsync();
            }
            catch { /* best effort */ }
        }
        if (_container is not null)
            await _container.DisposeAsync();
    }

    public async Task<AppDbContext> CreateEmptyAsync()
    {
        var db = await CreateDatabaseAsync();
        await db.Database.MigrateAsync();
        return db;
    }

    /// <summary>A new, empty database with no schema. The caller migrates it.</summary>
    public async Task<PostgresAppDbContext> CreateDatabaseAsync()
    {
        string name = $"rensaio_test_{Guid.NewGuid():N}";
        await using (var conn = new NpgsqlConnection(_adminConnectionString))
        {
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", conn);
            await cmd.ExecuteNonQueryAsync();
        }
        _databases.Add(name);

        var builder = new NpgsqlConnectionStringBuilder(_adminConnectionString) { Database = name };
        var options = new DbContextOptionsBuilder<PostgresAppDbContext>();
        PostgresAppDbContext.Configure(options, builder.ConnectionString);
        return new PostgresAppDbContext(options.Options);
    }
}

[CollectionDefinition(Name)]
public sealed class PostgresCollection : ICollectionFixture<PostgresHarness>
{
    public const string Name = "postgres";
}
