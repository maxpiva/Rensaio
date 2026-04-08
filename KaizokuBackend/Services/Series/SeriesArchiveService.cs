using KaizokuBackend.Data;
using KaizokuBackend.Extensions;
using KaizokuBackend.Models;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Bridge;
using KaizokuBackend.Services.Helpers;
using KaizokuBackend.Services.Jobs;
using KaizokuBackend.Services.Jobs.Models;
using KaizokuBackend.Services.Jobs.Report;
using KaizokuBackend.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Services.Series
{
    /// <summary>
    /// Service responsible for archive operations and series integrity checks
    /// </summary>
    public class SeriesArchiveService
    {
        private readonly AppDbContext _db;
        private readonly SettingsService _settings;
        private readonly MihonBridgeService _mihon;
        private readonly ArchiveHelperService _archiveHelper;
        private readonly JobHubReportService _reportingService;
        private readonly ILogger<SeriesArchiveService> _logger;

        public SeriesArchiveService(AppDbContext db, SettingsService settings, MihonBridgeService mihon,
            ArchiveHelperService archiveHelper, JobHubReportService reportingService, ILogger<SeriesArchiveService> logger)
        {
            _db = db;
            _settings = settings;
            _mihon = mihon;
            _archiveHelper = archiveHelper;
            _reportingService = reportingService;
            _logger = logger;
        }

        /// <summary>
        /// Verifies the integrity of series archive files
        /// </summary>
        /// <param name="seriesId">The series ID to verify</param>
        /// <param name="token">Cancellation token</param>
        /// <returns>Series integrity result</returns>
        public async Task<SeriesIntegrityResultDto> VerifyIntegrityAsync(Guid seriesId, CancellationToken token = default)
        {
            SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
            Models.Database.SeriesEntity? series = await _db.Series.Include(a => a.Sources).Where(a => a.Id == seriesId)
                .FirstOrDefaultAsync(token).ConfigureAwait(false);

            if (series == null)
                throw new ArgumentException("Invalid series Id");

            string basePath = Path.Combine(settings.StorageFolder, series.StoragePath);

            // Remove empty unknown providers
            SeriesProviderEntity? sp = series.Sources.FirstOrDefault(a =>
                a.IsUnknown && a.Chapters.All(a => string.IsNullOrEmpty(a.Filename)));
            if (sp != null)
            {
                _db.SeriesProviders.Remove(sp);
                series.Sources.Remove(sp);
                await _db.SaveChangesAsync(token).ConfigureAwait(false);
            }

            // Check for truncated title and try to recover the full name from the source
            await TryRecoverTruncatedTitleAsync(series, token).ConfigureAwait(false);

            List<Chapter> chaps = series.Sources.SelectMany(a => a.Chapters)
                .Where(a => !string.IsNullOrEmpty(a.Filename)).ToList();

            return GetIntegrityResult(basePath, chaps);
        }

        /// <summary>
        /// Cleans up corrupted series files and marks chapters for re-download
        /// </summary>
        /// <param name="seriesId">The series ID to cleanup</param>
        /// <param name="token">Cancellation token</param>
        public async Task CleanupSeriesAsync(Guid seriesId, CancellationToken token = default)
        {
            SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
            Models.Database.SeriesEntity? series = await _db.Series.Include(a => a.Sources).Where(a => a.Id == seriesId)
                .FirstOrDefaultAsync(token).ConfigureAwait(false);
            
            if (series == null)
                throw new ArgumentException("Invalid series Id");
            
            List<Chapter> chaps = series.Sources.SelectMany(a => a.Chapters)
                .Where(a => !string.IsNullOrEmpty(a.Filename)).ToList();
            string basePath = Path.Combine(settings.StorageFolder, series.StoragePath);
            SeriesIntegrityResultDto sr = GetIntegrityResult(basePath, chaps);
            bool update = false;

            foreach (ArchiveIntegrityResultDto r in sr.BadFiles)
            {
                if (r.Result == ArchiveResult.NoImages || r.Result == ArchiveResult.NotAnArchive)
                {
                    string finalName = Path.Combine(basePath, r.Filename);
                    try
                    {
                        File.Delete(finalName);
                    }
                    catch (Exception)
                    {
                        _logger.LogWarning("Unable to delete file {finalName}", finalName);
                    }
                }
                Chapter? chapter = chaps.FirstOrDefault(a => a.Filename == r.Filename);

                
                foreach (SeriesProviderEntity s in series.Sources)
                {
                    foreach (Chapter ch in s.Chapters.Where(a => a.Filename == r.Filename))
                    {
                        ch.Filename = null;
                        ch.IsDeleted = true;
                        _db.Touch(s, c => c.Chapters);
                        update = true;
                        if (s.ContinueAfterChapter >= ch.Number)
                            s.ContinueAfterChapter = ch.Number - 1;
                    }
                }
            }

            if (update)
                await _db.SaveChangesAsync(token).ConfigureAwait(false);
        }

        /// <summary>
        /// Renames the storage folder (if the title changed) and all chapter files for a series
        /// to use the correct title. Also clears the <see cref="SeriesEntity.NeedsRename"/> flag.
        /// </summary>
        /// <param name="seriesId">The series ID to rename files for</param>
        /// <param name="token">Cancellation token</param>
        public async Task RenameSeriesFilesAsync(Guid seriesId, CancellationToken token = default)
        {
            var series = await _db.Series.FirstOrDefaultAsync(s => s.Id == seriesId, token).ConfigureAwait(false);
            if (series != null)
            {
                await RenameStorageFolderIfNeededAsync(series, token).ConfigureAwait(false);
            }

            await _archiveHelper.UpdateTitleAndAddComicInfoAsync(seriesId, true, token).ConfigureAwait(false);

            // Clear the flag after a successful rename
            if (series != null && series.NeedsRename)
            {
                series.NeedsRename = false;
                await _db.SaveChangesAsync(token).ConfigureAwait(false);
            }
        }

        /// <summary>
        /// Renames the physical storage folder when the series title no longer matches the folder name.
        /// This happens after a truncated title is recovered to its full version.
        /// </summary>
        private async Task RenameStorageFolderIfNeededAsync(SeriesEntity series, CancellationToken token)
        {
            SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
            string currentFullPath = Path.Combine(settings.StorageFolder, series.StoragePath);

            // Compute what the folder name should be based on the current (corrected) title
            string expectedFolderName = series.Title.MakeFolderNameSafe();
            string currentFolderName = Path.GetFileName(
                series.StoragePath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));

            if (string.Equals(expectedFolderName, currentFolderName, StringComparison.Ordinal))
                return; // Already matches

            // Build the new path by replacing only the last segment (the folder name)
            string parentPath = Path.GetDirectoryName(currentFullPath)
                                ?? settings.StorageFolder;
            string newFullPath = Path.Combine(parentPath, expectedFolderName);

            if (!Directory.Exists(currentFullPath))
            {
                _logger.LogWarning("Storage folder does not exist, skipping folder rename: {Path}", currentFullPath);
                return;
            }

            if (Directory.Exists(newFullPath))
            {
                _logger.LogWarning("Target folder already exists, skipping folder rename: {Path}", newFullPath);
                return;
            }

            try
            {
                Directory.Move(currentFullPath, newFullPath);

                // Update the StoragePath in the DB (relative path from storage root)
                string parentRelative = Path.GetDirectoryName(series.StoragePath)
                                        ?? string.Empty;
                series.StoragePath = string.IsNullOrEmpty(parentRelative)
                    ? expectedFolderName
                    : Path.Combine(parentRelative, expectedFolderName);

                await _db.SaveChangesAsync(token).ConfigureAwait(false);
                _logger.LogInformation("Renamed storage folder from \"{Old}\" to \"{New}\"", currentFullPath, newFullPath);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to rename storage folder from \"{Old}\" to \"{New}\"", currentFullPath, newFullPath);
            }
        }

        /// <summary>
        /// Queries the title-source provider for the full series title via GetDetailsAsync (which
        /// includes HTML meta-tag recovery for truncated titles). Only updates the series title and
        /// that specific provider's title — never touches other providers' titles.
        /// Only triggers recovery when the current title is actually truncated (ends with "..."/"…")
        /// or when the title-source provider's own title is truncated.
        /// </summary>
        private async Task TryRecoverTruncatedTitleAsync(SeriesEntity series, CancellationToken token)
        {
            if (string.IsNullOrEmpty(series.Title))
                return;

            // Find the provider that is the title source (IsTitle flag), falling back to first active
            SeriesProviderEntity? titleProvider = series.Sources
                .FirstOrDefault(s => s.IsTitle && !s.IsDisabled && !s.IsUninstalled && !s.IsUnknown && !string.IsNullOrEmpty(s.MihonProviderId));
            titleProvider ??= series.Sources
                .FirstOrDefault(s => !s.IsDisabled && !s.IsUninstalled && !s.IsUnknown && !string.IsNullOrEmpty(s.MihonProviderId));
            if (titleProvider == null)
                return;

            // Only attempt recovery if the series title OR the title provider's title looks truncated
            bool seriesTruncated = IsTitleTruncated(series.Title);
            bool providerTruncated = IsTitleTruncated(titleProvider.Title);
            if (!seriesTruncated && !providerTruncated)
                return;

            try
            {
                var src = await _mihon.SourceFromProviderIdAsync(titleProvider.MihonProviderId!, token).ConfigureAwait(false);
                var manga = titleProvider.ToManga();
                if (manga == null)
                    return;

                var details = await src.GetDetailsAsync(manga, token).ConfigureAwait(false);
                if (details == null || string.IsNullOrEmpty(details.Title))
                    return;

                bool detailsTruncated = IsTitleTruncated(details.Title);
                if (detailsTruncated)
                    return; // Source also returned truncated — nothing we can do

                bool changed = false;

                // Update the title provider's own title if it was truncated
                if (providerTruncated && details.Title.Length > titleProvider.Title.Length)
                {
                    _logger.LogInformation("Updated title-source provider {Provider} title: \"{Old}\" → \"{New}\"",
                        titleProvider.Provider, titleProvider.Title, details.Title);
                    titleProvider.Title = details.Title;
                    changed = true;
                }

                // Update series title if the title-source provider now has a longer title
                if (details.Title.Length > series.Title.Length)
                {
                    string oldTitle = series.Title;
                    series.Title = details.Title;
                    series.NeedsRename = true;
                    changed = true;
                    _logger.LogInformation("Recovered full title for series {Id}: \"{OldTitle}\" → \"{NewTitle}\"",
                        series.Id, oldTitle, details.Title);
                }

                if (changed)
                    await _db.SaveChangesAsync(token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to recover truncated title for series {Id}", series.Id);
            }
        }

        private static bool IsTitleTruncated(string? title)
        {
            if (string.IsNullOrEmpty(title))
                return false;
            return title.EndsWith("...") || title.EndsWith("\u2026");
        }

        /// <summary>
        /// Updates all series titles and comic info files
        /// </summary>
        /// <param name="jobInfo">Job information for progress reporting</param>
        /// <param name="token">Cancellation token</param>
        /// <returns>Job result</returns>
        public async Task<JobResult> UpdateAllSeriesAsync(JobInfo jobInfo, CancellationToken token = default)
        {
            ProgressReporter progress = _reportingService.CreateReporter(jobInfo);
            await _archiveHelper.UpdateAllTitlesAndAddComicInfoAsync(progress, false, token).ConfigureAwait(false);
            return JobResult.Success;
        }

        /// <summary>
        /// Checks archive integrity and returns result
        /// </summary>
        /// <param name="path">Base path for the series</param>
        /// <param name="chapters">List of chapters to check</param>
        /// <returns>Series integrity result</returns>
        private static SeriesIntegrityResultDto GetIntegrityResult(string path, List<Chapter> chapters)
        {
            SeriesIntegrityResultDto result = new SeriesIntegrityResultDto
            {
                BadFiles = []
            };

            foreach (Chapter c in chapters)
            {
                string fileName = Path.Combine(path, c.Filename!);
                ArchiveResult ar = ArchiveHelperService.CheckArchive(fileName);
                if (ar != ArchiveResult.Fine)
                {
                    result.BadFiles.Add(new ArchiveIntegrityResultDto 
                    { 
                        Filename = c.Filename!,
                        Result = ar 
                    });
                }
            }

            result.Success = result.BadFiles.Count == 0;
            return result;
        }
    }
}