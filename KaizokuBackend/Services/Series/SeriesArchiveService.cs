using KaizokuBackend.Data;
using KaizokuBackend.Extensions;
using KaizokuBackend.Models;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
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
        private readonly ArchiveHelperService _archiveHelper;
        private readonly JobHubReportService _reportingService;
        private readonly ILogger<SeriesArchiveService> _logger;
        private readonly SeriesStateService _stateService;
        private readonly ReadState.HashCacheService _hashCache;

        public SeriesArchiveService(AppDbContext db, SettingsService settings, ArchiveHelperService archiveHelper,
            JobHubReportService reportingService, ILogger<SeriesArchiveService> logger,
            SeriesStateService stateService,
            ReadState.HashCacheService hashCache)
        {
            _db = db;
            _settings = settings;
            _archiveHelper = archiveHelper;
            _reportingService = reportingService;
            _logger = logger;
        }

        /// <summary>
        /// Verifies the integrity of series archive files
        /// </summary>
        /// <param name="seriesId">The series ID to verify</param>
        /// <param name="force">If true, re-populate pages even if already present</param>
        /// <param name="token">Cancellation token</param>
        /// <returns>Series integrity result</returns>
        public async Task<SeriesIntegrityResultDto> VerifyIntegrityAsync(Guid seriesId, bool force = false, CancellationToken token = default)
        {
            SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
            Models.Database.SeriesEntity? series = await _db.Series.Include(a => a.Sources).Where(a => a.Id == seriesId)
                .FirstOrDefaultAsync(token).ConfigureAwait(false);
            
            if (series == null)
                throw new ArgumentException("Invalid series Id");
            
            string basePath = Path.Combine(settings.StorageFolder, series.StoragePath);
            bool dbChanged = false;

            // Process each provider
            var providersToRemove = new List<SeriesProviderEntity>();

            foreach (SeriesProviderEntity provider in series.Sources)
            {
                var chaptersToRemove = new List<Chapter>();

                foreach (Chapter chapter in provider.Chapters)
                {
                    // Remove chapter if filename is empty
                    if (string.IsNullOrEmpty(chapter.Filename))
                    {
                        chaptersToRemove.Add(chapter);
                        continue;
                    }

                    string archivePath = Path.Combine(basePath, chapter.Filename);

                    // Remove chapter if the archive file does not exist on disk
                    if (!File.Exists(archivePath))
                    {
                        chaptersToRemove.Add(chapter);
                        continue;
                    }

                    // Populate pages if empty or force is true
                    if (chapter.Pages.Count == 0 || force)
                    {
                        var images = ArchiveHelperService.GetImageFiles(archivePath);
                        chapter.Pages = images;
                        chapter.PageCount = images.Count;
                        _db.Touch(provider, c => c.Chapters);
                        dbChanged = true;
                    }
                }

                // Remove collected chapters from the provider
                foreach (Chapter ch in chaptersToRemove)
                {
                    provider.Chapters.Remove(ch);
                    dbChanged = true;
                }

                if (chaptersToRemove.Count > 0)
                {
                    _db.Touch(provider, c => c.Chapters);
                }

                // If provider has no chapters left, mark for removal
                if (provider.Chapters.Count == 0)
                {
                    providersToRemove.Add(provider);
                }
            }

            // Remove empty providers
            foreach (SeriesProviderEntity sp in providersToRemove)
            {
                _db.SeriesProviders.Remove(sp);
                series.Sources.Remove(sp);
                dbChanged = true;
            }

            // Persist all DB changes
            if (dbChanged)
            {
                await _db.SaveChangesAsync(token).ConfigureAwait(false);
            }

            // Clean up hash cache entries for removed chapters
            try
            {
                // This method also handles hash cleanup internally via its loops
                await _stateService.SyncToKaizokuJsonAsync(series.Id, token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to sync kaizoku.json after integrity verify for series {SeriesId}", series.Id);
            }

            // Return integrity result for remaining valid chapters
            List<Chapter> validChapters = series.Sources.SelectMany(a => a.Chapters)
                .Where(a => !string.IsNullOrEmpty(a.Filename)).ToList();

            return GetIntegrityResult(basePath, validChapters);
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
                        // Clean up hash cache before removing the filename reference
                        if (!string.IsNullOrEmpty(ch.Filename))
                        {
                            _hashCache.DeleteChapterHash(series.StoragePath, ch.Filename);
                        }

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

            // Sync kaizoku.json after cleanup - always sync even if no changes detected
            // since file deletions may have occurred
            await _stateService.SyncToKaizokuJsonAsync(series.Id, token).ConfigureAwait(false);
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