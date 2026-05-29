using KaizokuBackend.Data;
using KaizokuBackend.Services.Auth;
using KaizokuBackend.Utils;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Serilog;
using Serilog.Sinks.SystemConsole.Themes;

namespace KaizokuBackend
{
    public class Program
    {

        public static async Task Main(string[] args)
        {

            await EnvironmentSetup.InitializeAsync(null);

            var host = CreateHostBuilder(args).Build();

            // Eagerly warm the auth-settings cache BEFORE the HTTP pipeline starts serving
            // requests.  This eliminates the window between Kestrel accepting its first
            // connection and StartupHostedService completing its DB migration + settings load.
            //
            // Strategy: perform a direct, lightweight read of the AuthenticationEnabled row
            // from the Settings table.  If the table does not yet exist (brand-new install
            // whose migration has not run) the query throws and we tolerate the failure —
            // the fail-closed default in AuthSettingsCache already returns true (auth required)
            // until Update() is called, so the instance remains protected.
            //
            // Guard: skip the warm-up entirely when the database file does not yet exist.
            // Opening an AppDbContext against a missing SQLite file causes EF/SQLite to
            // create an empty kaizoku.db in ReadWriteCreate mode.  That premature file then
            // fools MigrationService.RunAsync (which keys off File.Exists) into treating a
            // fresh install as a legacy v1.0 database, breaking the migration sequence.
            // On a brand-new install there are no settings to warm; the fail-closed default
            // in AuthSettingsCache keeps the instance protected until StartupHostedService
            // completes migration and calls cache.Update().
            var warmUpConnectionString = EnvironmentSetup.Configuration!.GetConnectionString("DefaultConnection");
            var shouldWarm = false;
            if (!string.IsNullOrEmpty(warmUpConnectionString) &&
                warmUpConnectionString.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase))
            {
                var warmUpDbPath = warmUpConnectionString.Substring("Data Source=".Length).Trim();
                warmUpDbPath = Path.GetFullPath(warmUpDbPath);
                shouldWarm = File.Exists(warmUpDbPath);
            }

            if (shouldWarm)
            {
                try
                {
                    using var warmScope = host.Services.CreateScope();
                    var warmDb = warmScope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var settingRow = await warmDb.Settings
                        .AsNoTracking()
                        .FirstOrDefaultAsync(s => s.Name == "AuthenticationEnabled")
                        .ConfigureAwait(false);

                    if (settingRow != null &&
                        bool.TryParse(settingRow.Value, out var authEnabled))
                    {
                        var cache = warmScope.ServiceProvider.GetRequiredService<IAuthSettingsCache>();
                        cache.Update(authEnabled);
                    }
                    // If the row is missing or the table does not exist, leave the cache
                    // unloaded: the fail-closed default (return true) keeps the instance safe.
                }
                catch
                {
                    // DB not yet migrated (brand-new install) — intentionally swallowed.
                    // Fail-closed default in AuthSettingsCache ensures auth is required until
                    // StartupHostedService completes its migration and warms the cache properly.
                }
            }

            await host.RunAsync();
        }

        public static IHostBuilder CreateHostBuilder(string[] args)
        {

            return Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseWebRoot(Path.Combine(EnvironmentSetup.Configuration!["runtimeDirectory"]!, "wwwroot"));
                    webBuilder.ConfigureAppConfiguration(AppConfiguration);
                    webBuilder.UseStartup<Startup>();
                    webBuilder.ConfigureKestrel(server =>
                    {
                        var config = EnvironmentSetup.Configuration!;
                        var port = config.GetValue<int>(
#if DEBUG
                            "Kestrel:Ports:Debug"
#else
    "Kestrel:Ports:Release"
#endif
                            , 5005);
                        EnvironmentSetup.Logger.LogInformation("Starting Kaizoku NET on port {port}...", port);
                        server.ListenAnyIP(port);
                    });
                });
        }

        private static void AppConfiguration(WebHostBuilderContext context, IConfigurationBuilder builder)
        {
            EnvironmentSetup.AddConfigurations(builder);
        }
    }
}