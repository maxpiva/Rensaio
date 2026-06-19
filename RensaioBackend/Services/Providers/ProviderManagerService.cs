using RensaioBackend.Data;
using RensaioBackend.Extensions;
using RensaioBackend.Models;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Bridge;
using RensaioBackend.Services.Settings;
using Microsoft.EntityFrameworkCore;
using Mihon.ExtensionsBridge.Core.Extensions;
using Mihon.ExtensionsBridge.Models;
using Mihon.ExtensionsBridge.Models.Abstractions;
using Mihon.ExtensionsBridge.Models.Extensions;
using System.Text.Json;

namespace RensaioBackend.Services.Providers
{
    /// <summary>
    /// Service for provider installation and uninstallation operations following SRP
    /// </summary>
    public class ProviderManagerService
    {
        private readonly MihonBridgeService _mihon;
        private readonly SettingsService _settingsService;
        private readonly ProviderCacheService _providerCache;
        private readonly ILogger<ProviderManagerService> _logger;
        private readonly AppDbContext _db;

        public ProviderManagerService(MihonBridgeService mihon, AppDbContext db, SettingsService settingsService, ProviderCacheService providerCache, ILogger<ProviderManagerService> logger)
        {
            _mihon = mihon;
            _providerCache = providerCache;
            _logger = logger;
            _db = db;
            _settingsService = settingsService;
        }
        /// <summary>
        /// Gets required extensions for a list of provider infos
        /// </summary>
        /// <param name="ImportProviderSnapshots">List of provider information</param>
        /// <param name="token">Cancellation token</param>
        /// <returns>List of required extensions</returns>
        public async Task<Dictionary<TachiyomiExtension, TachiyomiRepository>> GetRequiredExtensionsAsync(List<ImportProviderSnapshot> ImportProviderSnapshots, CancellationToken token = default)
        {
            try
            {
                var cached = await _providerCache.GetCachedProvidersAsync(token).ConfigureAwait(false);
                var repos =_mihon.ListOnlineRepositories();
                var requiredExtensions = new Dictionary<TachiyomiExtension, TachiyomiRepository>();
                foreach (ImportProviderSnapshot info in ImportProviderSnapshots)
                {
                    (TachiyomiRepository? Repository, TachiyomiExtension? Extension, TachiyomiSource? Source) = repos.FindFromNameAndLanguage(info.Provider, info.Language);
                    if (Source!=null)
                    {
                        if (!requiredExtensions.ContainsKey(Extension!))
                        {
                            requiredExtensions.Add(Extension!, Repository!);
                        }
                    }
                }
                return requiredExtensions;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting required extensions");
                return [];
            }
        }
        private async Task AddRepoAsync(RepositoryGroup group, TachiyomiSource source, TachiyomiRepository? orepo, bool enabled =true, CancellationToken token = default)
        {
            RepositoryEntry entry = group.GetActiveEntry();
            TachiyomiExtension? extension = entry?.Extension;
            string? mihonProviderId = extension?.GetMihonProviderId(source);
            if (string.IsNullOrEmpty(mihonProviderId))
            {
                _logger.LogWarning("Mihon provider ID is null or empty for source {SourceName}", source.Name);
                return;
            }
            ProviderStorageEntity? storage = await _db.Providers.FirstOrDefaultAsync(a => a.MihonProviderId == mihonProviderId);
            if (storage == null)
            {
                storage = new ProviderStorageEntity();
                storage.MihonProviderId = mihonProviderId;
                _db.Providers.Add(storage);
            }
            storage.Name = source.Name;
            storage.Language = source.Language;
            storage.SourceRepositoryId = orepo?.Id;
            storage.SourceRepositoryName = orepo?.Name;
            storage.SourcePackageName = extension?.Package ?? "";
            storage.SourceSourceId = source.Id;
            storage.ThumbnailUrl = "ext://" + Path.Combine(entry?.GetRelativeVersionFolder() ?? "", entry?.Icon?.FileName ?? "");
            ISourceInterop? interop = await _mihon.SourceFromProviderIdAsync(storage.MihonProviderId, token).ConfigureAwait(false);
            storage.SupportLatest = interop.SupportsLatest;
            storage.IsNSFW = extension?.Nsfw == 1;
            storage.IsDead = false;
            storage.IsEnabled = enabled;
            storage.IsBroken = false;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);

            // Reconnect local SeriesProviders that match this newly installed source
            await ReconnectLocalSeriesProvidersAsync(mihonProviderId, source.Name, source.Language, token).ConfigureAwait(false);

            await _providerCache.RefreshCacheAsync(false, token).ConfigureAwait(false);
        }


        /// <summary>
        /// Gets a list of all available extensions (installed and available to install)
        /// </summary>
        /// <returns>List of extensions</returns>
        public async Task<List<ExtensionDto>> GetProvidersAsync(CancellationToken token = default)
        {
            try
            {
                //Local pass
                Dictionary<string, ExtensionDto> providers  = new Dictionary<string, ExtensionDto>();
                List<RepositoryGroup> localRepos = _mihon.ListExtensions();
                List<ProviderStorageEntity> storages = await _providerCache.GetCachedProvidersAsync(token).ConfigureAwait(false);
                foreach (RepositoryGroup repo in localRepos)
                {
                    RepositoryEntry entry = repo.GetActiveEntry();
                    TachiyomiExtension? extension = entry?.Extension;
                    ProviderStorageEntity? existing = storages.FirstOrDefault(a => a.SourcePackageName == entry?.Extension?.Package);
                    if (existing != null && extension!=null)
                    {
                        ExtensionDto v = extension.ToExtensionInfo();
                        ExtensionRepositoryDto repoview = new ExtensionRepositoryDto();
                        if (!string.IsNullOrEmpty(existing.SourceRepositoryId))
                        {
                            repoview.Id = existing.SourceRepositoryId;
                            repoview.Name = existing.SourceRepositoryName!;
                        }
                        else
                        {
                            repoview.Name = "Local";
                            repoview.Id = "";
                        }
                        repoview.Entries = repo.Entries.Select(a => a.ToExtensionEntry(repoview.Name, repoview.Id)).ToList();
                        v.IsEnabled = existing.IsEnabled;
                        v.IsStorage = existing.IsStorage;
                        v.IsDead = existing.IsDead;
                        v.IsBroken = existing.IsBroken;
                        v.IsInstaled = true;
                        v.ActiveEntry = repo.ActiveEntry;
                        v.Repositories = new List<ExtensionRepositoryDto>() { repoview };
                        v.ThumbnailUrl = "ext://" + Path.Combine(entry?.GetRelativeVersionFolder() ?? "", entry?.Icon?.FileName ?? "");
                        if (!providers.ContainsKey(v.Package))
                        {
                            providers.Add(v.Package, v);
                        }
                    }
                }

                //Online pass
                List<TachiyomiRepository> orepos = _mihon.ListOnlineRepositories();
                foreach (TachiyomiRepository orepo in orepos)
                {
                    foreach (TachiyomiExtension ext in orepo.Extensions)
                    {
                        ExtensionRepositoryDto repoview = new ExtensionRepositoryDto();
                        repoview.Id = orepo.Id;
                        repoview.Name = orepo.Name;
                        repoview.Entries = new List<ExtensionEntryDto> { ext.ToExtensionEntry(repoview.Name, repoview.Id) };
                        if (providers.ContainsKey(ext.Package))
                        {
                            ExtensionDto ev = providers[ext.Package];
                            if (ev.IsInstaled)
                                continue; //Already Populated in local
                            ev.Repositories.Add(repoview); // Same package in another repo
                            continue;
                        }
                        ExtensionDto v = ext.ToExtensionInfo();
                        v.Repositories = new List<ExtensionRepositoryDto>() { repoview };
                        RepositoryEntry entry = new RepositoryEntry
                        {
                            Extension = ext,
                            RepositoryId = orepo.Id
                        };
                        v.ThumbnailUrl = ext.GetIconUrl(orepo);
                        providers.Add(v.Package, v);
                    }
                }
                return providers.Values.OrderBy(a=> a.Name).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving extensions");
                throw;
            }
        }


     
        /// <summary>
        /// Installs an extension by package name
        /// </summary>
        /// <param name="pkgName">Package name of the extension</param>
        /// <param name="token">Cancellation token</param>
        /// <returns>True if installation was successful</returns>
        public async Task<bool> InstallProviderAsync(string pkgName, string? repoName, bool force, CancellationToken token = default)
        {
            try
            {
                _logger.LogInformation("Installing provider: {PkgName}", pkgName);
                await _mihon.RefreshAllRepositoriesAsync();
                var online = _mihon.ListOnlineRepositories();
                var extensions = _mihon.ListExtensions();
                Func<RepositoryEntry, bool> predicate = a => true;
                string? repoId = null;
                if (!string.IsNullOrWhiteSpace(repoName))
                {
                    repoId = online.FirstOrDefault(a => a.Name.Equals(repoName, StringComparison.OrdinalIgnoreCase))?.Id ?? string.Empty;
                    if (string.IsNullOrEmpty(repoId))
                    {
                        _logger.LogWarning("Repository {RepoName} not found among online repositories", repoName);
                        return false;
                    }
                    predicate = a => a.RepositoryId == repoId;
                }
                TachiyomiRepository? orepo;
                if (repoId != null)
                {
                    orepo = online.First(a => a.Id == repoId);
                }
                else
                {
                    orepo = online.FirstOrDefault(a => a.Extensions.Any(e => e.Package == pkgName));
                }
                if (orepo == null)
                {
                    _logger.LogInformation("No online repository contains provider {PkgName}", pkgName);
                    return false;
                }
                var entry = orepo.Extensions.FirstOrDefault(a => a.Package == pkgName);
                if (entry == null)
                {
                    _logger.LogInformation("Provider {PkgName} not found in online repositories", pkgName);
                    return false;
                }
                RepositoryGroup? g = await _mihon.AddExtensionAsync(entry, force, token).ConfigureAwait(false);
                if (g == null)
                {
                    _logger.LogWarning("Failed to add provider {PkgName} to local extensions", pkgName);
                    return false;
                }

                // Re-enable existing providers and restore SeriesProvider state
                await ReEnableProvidersForPackageAsync(pkgName, token).ConfigureAwait(false);
                await _providerCache.RefreshCacheAsync(false, token).ConfigureAwait(false);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error installing provider {PkgName}", pkgName);
                return false;
            }
        }

        /// <summary>
        /// Installs an extension by package name
        /// </summary>
        /// <param name="token">Cancellation token</param>
        /// <returns>True if installation was successful</returns>
        public async Task<string?> InstallProviderFromFileAsync(byte[] content, bool force, CancellationToken token = default)
        {
            try
            {
                _logger.LogInformation("Installing provider...");
                var repo = await _mihon.AddExtensionAsync(content, false, token).ConfigureAwait(false);
                if (repo == null)
                {
                    _logger.LogWarning("Failed to add provider local extensions");
                    return null;
                }
                _logger.LogInformation("Provider {name} added to local extensions", repo.Name);

                // Re-enable existing providers and restore SeriesProvider state
                string pkgName = repo.GetActiveEntry().Extension.Package;
                await ReEnableProvidersForPackageAsync(pkgName, token).ConfigureAwait(false);
                await _providerCache.RefreshCacheAsync(false, token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error installing provider");
            }
            return null;
        }


        /// <summary>
        /// Re-enables existing providers for a package and restores SeriesProvider state on install.
        /// Sets IsEnabled=true, IsDead=false, IsBroken=false on ProviderStorageEntity,
        /// sets IsUninstalled=false on previously uninstalled SeriesProviderEntity entries,
        /// and attempts to reconnect local SeriesProviders that match this package's sources.
        /// </summary>
        private async Task ReEnableProvidersForPackageAsync(string pkgName, CancellationToken token)
        {
            var existingStorages = await _db.Providers
                .Where(a => a.SourcePackageName == pkgName)
                .ToListAsync(token).ConfigureAwait(false);

            foreach (var storage in existingStorages)
            {
                storage.IsEnabled = true;
                storage.IsDead = false;
                storage.IsBroken = false;
            }

            var mihonProviderIds = existingStorages.Select(a => a.MihonProviderId).ToList();
            if (mihonProviderIds.Count > 0)
            {
                var seriesProviders = await _db.SeriesProviders
                    .Where(sp => sp.MihonProviderId!=null && mihonProviderIds.Contains(sp.MihonProviderId) && sp.IsUninstalled)
                    .ToListAsync(token).ConfigureAwait(false);
                seriesProviders.ForEach(sp => sp.IsUninstalled = false);
            }

            if (existingStorages.Count > 0)
                await _db.SaveChangesAsync(token).ConfigureAwait(false);

            // Reconnect local SeriesProviders that match each source in this package
            foreach (var storage in existingStorages)
            {
                await ReconnectLocalSeriesProvidersAsync(storage.MihonProviderId, storage.Name, storage.Language, token)
                    .ConfigureAwait(false);
            }
        }

        /// <summary>
        /// Uninstalls an extension by package name
        /// </summary>
        /// <param name="pkgName">Package name of the extension</param>
        /// <param name="token">Cancellation token</param>
        /// <returns>True if uninstallation was successful</returns>
        public async Task<bool> DisableProviderAsync(string pkgName, CancellationToken token = default)
        {
            try
            {
                _logger.LogInformation("Uninstalling provider: {PkgName}", pkgName);

                // 1. Set IsEnabled = false on all providers for this package
                List<ProviderStorageEntity> storages = await _db.Providers
                    .Where(a => a.SourcePackageName == pkgName)
                    .ToListAsync(token).ConfigureAwait(false);
                storages.ForEach(a => a.IsEnabled = false);

                // 2. Mark all related SeriesProvider entries as uninstalled/local
                // Preserve MihonProviderId, MihonId and BridgeItemInfo so they can
                // be used for reconnection when the extension is reinstalled.
                var mihonProviderIds = storages.Select(a => a.MihonProviderId).ToList();
                if (mihonProviderIds.Count > 0)
                {
                    var seriesProviders = await _db.SeriesProviders
                        .Where(sp => sp.MihonProviderId != null && mihonProviderIds.Contains(sp.MihonProviderId))
                        .ToListAsync(token).ConfigureAwait(false);
                    foreach (var sp in seriesProviders)
                    {
                        sp.IsUninstalled = true;
                        sp.IsLocal = true;
                    }
                }

                await _db.SaveChangesAsync(token).ConfigureAwait(false);

                // 3. Remove from Mihon bridge
                var extensions = _mihon.ListExtensions();
                var group = extensions.FirstOrDefault(a =>
                    a.GetActiveEntry().Extension.Package.Equals(pkgName, StringComparison.OrdinalIgnoreCase));
                if (group != null)
                {
                    await _mihon.RemoveExtensionAsync(group, token).ConfigureAwait(false);
                }

                // 4. Refresh cache (handles job scheduling)
                await _providerCache.RefreshCacheAsync(false, token).ConfigureAwait(false);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error disabling provider {PkgName}", pkgName);
                return false;
            }
        }


        public async Task<bool> SetProviderVersionAsync(string pkgName, string version, bool autoUpdate = true, CancellationToken token = default)
        {
            try
            {
                _logger.LogInformation("Activating provider: {PkgName} version {version}", pkgName, version);
                var extensions = _mihon.ListExtensions();
                RepositoryGroup? combo = extensions.FirstOrDefault(a => a.Entries.Any(b => b.Extension.Package == pkgName && b.Extension.Version == version));
                if (combo==null)
                {
                    _logger.LogWarning("Provider {PkgName} version {version} not found in local extensions.", pkgName, version);
                    return false;
                }
                combo.ActiveEntry = combo.Entries.IndexOf(combo.Entries.First(b => b.Extension.Package == pkgName && b.Extension.Version == version));
                combo.AutoUpdate = autoUpdate;
                combo = await _mihon.SetActiveExtensionVersionAsync(combo, token).ConfigureAwait(false);
                await _providerCache.RefreshCacheAsync(false, token).ConfigureAwait(false);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error Activating provider: {PkgName} version {version}", pkgName, version);
                return false;
            }
        }

        /// <summary>
        /// Attempts to reconnect local SeriesProviders that have the exact same Provider name and Language
        /// as a newly installed source extension. Uses BridgeItemInfo first (GetDetailsAsync), then falls
        /// back to SearchAsync with the series title.
        /// </summary>
        /// <param name="mihonProviderId">The Mihon provider ID of the installed source</param>
        /// <param name="sourceName">The source provider name</param>
        /// <param name="language">The source language</param>
        /// <param name="token">Cancellation token</param>
        private async Task ReconnectLocalSeriesProvidersAsync(string mihonProviderId, string sourceName, string language, CancellationToken token)
        {
            try
            {
                // Find local SeriesProviders matching this source name + language.
                // Matches both:
                //   1. Fresh local providers (no MihonProviderId) — never connected
                //   2. Uninstalled providers (IsLocal=true, IsUninstalled=true) with preserved Mihon fields
                var localProviders = await _db.SeriesProviders
                    .Where(sp => sp.IsLocal && !sp.IsUnknown &&
                                 sp.Provider == sourceName &&
                                 sp.Language == language)
                    .ToListAsync(token).ConfigureAwait(false);

                if (localProviders.Count == 0)
                    return;

                // Get the source interop for resolution
                ISourceInterop? src;
                try
                {
                    src = await _mihon.SourceFromProviderIdAsync(mihonProviderId, token).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not get source interop for {MihonProviderId} when trying to reconnect local providers", mihonProviderId);
                    return;
                }

                foreach (var provider in localProviders)
                {
                    _logger.LogInformation("Attempting to reconnect local provider '{Provider}' (SeriesId: {SeriesId}) to source '{Source}'",
                        provider.Provider, provider.SeriesId, sourceName);

                    // Step 1: Try BridgeItemInfo first
                    Manga? manga = null;
                    bool resolved = false;

                    if (!string.IsNullOrEmpty(provider.BridgeItemInfo))
                    {
                        manga = JsonSerializer.Deserialize<Manga>(provider.BridgeItemInfo);
                        if (manga != null)
                        {
                            try
                            {
                                var refreshed = await _mihon.MihonErrorWrapperAsync(
                                    () => src.GetDetailsAsync(manga, token),
                                    "Unable to refresh Details for Series {Title} from {Provider}",
                                    provider.Title, provider.Provider).ConfigureAwait(false);

                                if (refreshed != null)
                                {
                                    manga = refreshed;
                                    resolved = true;
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "Failed to get details via BridgeItemInfo for {Title} from {Provider}, falling back to search",
                                    provider.Title, provider.Provider);
                            }
                        }
                    }

                    // Step 2: Fallback to search
                    if (!resolved && !string.IsNullOrWhiteSpace(provider.Title))
                    {
                        try
                        {
                            var searchResults = await _mihon.MihonErrorWrapperAsync(
                                () => src.SearchAsync(1, provider.Title, token),
                                "Unable to Search for Series {Title} from {Provider}",
                                provider.Title, provider.Provider).ConfigureAwait(false);

                            // Use exact match or closest by Levenshtein distance (same as MigrationService pattern)
                            Manga? selected = SelectBestManga(searchResults?.Mangas, provider.Title);
                            if (selected != null)
                            {
                                var details = await _mihon.MihonErrorWrapperAsync(
                                    () => src.GetDetailsAsync(selected, token),
                                    "Unable to get Details for Series {Title} from {Provider}",
                                    provider.Title, provider.Provider).ConfigureAwait(false);

                                if (details != null)
                                {
                                    manga = details;
                                    resolved = true;
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to resolve via search for {Title} from {Provider}",
                                provider.Title, provider.Provider);
                        }
                    }

                    if (resolved && manga != null)
                    {
                        // Fill all provider fields from the resolved manga
                        provider.MihonProviderId = mihonProviderId;
                        provider.MihonId = mihonProviderId + "|" + manga.Url;
                        provider.BridgeItemInfo = JsonSerializer.Serialize(manga);
                        provider.IsLocal = false;
                        provider.IsUninstalled = false;
                        provider.Url = manga.Url;
                        if (!string.IsNullOrWhiteSpace(manga.Title))
                            provider.Title = manga.Title;
                        if (!string.IsNullOrWhiteSpace(manga.Artist))
                            provider.Artist = manga.Artist;
                        if (!string.IsNullOrWhiteSpace(manga.Author))
                            provider.Author = manga.Author;
                        if (!string.IsNullOrWhiteSpace(manga.Description))
                            provider.Description = manga.Description;
                        if (!string.IsNullOrWhiteSpace(manga.ThumbnailUrl))
                            provider.ThumbnailUrl = manga.ThumbnailUrl;
                        if (manga.Genre != null)
                            provider.Genre = manga.Genre.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
                        provider.Status = (SeriesStatus)(int)manga.Status;

                        _db.Touch(provider, sp => sp.Chapters);
                        _logger.LogInformation("Successfully reconnected local provider '{Provider}' (SeriesId: {SeriesId}) to source '{Source}'",
                            provider.Provider, provider.SeriesId, sourceName);
                    }
                    else
                    {
                        _logger.LogWarning("Could not resolve series '{Title}' from provider '{Provider}' (SeriesId: {SeriesId}). Keeping as local provider.",
                            provider.Title, provider.Provider, provider.SeriesId);
                    }
                }

                await _db.SaveChangesAsync(token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reconnecting local providers for source {Source} ({Lang})", sourceName, language);
            }
        }

        /// <summary>
        /// Selects the best matching manga from search results.
        /// First tries exact title match, then falls back to closest by Levenshtein distance.
        /// </summary>
        private static Manga? SelectBestManga(IReadOnlyCollection<Manga>? candidates, string? targetTitle)
        {
            if (candidates == null || candidates.Count == 0)
                return null;

            if (!string.IsNullOrWhiteSpace(targetTitle))
            {
                var exact = candidates.FirstOrDefault(m => string.Equals(m.Title, targetTitle, StringComparison.OrdinalIgnoreCase));
                if (exact != null)
                    return exact;
            }

            return SelectClosestByDistance(candidates, targetTitle);
        }

        /// <summary>
        /// Selects the manga with the closest title match using Levenshtein distance.
        /// </summary>
        private static Manga? SelectClosestByDistance(IReadOnlyCollection<Manga>? candidates, string? targetTitle)
        {
            if (candidates == null || candidates.Count == 0)
                return null;

            if (string.IsNullOrWhiteSpace(targetTitle))
                return candidates.FirstOrDefault();

            var normalizedTarget = targetTitle.Trim();
            Manga? best = null;
            var bestDistance = int.MaxValue;

            foreach (var candidate in candidates)
            {
                if (candidate == null || string.IsNullOrWhiteSpace(candidate.Title))
                    continue;

                var distance = ComputeLevenshteinDistance(candidate.Title, normalizedTarget);
                if (distance < bestDistance)
                {
                    bestDistance = distance;
                    best = candidate;
                }
            }

            return best ?? candidates.FirstOrDefault();
        }

        /// <summary>
        /// Computes the Levenshtein distance between two strings.
        /// </summary>
        private static int ComputeLevenshteinDistance(string source, string target)
        {
            if (string.IsNullOrEmpty(source))
                return string.IsNullOrEmpty(target) ? 0 : target.Length;
            if (string.IsNullOrEmpty(target))
                return source.Length;

            var sourceLength = source.Length;
            var targetLength = target.Length;
            var matrix = new int[sourceLength + 1, targetLength + 1];

            for (var i = 0; i <= sourceLength; matrix[i, 0] = i++) { }
            for (var j = 0; j <= targetLength; matrix[0, j] = j++) { }

            for (var i = 1; i <= sourceLength; i++)
            {
                for (var j = 1; j <= targetLength; j++)
                {
                    var cost = (target[j - 1] == source[i - 1]) ? 0 : 1;
                    matrix[i, j] = Math.Min(
                        Math.Min(matrix[i - 1, j] + 1, matrix[i, j - 1] + 1),
                        matrix[i - 1, j - 1] + cost);
                }
            }

            return matrix[sourceLength, targetLength];
        }
    }
}
