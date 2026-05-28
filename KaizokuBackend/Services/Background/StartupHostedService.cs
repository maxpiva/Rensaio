using KaizokuBackend.Data;
using KaizokuBackend.Extensions;
using KaizokuBackend.Migration;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Auth;
using KaizokuBackend.Services.Bridge;
using KaizokuBackend.Services.Helpers;
using KaizokuBackend.Services.Jobs;
using KaizokuBackend.Services.Providers;
using KaizokuBackend.Services.Settings;
using Microsoft.EntityFrameworkCore;
using Mihon.ExtensionsBridge.Core.Utilities;
using Mihon.ExtensionsBridge.Models.Abstractions;
using System.ComponentModel;
using System.Data;

namespace KaizokuBackend.Services.Background
{
    public class StartupHostedService : IHostedService, IDisposable
    {
        private readonly NouisanceFixer20ExtraLarge _fixes;
        private readonly ILogger<StartupHostedService> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly List<Task> _workerTasks = new();
        private CancellationTokenSource? _workerCts;
        private bool _disposed = false;

        public StartupHostedService(ILogger<StartupHostedService> logger, 
            IServiceScopeFactory scopeFactory,
            NouisanceFixer20ExtraLarge fixes,
            IConfiguration config)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
            _fixes = fixes;
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                try
                {
                    // Use a timeout for disposal
                    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                    StopAsync(cts.Token).GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error during disposal of StartupHostedService");
                }
                _disposed = true;
                GC.SuppressFinalize(this);
            }
        }

        public async Task<bool> CheckStorageStatusAsync(AppDbContext db, SettingsDto settings, IHostApplicationLifetime lifetime, CancellationToken token = default)
        {

            Models.Database.SeriesEntity? series = await db.Series.AsNoTracking().OrderBy(a=>a.Id).FirstOrDefaultAsync(token).ConfigureAwait(false);

            bool hasArchiveFiles = ArchiveHelperService.ContainsArchiveFilesRecursive(settings.StorageFolder);
            if (!hasArchiveFiles && series!=null)
            {
                _logger.LogError("No archive files found in the storage folder. But database has content, shutting down...");
                lifetime.StopApplication();
                return false;
            }
            else if (hasArchiveFiles && series == null)
            {
                //We have archive files, but no series in the database, we start the wizard setup
                settings.IsWizardSetupComplete = false;
                settings.WizardSetupStepCompleted = 0;
            }
            else
            {
                // We have archive files and series in the database, or everything is empty, we can proceed
                settings.IsWizardSetupComplete = true;
                settings.WizardSetupStepCompleted = 0;
            }

            return true;
        }


        public async Task StartAsync(CancellationToken cancellationToken)
        {
            try
            {

                using var scope = _scopeFactory.CreateScope();
                //Initialize Mihon Bridge
                var mihon = scope.ServiceProvider.GetRequiredService<IBridgeManager>();
                await mihon.InitializeAsync(cancellationToken);


              

                //Run migration if needed
                var migration = scope.ServiceProvider.GetRequiredService<MigrationService>();
                await migration.RunAsync(cancellationToken).ConfigureAwait(false);


                // Initialize other services
                var settingsService = scope.ServiceProvider.GetRequiredService<SettingsService>();
                var providerCacheService = scope.ServiceProvider.GetRequiredService<ProviderCacheService>();
                
                // Load settings
                SettingsDto settings = await settingsService.GetSettingsAsync(cancellationToken).ConfigureAwait(false);
                settingsService.SetThreadSettings(settings);
                await settingsService.SetTimesSettingsAsync(settings, cancellationToken).ConfigureAwait(false);
                AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await db.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
                await EnsureAuthTablesAsync(db, cancellationToken).ConfigureAwait(false);
                await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", cancellationToken).ConfigureAwait(false);
                await db.Database.ExecuteSqlRawAsync("PRAGMA busy_timeout=5000;", cancellationToken).ConfigureAwait(false);
                await _fixes.FixThumbnailsOfSeriesWithMissingThumbnailsAsync(cancellationToken).ConfigureAwait(false);

                // Retag historical Browse-tab rows that were written before per-title
                // language detection. This lets the user's PreferredLanguages filter
                // immediately hide unwanted scripts from multi-language sources.
                try
                {
                    int retagged = await _fixes.BackfillLatestSeriesLanguagesAsync(cancellationToken).ConfigureAwait(false);
                    if (retagged > 0)
                        _logger.LogInformation("Backfilled language tags on {Count} cloud-latest rows.", retagged);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Latest-series language backfill failed; Browse filter may be incomplete until next source refresh.");
                }

                IHostApplicationLifetime lifetime = scope.ServiceProvider.GetRequiredService<IHostApplicationLifetime>();
                JobManagementService jobManagement = scope.ServiceProvider.GetRequiredService<JobManagementService>();
                _logger.LogInformation("Checking Storage folder Status...");
                bool save = await CheckStorageStatusAsync(db, settings, lifetime, cancellationToken).ConfigureAwait(false);
                if (save)
                    await settingsService.SaveSettingsAsync(settings, true, cancellationToken).ConfigureAwait(false);
                // Cache providers — wrapped in try-catch so broken extensions don't prevent startup
                _logger.LogInformation("Syncing Mihon Extensions Preferences.");
                try
                {
                    await providerCacheService.RefreshCacheAsync(false, cancellationToken).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Provider cache refresh failed during startup. " +
                        "Some extensions may be unavailable. The app will continue with a degraded provider set.");
                }
                var jobs = await jobManagement.GetRecurringJobsByTypeAsync(JobType.DailyUpdate, cancellationToken).ConfigureAwait(false);
                if (jobs.Count == 0)
                {
                    await jobManagement.ScheduleRecurringJobAsync(JobType.DailyUpdate, (string?)null,null, null,false, TimeSpan.FromDays(1),Priority.Normal, cancellationToken).ConfigureAwait(false);
                }
                _workerCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                var workerToken = _workerCts.Token;
                _workerTasks.Add(StartWorker<JobQueueHostedService>(workerToken));
                _workerTasks.Add(StartWorker<JobScheduledHostedService>(workerToken));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error starting Startup Hosted Service");
                throw;
            }
        }

        /// <summary>
        /// Ensures auth/multi-user tables exist and are up to date for both new and existing databases.
        ///
        /// New installs: tables are created via EnsureCreatedAsync earlier in the pipeline; this
        ///   method is a no-op for them (the table SELECT probe succeeds immediately).
        ///
        /// Brand-new tables (first ever start): created with the current/correct schema here.
        ///
        /// Existing installs (table already present but possibly old shape): each new column is
        ///   probed via PRAGMA table_info and added with ALTER TABLE only when absent, so this
        ///   method is idempotent and safe to run even after ReconcileUserSchema migration has
        ///   already applied the same columns.
        /// </summary>
        private async Task EnsureAuthTablesAsync(AppDbContext db, CancellationToken cancellationToken)
        {
            try
            {
                // ── Probe whether the Users table exists ──────────────────────────────────
                var tableExists = false;
                try
                {
                    await db.Database.ExecuteSqlRawAsync(
                        "SELECT 1 FROM \"Users\" LIMIT 1;", cancellationToken).ConfigureAwait(false);
                    tableExists = true;
                }
                catch
                {
                    tableExists = false;
                }

                if (!tableExists)
                {
                    _logger.LogInformation("Creating auth tables for multi-user support...");

                    // Create Users with the current/correct schema:
                    //   - PasswordHash / Salt are nullable (no NOT NULL)
                    //   - Email is nullable (no NOT NULL, no unique constraint)
                    //   - Level, OpdsPath, AvatarBlob, AvatarContentType, PasswordSetToken included
                    await db.Database.ExecuteSqlRawAsync(@"
                        CREATE TABLE IF NOT EXISTS ""Users"" (
                            ""Id"" TEXT NOT NULL PRIMARY KEY,
                            ""Username"" TEXT NOT NULL COLLATE BINARY,
                            ""Email"" TEXT COLLATE BINARY,
                            ""DisplayName"" TEXT NOT NULL COLLATE BINARY,
                            ""PasswordHash"" TEXT COLLATE BINARY,
                            ""Salt"" TEXT COLLATE BINARY,
                            ""Role"" INTEGER NOT NULL,
                            ""Level"" INTEGER NOT NULL DEFAULT 0,
                            ""OpdsPath"" TEXT NOT NULL DEFAULT '' COLLATE BINARY,
                            ""AvatarPath"" TEXT COLLATE BINARY,
                            ""AvatarBlob"" BLOB,
                            ""AvatarContentType"" TEXT COLLATE BINARY,
                            ""PasswordSetToken"" TEXT COLLATE BINARY,
                            ""CreatedAt"" TEXT NOT NULL,
                            ""UpdatedAt"" TEXT NOT NULL,
                            ""LastLoginAt"" TEXT,
                            ""IsActive"" INTEGER NOT NULL
                        );", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_User_Username"" ON ""Users"" (""Username"");", cancellationToken).ConfigureAwait(false);
                    // IX_User_OpdsPath is created unconditionally after BackfillOpdsPathsAsync below.

                    await db.Database.ExecuteSqlRawAsync(@"
                        CREATE TABLE IF NOT EXISTS ""UserPermissions"" (
                            ""UserId"" TEXT NOT NULL PRIMARY KEY,
                            ""CanViewLibrary"" INTEGER NOT NULL,
                            ""CanRequestSeries"" INTEGER NOT NULL,
                            ""CanAddSeries"" INTEGER NOT NULL,
                            ""CanEditSeries"" INTEGER NOT NULL,
                            ""CanDeleteSeries"" INTEGER NOT NULL,
                            ""CanManageDownloads"" INTEGER NOT NULL,
                            ""CanViewQueue"" INTEGER NOT NULL,
                            ""CanBrowseSources"" INTEGER NOT NULL,
                            ""CanViewNSFW"" INTEGER NOT NULL,
                            ""CanManageRequests"" INTEGER NOT NULL,
                            ""CanManageJobs"" INTEGER NOT NULL,
                            ""CanViewStatistics"" INTEGER NOT NULL,
                            FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE
                        );", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"
                        CREATE TABLE IF NOT EXISTS ""UserSessions"" (
                            ""Id"" TEXT NOT NULL PRIMARY KEY,
                            ""UserId"" TEXT NOT NULL,
                            ""RefreshToken"" TEXT NOT NULL COLLATE BINARY,
                            ""ExpiresAt"" TEXT NOT NULL,
                            ""CreatedAt"" TEXT NOT NULL,
                            ""IpAddress"" TEXT COLLATE BINARY,
                            ""UserAgent"" TEXT COLLATE BINARY,
                            ""IsRevoked"" INTEGER NOT NULL,
                            FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE
                        );", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_UserSession_RefreshToken"" ON ""UserSessions"" (""RefreshToken"");", cancellationToken).ConfigureAwait(false);
                    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_UserSession_UserId"" ON ""UserSessions"" (""UserId"");", cancellationToken).ConfigureAwait(false);
                    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_UserSession_UserId_IsRevoked"" ON ""UserSessions"" (""UserId"", ""IsRevoked"");", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"
                        CREATE TABLE IF NOT EXISTS ""UserPreferences"" (
                            ""UserId"" TEXT NOT NULL PRIMARY KEY,
                            ""Theme"" TEXT NOT NULL COLLATE BINARY,
                            ""DefaultLanguage"" TEXT NOT NULL COLLATE BINARY,
                            ""CardSize"" TEXT NOT NULL COLLATE BINARY,
                            ""NsfwVisibility"" INTEGER NOT NULL,
                            FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE
                        );", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"
                        CREATE TABLE IF NOT EXISTS ""PermissionPresets"" (
                            ""Id"" TEXT NOT NULL PRIMARY KEY,
                            ""Name"" TEXT NOT NULL COLLATE BINARY,
                            ""CreatedByUserId"" TEXT NOT NULL,
                            ""IsDefault"" INTEGER NOT NULL,
                            ""CanViewLibrary"" INTEGER NOT NULL,
                            ""CanRequestSeries"" INTEGER NOT NULL,
                            ""CanAddSeries"" INTEGER NOT NULL,
                            ""CanEditSeries"" INTEGER NOT NULL,
                            ""CanDeleteSeries"" INTEGER NOT NULL,
                            ""CanManageDownloads"" INTEGER NOT NULL,
                            ""CanViewQueue"" INTEGER NOT NULL,
                            ""CanBrowseSources"" INTEGER NOT NULL,
                            ""CanViewNSFW"" INTEGER NOT NULL,
                            ""CanManageRequests"" INTEGER NOT NULL,
                            ""CanManageJobs"" INTEGER NOT NULL,
                            ""CanViewStatistics"" INTEGER NOT NULL,
                            FOREIGN KEY (""CreatedByUserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE
                        );", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_PermissionPreset_Name"" ON ""PermissionPresets"" (""Name"");", cancellationToken).ConfigureAwait(false);
                    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_PermissionPreset_IsDefault"" ON ""PermissionPresets"" (""IsDefault"");", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"
                        CREATE TABLE IF NOT EXISTS ""InviteLinks"" (
                            ""Id"" TEXT NOT NULL PRIMARY KEY,
                            ""Code"" TEXT NOT NULL COLLATE BINARY,
                            ""CreatedByUserId"" TEXT NOT NULL,
                            ""ExpiresAt"" TEXT NOT NULL,
                            ""MaxUses"" INTEGER NOT NULL,
                            ""UsedCount"" INTEGER NOT NULL,
                            ""PermissionPresetId"" TEXT,
                            ""IsActive"" INTEGER NOT NULL,
                            FOREIGN KEY (""CreatedByUserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE,
                            FOREIGN KEY (""PermissionPresetId"") REFERENCES ""PermissionPresets"" (""Id"") ON DELETE SET NULL
                        );", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_InviteLink_Code"" ON ""InviteLinks"" (""Code"");", cancellationToken).ConfigureAwait(false);
                    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_InviteLink_IsActive"" ON ""InviteLinks"" (""IsActive"");", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"
                        CREATE TABLE IF NOT EXISTS ""MangaRequests"" (
                            ""Id"" TEXT NOT NULL PRIMARY KEY,
                            ""RequestedByUserId"" TEXT NOT NULL,
                            ""Title"" TEXT NOT NULL COLLATE BINARY,
                            ""Description"" TEXT COLLATE BINARY,
                            ""ThumbnailUrl"" TEXT COLLATE BINARY,
                            ""ProviderData"" TEXT COLLATE BINARY,
                            ""Status"" INTEGER NOT NULL,
                            ""ReviewedByUserId"" TEXT,
                            ""ReviewedAt"" TEXT,
                            ""ReviewNote"" TEXT COLLATE BINARY,
                            ""CreatedAt"" TEXT NOT NULL,
                            FOREIGN KEY (""RequestedByUserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE,
                            FOREIGN KEY (""ReviewedByUserId"") REFERENCES ""Users"" (""Id"") ON DELETE SET NULL
                        );", cancellationToken).ConfigureAwait(false);

                    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_MangaRequest_Status"" ON ""MangaRequests"" (""Status"");", cancellationToken).ConfigureAwait(false);
                    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_MangaRequest_RequestedByUserId"" ON ""MangaRequests"" (""RequestedByUserId"");", cancellationToken).ConfigureAwait(false);

                    _logger.LogInformation("Auth tables created successfully.");
                }
                else
                {
                    // ── Existing install: upgrade Users table shape if needed ─────────────
                    // Guard every column with a PRAGMA table_info probe so this block is
                    // idempotent whether or not ReconcileUserSchema migration already ran.
                    _logger.LogInformation("Checking Users table for required columns...");

                    await AddColumnIfMissingAsync(db, "Users", "Level",
                        @"ALTER TABLE ""Users"" ADD COLUMN ""Level"" INTEGER NOT NULL DEFAULT 0;",
                        cancellationToken).ConfigureAwait(false);

                    await AddColumnIfMissingAsync(db, "Users", "OpdsPath",
                        @"ALTER TABLE ""Users"" ADD COLUMN ""OpdsPath"" TEXT NOT NULL DEFAULT '';",
                        cancellationToken).ConfigureAwait(false);

                    await AddColumnIfMissingAsync(db, "Users", "AvatarBlob",
                        @"ALTER TABLE ""Users"" ADD COLUMN ""AvatarBlob"" BLOB NULL;",
                        cancellationToken).ConfigureAwait(false);

                    await AddColumnIfMissingAsync(db, "Users", "AvatarContentType",
                        @"ALTER TABLE ""Users"" ADD COLUMN ""AvatarContentType"" TEXT NULL;",
                        cancellationToken).ConfigureAwait(false);

                    await AddColumnIfMissingAsync(db, "Users", "PasswordSetToken",
                        @"ALTER TABLE ""Users"" ADD COLUMN ""PasswordSetToken"" TEXT NULL;",
                        cancellationToken).ConfigureAwait(false);

                    // Backfill Level from Role for rows that still carry the default 0
                    // (this is safe to re-run: rows that were already backfilled will not change
                    // because Admin rows get Level=2 and User rows get Level=0 — same as default).
                    await db.Database.ExecuteSqlRawAsync(@"
                        UPDATE ""Users""
                        SET ""Level"" = CASE ""Role""
                            WHEN 0 THEN 2
                            WHEN 1 THEN 0
                            ELSE 0
                        END
                        WHERE ""Level"" = 0 AND ""Role"" = 0;",
                        cancellationToken).ConfigureAwait(false);

                }

                // ── OpdsPath per-row backfill (C# required — SQL cannot generate word-pairs) ──
                await BackfillOpdsPathsAsync(cancellationToken).ConfigureAwait(false);

                // ── OpdsPath unique index — created AFTER backfill so every row already carries
                // a distinct slug. IF NOT EXISTS makes this idempotent across new + existing installs
                // and re-runs. New installs also get this index from EF's EnsureCreatedAsync via the
                // model definition, so the IF NOT EXISTS guard is essential.
                await db.Database.ExecuteSqlRawAsync(
                    @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_User_OpdsPath"" ON ""Users"" (""OpdsPath"");",
                    cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating/upgrading auth tables");
                throw;
            }
        }

        /// <summary>
        /// Checks PRAGMA table_info for the given column; executes <paramref name="alterSql"/>
        /// only when the column is absent.  This guard ensures AddColumn is never run twice,
        /// whether by EnsureAuthTablesAsync or by the ReconcileUserSchema EF migration.
        /// </summary>
        private async Task AddColumnIfMissingAsync(AppDbContext db, string tableName, string columnName,
            string alterSql, CancellationToken cancellationToken)
        {
            var columns = new List<string>();
            var conn = db.Database.GetDbConnection();
            bool wasOpen = conn.State == System.Data.ConnectionState.Open;
            if (!wasOpen)
                await conn.OpenAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"PRAGMA table_info(\"{tableName.Replace("\"", "\"\"")}\");";
                using var reader = await cmd.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
                while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
                {
                    var name = reader.GetString(reader.GetOrdinal("name"));
                    columns.Add(name);
                }
            }
            finally
            {
                if (!wasOpen)
                    await conn.CloseAsync().ConfigureAwait(false);
            }

            if (!columns.Any(c => string.Equals(c, columnName, StringComparison.OrdinalIgnoreCase)))
            {
                _logger.LogInformation("Adding column {Column} to {Table}.", columnName, tableName);
                await db.Database.ExecuteSqlRawAsync(alterSql, cancellationToken).ConfigureAwait(false);
            }
        }

        /// <summary>
        /// For each user row whose OpdsPath is null or empty, generates a unique word-pair slug
        /// via <see cref="OpdsPathGenerator"/> and persists it.  Uses a fresh DI scope so the
        /// generator gets its own short-lived AppDbContext that does not conflict with the
        /// caller's context.
        /// </summary>
        private async Task BackfillOpdsPathsAsync(CancellationToken cancellationToken)
        {
            using var scope = _scopeFactory.CreateScope();
            var innerDb = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var generator = scope.ServiceProvider.GetRequiredService<OpdsPathGenerator>();

            var usersNeedingOpdsPath = await innerDb.Users
                .Where(u => u.OpdsPath == null || u.OpdsPath == string.Empty)
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            if (usersNeedingOpdsPath.Count == 0)
                return;

            _logger.LogInformation("Backfilling OpdsPath for {Count} user(s).", usersNeedingOpdsPath.Count);

            // Track paths assigned within this batch so two users in the same SaveChangesAsync
            // call cannot receive the same slug. GenerateUniqueAsync only probes committed DB rows,
            // so without this set a second user in the batch could receive a path already given
            // to the first user whose write has not been committed yet.
            var assignedThisBatch = new HashSet<string>(StringComparer.Ordinal);

            foreach (var user in usersNeedingOpdsPath)
            {
                string candidate;
                do
                {
                    candidate = await generator.GenerateUniqueAsync(cancellationToken).ConfigureAwait(false);
                } while (!assignedThisBatch.Add(candidate));

                user.OpdsPath = candidate;
            }

            await innerDb.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            _logger.LogInformation("OpdsPath backfill complete.");
        }

        private Task StartWorker<TWorker>(CancellationToken workerToken) where TWorker : IWorkerService
        {
            var task = Task.Run(async () =>
            {
                using var scope = _scopeFactory.CreateScope();
                var worker = scope.ServiceProvider.GetRequiredService<TWorker>();
                try
                {
                    await worker.ExecuteAsync(workerToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) { }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Worker crashed");
                }
            });
            return task;
        }
        public Task StopAsync(CancellationToken cancellationToken)
        {
            if (_workerCts == null)
                return Task.CompletedTask;

            _workerCts.Cancel();

            return Task.Run(async () =>
            {
                try
                {
                    await Task.WhenAll(_workerTasks).WaitAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    // host is shutting down, swallow cancellation
                }
                finally
                {
                    _workerCts.Dispose();
                    _workerCts = null;
                    _workerTasks.Clear();
                }
            }, CancellationToken.None);
        }
    }
}