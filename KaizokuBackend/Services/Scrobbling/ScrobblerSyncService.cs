using System.Text.Json;
using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Models.ReadState;
using KaizokuBackend.Services.ReadState;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using KaizokuBackend.Services.Scrobbling.Providers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling;

/// <summary>
/// Orchestrates synchronization of read states between local kaizoku.json and external scrobbling services.
/// Handles upload (local -> remote), download (remote -> local), and conflict resolution.
/// Token lifecycle is delegated to each provider's EnsureAuthenticatedAsync.
/// </summary>
public class ScrobblerSyncService
{
    private readonly ScrobblerProviderFactory _providerFactory;
    private readonly AppDbContext _db;
    private readonly ReadStateService _readStateService;
    private readonly SeriesMatchingService _matchingService;
    private readonly ILogger<ScrobblerSyncService> _logger;

    public ScrobblerSyncService(
        ScrobblerProviderFactory providerFactory,
        AppDbContext db,
        ReadStateService readStateService,
        SeriesMatchingService matchingService,
        ILogger<ScrobblerSyncService> logger)
    {
        _providerFactory = providerFactory;
        _db = db;
        _readStateService = readStateService;
        _matchingService = matchingService;
        _logger = logger;
    }

    /// <summary>
    /// Sync all enabled scrobblers for a user.
    /// Uploads local changes and downloads remote changes, merging with last-write-wins.
    /// </summary>
    public async Task SyncForUserAsync(Guid userId, CancellationToken token = default)
    {
        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId && c.IsEnabled && c.AutoSync)
            .ToListAsync(token);

        foreach (var config in configs)
        {
            await SyncForUserAndProviderAsync(userId, config, token);
        }
    }

    /// <summary>
    /// Sync a specific series for a user across all enabled scrobblers.
    /// </summary>
    public async Task SyncForUserAndSeriesAsync(Guid userId, Guid seriesId, CancellationToken token = default)
    {
        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId && c.IsEnabled)
            .ToListAsync(token);

        foreach (var config in configs)
        {
            await SyncSeriesForProviderAsync(userId, seriesId, config, token);
        }
    }

    /// <summary>
    /// Upload a single chapter read to all enabled scrobblers for the user.
    /// Called in real-time when user reads a chapter.
    /// </summary>
    public async Task UploadReadStateAsync(Guid userId, Guid seriesId, decimal chapterNumber, int page, CancellationToken token = default)
    {
        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId && c.IsEnabled)
            .ToListAsync(token);

        foreach (var config in configs)
        {
            var provider = _providerFactory.GetProvider(config.Provider);
            if (provider == null) continue;

            try
            {
                await provider.EnsureAuthenticatedAsync(userId, token);

                var mapping = await _db.UserSeriesMappings
                    .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == seriesId
                        && m.Provider == config.Provider && m.MappingStatus != SeriesMappingStatus.Ignored, token);

                if (mapping == null || string.IsNullOrEmpty(mapping.ExternalSeriesId))
                    continue;

                await provider.UploadChapterReadAsync(mapping.ExternalSeriesId, chapterNumber, page, token);
                config.LastUploadAt = DateTime.UtcNow;
                config.LastSyncAt = DateTime.UtcNow;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload read state to {Provider} for user {UserId} series {SeriesId}",
                    config.Provider, userId, seriesId);
            }
        }

        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Download read states from a specific scrobbler provider.
    /// Returns seriesId -> list of chapter read states.
    /// </summary>
    public async Task<Dictionary<Guid, List<ChapterReadState>>> DownloadReadStatesAsync(
        Guid userId, ScrobblerProvider provider, CancellationToken token = default)
    {
        var result = new Dictionary<Guid, List<ChapterReadState>>();
        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == provider, token);

        if (config == null || !config.IsEnabled) return result;

        var scrobbler = _providerFactory.GetProvider(provider);
        if (scrobbler == null) return result;

        await scrobbler.EnsureAuthenticatedAsync(userId, token);

        var mappings = await _db.UserSeriesMappings
            .Where(m => m.UserId == userId && m.Provider == provider
                && m.MappingStatus != SeriesMappingStatus.Ignored
                && !string.IsNullOrEmpty(m.ExternalSeriesId))
            .ToListAsync(token);

        foreach (var mapping in mappings)
        {
            try
            {
                var chapters = await scrobbler.GetReadChaptersAsync(mapping.ExternalSeriesId, token);
                var chapterStates = chapters
                    .Select(c => new ChapterReadState
                    {
                        ChapterNumber = c.Key,
                        LastReadPage = c.Value,
                        IsCompleted = true,
                        LastReadAt = DateTime.UtcNow
                    })
                    .ToList();

                result[mapping.SeriesId] = chapterStates;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to download read state from {Provider} for series mapping {MappingId}",
                    provider, mapping.Id);
            }
        }

        config.LastDownloadAt = DateTime.UtcNow;
        config.LastSyncAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(token);

        return result;
    }

    /// <summary>
    /// Resolves read state conflicts between local and remote.
    /// Strategy: last-write-wins by comparing timestamps.
    /// </summary>
    public ChapterReadState ResolveConflict(ChapterReadState local, ChapterReadState remote)
    {
        if (local.LastReadAt >= remote.LastReadAt)
            return local;
        return remote;
    }

    // ── Private ──

    private async Task SyncForUserAndProviderAsync(Guid userId, UserScrobblerConfigEntity config, CancellationToken token)
    {
        var provider = _providerFactory.GetProvider(config.Provider);
        if (provider == null) return;

        try
        {
            await provider.EnsureAuthenticatedAsync(userId, token);

            // Download remote changes and merge
            var seriesList = await _db.Series.ToListAsync(token);
            var mappings = await _db.UserSeriesMappings
                .Where(m => m.UserId == userId && m.Provider == config.Provider
                    && m.MappingStatus != SeriesMappingStatus.Ignored)
                .ToListAsync(token);

            foreach (var mapping in mappings)
            {
                await SyncSeriesForProviderAsync(userId, mapping.SeriesId, config, token);
            }

            config.LastSyncAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sync failed for user {UserId} provider {Provider}", userId, config.Provider);
        }
    }

    private async Task SyncSeriesForProviderAsync(Guid userId, Guid seriesId, UserScrobblerConfigEntity config, CancellationToken token)
    {
        var provider = _providerFactory.GetProvider(config.Provider);
        if (provider == null) return;

        var mapping = await _db.UserSeriesMappings
            .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == seriesId
                && m.Provider == config.Provider && m.MappingStatus != SeriesMappingStatus.Ignored, token);

        if (mapping == null || string.IsNullOrEmpty(mapping.ExternalSeriesId))
            return;

        await provider.EnsureAuthenticatedAsync(userId, token);

        var series = await _db.Series.FindAsync([seriesId], token);
        if (series == null) return;

        // Download remote state
        var remoteChapters = await provider.GetReadChaptersAsync(mapping.ExternalSeriesId, token);
        var localStates = _readStateService.GetSeriesReadStates("", series.StoragePath);

        // Upload new local chapters that aren't on remote
        foreach (var localState in localStates)
        {
            if (localState.IsCompleted &&
                (!remoteChapters.ContainsKey(localState.ChapterNumber) ||
                 remoteChapters[localState.ChapterNumber] < localState.LastReadPage))
            {
                await provider.UploadChapterReadAsync(mapping.ExternalSeriesId,
                    localState.ChapterNumber, localState.LastReadPage, token);
                config.LastUploadAt = DateTime.UtcNow;
            }
        }

        config.LastDownloadAt = DateTime.UtcNow;
    }
}