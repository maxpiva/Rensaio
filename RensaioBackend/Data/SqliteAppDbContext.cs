using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace RensaioBackend.Data
{
    /// <summary>
    /// <see cref="AppDbContext"/> on SQLite, the default provider. Owns the migrations
    /// under <c>Migrations/Rensaio/Sqlite</c>.
    /// </summary>
    public class SqliteAppDbContext : AppDbContext
    {
        public SqliteAppDbContext(DbContextOptions<SqliteAppDbContext> options) : base(options)
        {
        }

        public static void Configure(DbContextOptionsBuilder options, string connectionString)
        {
            options.UseSqlite(connectionString);
        }
    }

    /// <summary>
    /// Used by <c>dotnet ef</c> only. Targets a scratch file so scaffolding a migration
    /// never touches a real database:
    /// <c>dotnet ef migrations add Name --context SqliteAppDbContext --output-dir Migrations/Rensaio/Sqlite</c>
    /// </summary>
    public class SqliteAppDbContextDesignTimeFactory : IDesignTimeDbContextFactory<SqliteAppDbContext>
    {
        public SqliteAppDbContext CreateDbContext(string[] args)
        {
            var builder = new DbContextOptionsBuilder<SqliteAppDbContext>();
            SqliteAppDbContext.Configure(builder, "Data Source=" + Path.Combine(Path.GetTempPath(), "rensaio-design.db"));
            return new SqliteAppDbContext(builder.Options);
        }
    }
}
