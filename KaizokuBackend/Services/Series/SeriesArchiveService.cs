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
using System.Globalization;
using System.Text.RegularExpressions;

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

            // Reconcile chapters whose DB Filename is empty against files actually on disk.
            // This recovers from prior states where Cleanup wiped Filename (e.g. due to a
            // transient read failure that has since resolved) but the file remained.
            await ReconcileOrphanedFilesAsync(series, basePath, token).ConfigureAwait(false);

            List<Chapter> chaps = series.Sources.SelectMany(a => a.Chapters)
                .Where(a => !string.IsNullOrEmpty(a.Filename)).ToList();

            return GetIntegrityResult(basePath, chaps);
        }

        /// <summary>
        /// Reconciles on-disk archive files against DB chapter rows for a single series,
        /// linking files whose [provider][lang] tag matches a chapter row whose DB Filename
        /// is empty or stale. Cheap, local-disk only — safe to call inline before Refresh
        /// and Download-All flows. Loads the series internally.
        /// </summary>
        /// <returns>A task that completes when reconciliation finishes.</returns>
        public async Task ReconcileOnDiskArchivesAsync(Guid seriesId, CancellationToken token = default)
        {
            SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
            SeriesEntity? series = await _db.Series.Include(a => a.Sources)
                .FirstOrDefaultAsync(a => a.Id == seriesId, token).ConfigureAwait(false);
            if (series == null)
                return;

            if (string.IsNullOrWhiteSpace(series.StoragePath))
                return;

            string basePath = Path.Combine(settings.StorageFolder, series.StoragePath);
            await ReconcileOrphanedFilesAsync(series, basePath, token).ConfigureAwait(false);
        }

        /// <summary>
        /// Reconciles on-disk archive files against DB chapter rows for an already-loaded
        /// tracked series entity. Use this overload when the caller already has the series
        /// loaded with tracking to share the same DbContext entity instances.
        /// </summary>
        /// <returns>A task that completes when reconciliation finishes.</returns>
        public async Task ReconcileOnDiskArchivesAsync(SeriesEntity series, CancellationToken token = default)
        {
            if (string.IsNullOrWhiteSpace(series.StoragePath))
                return;

            SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
            string basePath = Path.Combine(settings.StorageFolder, series.StoragePath);
            await ReconcileOrphanedFilesAsync(series, basePath, token).ConfigureAwait(false);
        }

        // Mirrors the Kaizoku filename pattern used by SeriesScanner — `[provider(-scanlator)?][lang]? title chapter (chapterName?)`.
        // We re-use the same parser so reconciliation succeeds even after a series title
        // change, a chapter-count padding shift, or a chapter-name rewrite — none of those
        // would match a regenerated expected filename, but all preserve provider+lang+chap#.
        private static readonly Regex KaizokuFilenameRegex = new Regex(
            "^\\[(?<provider>[^\\]]+)\\](?:\\[(?<lang>[^\\]]+)\\])?\\s+(?<title>.+?)(?:\\s+(?<chapterNumber>-?\\d+(?:\\.\\d+)?))?\\s*(?:\\((?<chapterName>[^)]+)\\))?$",
            RegexOptions.Compiled | RegexOptions.Singleline);

        private readonly struct ParsedFileKey
        {
            public string Provider { get; init; }
            public string? Scanlator { get; init; }
            public string Language { get; init; }
            public decimal Chapter { get; init; }
        }

        private static (ParsedFileKey key, bool ok) TryParseKaizokuFilename(string basename)
        {
            string stem = Path.GetFileNameWithoutExtension(basename);
            Match m = KaizokuFilenameRegex.Match(stem);
            if (!m.Success)
                return (default, false);

            string providerGroup = m.Groups["provider"].Value.Trim();
            string[] providerParts = providerGroup.Split('-', 2);
            string provider = providerParts[0].Trim();
            string? scanlator = providerParts.Length > 1 ? providerParts[1].Trim() : null;
            string language = m.Groups.TryGetValue("lang", out var langGroup) && langGroup.Success
                ? langGroup.Value.Trim()
                : "en";

            decimal? chapter = null;
            if (m.Groups.TryGetValue("chapterNumber", out var chapGroup) && !string.IsNullOrEmpty(chapGroup.Value))
            {
                if (decimal.TryParse(chapGroup.Value.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out decimal parsed))
                    chapter = parsed;
            }
            if (chapter == null && m.Groups.TryGetValue("chapterName", out var nameGroup) && !string.IsNullOrEmpty(nameGroup.Value))
            {
                if (decimal.TryParse(nameGroup.Value.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out decimal parsed))
                    chapter = parsed;
            }
            if (chapter == null)
                return (default, false);

            return (new ParsedFileKey
            {
                Provider = provider,
                Scanlator = string.IsNullOrEmpty(scanlator) ? null : scanlator,
                Language = language.ToLowerInvariant(),
                Chapter = chapter.Value,
            }, true);
        }

        /// <summary>
        /// Scans the series storage folder and re-links any archive whose embedded
        /// <c>[provider][lang] ... chapter</c> tag matches a chapter row whose DB
        /// <c>Filename</c> is currently empty. Uses the same Kaizoku filename regex the
        /// import scanner uses, so matching is resilient to (a) series title changes,
        /// (b) maxchap padding shifts when new chapters are added, and (c) chapter-name
        /// rewrites by the provider.
        ///
        /// This is the primary recovery path for chapters incorrectly marked as missing —
        /// e.g. after a previous Cleanup ran while a file was temporarily locked, after
        /// a folder/title rename, or whenever the DB → file link was broken but the file
        /// is still on disk.
        /// </summary>
        private async Task ReconcileOrphanedFilesAsync(SeriesEntity series, string basePath, CancellationToken token)
        {
            if (!Directory.Exists(basePath))
                return;

            List<string> filesOnDisk;
            try
            {
                filesOnDisk = Directory.EnumerateFiles(basePath)
                    .Select(Path.GetFileName)
                    .Where(n => !string.IsNullOrEmpty(n))
                    .Select(n => n!)
                    .ToList();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to enumerate storage folder for reconciliation: {Path}", basePath);
                return;
            }

            if (filesOnDisk.Count == 0)
                return;

            // Set of basenames that exist on disk — used to validate existing DB links.
            HashSet<string> diskBasenames = new HashSet<string>(filesOnDisk, StringComparer.OrdinalIgnoreCase);

            // Basenames already linked from any chapter row AND still present on disk —
            // these are off-limits for re-linking, otherwise we'd point two chapter rows
            // at the same archive. A DB Filename pointing at a non-existent file is NOT
            // considered "linked" — those rows are candidates for re-linking too.
            HashSet<string> alreadyLinked = series.Sources
                .SelectMany(s => s.Chapters)
                .Select(c => c.Filename)
                .Where(f => !string.IsNullOrEmpty(f) && diskBasenames.Contains(f!))
                .Select(f => f!)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            // Parse every disk file once. Files we can't parse (legacy/imported archives
            // that don't match the Kaizoku pattern) are skipped — they were never reconcilable
            // via this path anyway.
            var parsedFiles = new List<(string Basename, ParsedFileKey Key)>();
            foreach (string name in filesOnDisk)
            {
                if (alreadyLinked.Contains(name))
                    continue;
                var (key, ok) = TryParseKaizokuFilename(name);
                if (!ok)
                    continue;
                parsedFiles.Add((name, key));
            }

            if (parsedFiles.Count == 0)
                return;

            bool update = false;

            foreach (SeriesProviderEntity sp in series.Sources)
            {
                if (sp.IsUnknown)
                    continue;

                string providerLower = sp.Provider?.Trim().ToLowerInvariant() ?? "";
                string languageLower = sp.Language?.Trim().ToLowerInvariant() ?? "en";
                string? scanlatorLower = string.IsNullOrEmpty(sp.Scanlator)
                    ? null
                    : sp.Scanlator.Trim().ToLowerInvariant();

                if (string.IsNullOrEmpty(providerLower))
                    continue;

                // Candidates for re-linking: rows whose DB Filename is empty, OR whose
                // current Filename points at a file that is no longer present on disk
                // (stale link from a previous rename or filename-padding shift).
                foreach (Chapter ch in sp.Chapters.Where(c => !c.IsDeleted
                    && c.Number.HasValue
                    && (string.IsNullOrEmpty(c.Filename) || !diskBasenames.Contains(c.Filename!))))
                {
                    decimal chapterNumber = ch.Number!.Value;

                    // Prefer exact (provider, lang, scanlator, chapter) matches first, then
                    // fall back to ignoring scanlator if no exact match is found.
                    (string Basename, ParsedFileKey Key)? best = null;
                    foreach (var pf in parsedFiles)
                    {
                        if (pf.Key.Chapter != chapterNumber) continue;
                        if (!pf.Key.Provider.Equals(providerLower, StringComparison.InvariantCultureIgnoreCase)) continue;
                        if (!pf.Key.Language.Equals(languageLower, StringComparison.InvariantCultureIgnoreCase)) continue;

                        bool scanlatorMatches = scanlatorLower == null
                            ? string.IsNullOrEmpty(pf.Key.Scanlator)
                            : pf.Key.Scanlator?.Equals(scanlatorLower, StringComparison.InvariantCultureIgnoreCase) == true;

                        if (scanlatorMatches)
                        {
                            best = pf;
                            break;
                        }
                        // Remember a loose match in case nothing scanlator-exact shows up.
                        if (best == null)
                            best = pf;
                    }

                    if (best == null)
                        continue;

                    string match = best.Value.Basename;
                    ch.Filename = match;
                    ch.ShouldDownload = false;
                    ch.IsDeleted = false;
                    if (ch.DownloadDate == null)
                    {
                        try
                        {
                            ch.DownloadDate = File.GetLastWriteTimeUtc(Path.Combine(basePath, match));
                        }
                        catch
                        {
                            // Non-fatal — leave DownloadDate null if we cannot stat the file.
                        }
                    }
                    alreadyLinked.Add(match);
                    parsedFiles.RemoveAll(p => p.Basename.Equals(match, StringComparison.OrdinalIgnoreCase));
                    _db.Touch(sp, c => c.Chapters);
                    update = true;
                    _logger.LogInformation(
                        "Reconciled orphaned file \"{File}\" → series {Series} provider {Provider} chapter {Chapter}",
                        match, series.Title, sp.Provider, chapterNumber);
                }
            }

            if (update)
                await _db.SaveChangesAsync(token).ConfigureAwait(false);
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
                // Unreadable means the archive could not be opened — likely a transient
                // I/O issue (locked file, share hiccup) rather than corruption. Skip
                // entirely so we do not delete a healthy file or wipe its DB linkage.
                if (r.Result == ArchiveResult.Unreadable)
                {
                    _logger.LogInformation(
                        "Skipping unreadable file during cleanup (transient failure assumed): {File}",
                        Path.Combine(basePath, r.Filename));
                    continue;
                }

                string finalName = Path.Combine(basePath, r.Filename);
                bool isDeletable = r.Result == ArchiveResult.NoImages || r.Result == ArchiveResult.NotAnArchive;
                if (isDeletable)
                {
                    try
                    {
                        File.Delete(finalName);
                    }
                    catch (Exception)
                    {
                        _logger.LogWarning("Unable to delete file {finalName}", finalName);
                    }
                }

                // Only sever the DB → file link when the file is genuinely gone from disk.
                // If the delete failed (or was skipped) and the file still exists, leaving
                // Filename intact preserves the user's ability to recover without losing
                // the chapter history.
                if (File.Exists(finalName))
                {
                    _logger.LogWarning(
                        "File still exists after cleanup attempt — preserving DB linkage: {File}", finalName);
                    continue;
                }

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