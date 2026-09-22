using RensaioBackend.Data;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Jobs.Models;
using RensaioBackend.Services.Metadata;
using RensaioBackend.Services.Settings;
using RensaioBackend.Utils;
using Microsoft.EntityFrameworkCore;

namespace RensaioBackend.Services.Daily
{
    public class DailyService
    {
        private readonly AppDbContext _db;
        private readonly ContributionDbContext _contributorDb;
        private readonly ILogger _logger;
        private readonly IConfiguration _configuration;
        private readonly MappingConflictRepairService? _repair;

        public DailyService(AppDbContext db, ContributionDbContext contributorDb,
            ILogger<DailyService> logger, IConfiguration configuration,
            MappingConflictRepairService? repair = null)
        {
            _db = db;
            _contributorDb = contributorDb;
            _logger = logger;
            _configuration = configuration;
            _repair = repair;
        }

        public async Task<JobResult> ExecuteAsync(JobInfo _, CancellationToken token = default)
        {
            _logger.LogInformation("Starting daily maintenance tasks...");
            await CreateBackupAsync(token).ConfigureAwait(false);
            await CreateContributionBackupAsync(token).ConfigureAwait(false);
            await CleanupOldCompletedEnqueueAsync(token).ConfigureAwait(false);

            // NOTE: mapping-conflict repair deliberately NOT run daily — it must only run at
            // startup (StartupHostedService) and via the explicit repair endpoint. Running it
            // from the daily job re-scans/block-cycles the whole library every day.

            _logger.LogInformation("Daily maintenance tasks completed.");
            return JobResult.Success;
        }

        public async Task CreateBackupAsync(CancellationToken token = default)
        {
            if (!_db.Database.IsSqlite())
            {
                // VACUUM INTO is SQLite-only. A server database is backed up by the server.
                _logger.LogInformation("Daily database backup skipped: the main database is not SQLite, back it up on the database server.");
                return;
            }
            string backupDirectory = Path.Combine(_configuration["runtimeDirectory"]!, "Backups");
            if (!Directory.Exists(backupDirectory))
            {
                try
                {
                    Directory.CreateDirectory(backupDirectory);
                }
                catch (Exception e)
                {
                    _logger.LogError(e, "Failed to create backup directory at {BackupDirectory}", backupDirectory);
                    return;
                }
            }
            var timestamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
            var backupPath = Path.Combine(backupDirectory, $"backup-{timestamp}.db");
            string sqlCommand = $"VACUUM INTO '{backupPath.Replace("'", "''")}'";
            await _db.Database.ExecuteSqlRawAsync(sqlCommand, token).ConfigureAwait(false);
            _logger.LogInformation("SQLite backup created at {backupPath}", backupPath);

            // Cleanup: keep only the 31 most recent backups
            try
            {
                var backupFiles = Directory.GetFiles(backupDirectory, "backup-*.db")
                    .OrderByDescending(f => f)
                    .ToList();

                if (backupFiles.Count > 31)
                {
                    var toDelete = backupFiles.Skip(31);
                    foreach (var file in toDelete)
                    {
                        try
                        {
                            File.Delete(file);
                            _logger.LogInformation("Deleted old backup file: {BackupFile}", file);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to delete old backup file: {BackupFile}", file);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup old backup files in {BackupDirectory}", backupDirectory);
            }
        }

        /// <summary>
        /// Backs up the local contributor database (contributor.db) with the same daily
        /// cadence as the main database: <c>VACUUM INTO</c> into the shared
        /// <c>Backups</c> folder and keep only the 31 most recent
        /// <c>contributor-backup-*.db</c> files. The distinct prefix keeps the two
        /// retention windows independent.
        /// </summary>
        public async Task CreateContributionBackupAsync(CancellationToken token = default)
        {
            string backupDirectory = Path.Combine(_configuration["runtimeDirectory"]!, "Backups");
            if (!Directory.Exists(backupDirectory))
            {
                try
                {
                    Directory.CreateDirectory(backupDirectory);
                }
                catch (Exception e)
                {
                    _logger.LogError(e, "Failed to create backup directory at {BackupDirectory}", backupDirectory);
                    return;
                }
            }

            var timestamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
            var backupPath = Path.Combine(backupDirectory, $"contributor-backup-{timestamp}.db");
            string sqlCommand = $"VACUUM INTO '{backupPath.Replace("'", "''")}'";
            await _contributorDb.Database.ExecuteSqlRawAsync(sqlCommand, token).ConfigureAwait(false);
            _logger.LogInformation("Contributor SQLite backup created at {backupPath}", backupPath);

            // Cleanup: keep only the 31 most recent contributor backups
            try
            {
                var backupFiles = Directory.GetFiles(backupDirectory, "contributor-backup-*.db")
                    .OrderByDescending(f => f)
                    .ToList();

                if (backupFiles.Count > 31)
                {
                    var toDelete = backupFiles.Skip(31);
                    foreach (var file in toDelete)
                    {
                        try
                        {
                            File.Delete(file);
                            _logger.LogInformation("Deleted old contributor backup file: {BackupFile}", file);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to delete old contributor backup file: {BackupFile}", file);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup old contributor backup files in {BackupDirectory}", backupDirectory);
            }
        }

        public async Task<int> CleanupOldCompletedEnqueueAsync(CancellationToken token = default)
        {
            // Step 1: Get all completed items ordered by FinishedDate descending
            var completedItems = await _db.Queues
                .Where(q => q.Status == QueueStatus.Completed && q.FinishedDate != null)
                .OrderByDescending(q => q.FinishedDate)
                .ToListAsync(token)
                .ConfigureAwait(false);

            // Step 2: If there are <= 1000, do nothing
            if (completedItems.Count <= 1000)
                return 0;

            // Step 3: Find the cutoff date (6 months ago)
            var sixMonthsAgo = DateTime.UtcNow.AddMonths(-6);

            // Step 4: Find the 1000th most recent completed item
            var minKeepDate = completedItems.Count > 1000
                ? completedItems[999].FinishedDate!.Value
                : sixMonthsAgo;

            // Step 5: The cutoff is the later of sixMonthsAgo or the 1000th item's FinishedDate
            var cutoffDate = minKeepDate > sixMonthsAgo ? minKeepDate : sixMonthsAgo;

            // Step 6: Find items to delete (older than cutoff)
            var toDelete = completedItems
                .Where(q => q.FinishedDate < cutoffDate)
                .ToList();

            if (toDelete.Count == 0)
                return 0;

            _db.Queues.RemoveRange(toDelete);
            await _db.SaveChangesAsync(token).ConfigureAwait(false);
            _logger.LogInformation("Deleted {Count} old completed Enqueue items (cutoff: {Cutoff})", toDelete.Count, cutoffDate);
            return toDelete.Count;
        }
    }
}
