using RensaioBackend.Data;
using RensaioBackend.Migration.Models;
using RensaioBackend.Models.Database;
using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;
using RensaioBackend.Models.ReadState;
using RensaioBackend.Services.ReadState;
using RensaioBackend.Services.Scrobbling.Abstractions;
using RensaioBackend.Services.Scrobbling.Providers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace RensaioBackend.Services.Scrobbling;

/// <summary>
/// Orchestrates synchronization of read states between local rensaio.json and external scrobbling services.
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
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, token);
        if (user == null)
            return;
        foreach (var config in configs)
        {
            await SyncForUserAndProviderAsync(user, config, token);
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
        var series = await _db.Series.FirstOrDefaultAsync(a => a.Id == seriesId, token);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, token);
        if (user == null || series == null)
            return;
        foreach (var config in configs)
        {

            var mapping = await _db.UserSeriesMappings
                .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == seriesId
                    && m.Provider == config.Provider && m.MappingStatus != SeriesMappingStatus.Ignored, token);
            if (mapping == null)
                continue;
            await SyncSeriesForProviderAsync(user, series, mapping, config, token);
        }
    }
    public async Task UpdateForUserAndSeriesAsync(Guid userId, Guid seriesId, List<ChapterReadState> localStates, CancellationToken token = default)
    {
        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId && c.IsEnabled)
            .ToListAsync(token);
        var series = await _db.Series.FirstOrDefaultAsync(a => a.Id == seriesId, token);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, token);
        if (user == null || series == null)
            return;
        foreach (var config in configs)
        {
            var provider = _providerFactory.GetProvider(config.Provider);
            if (provider == null) continue;
            try
            {
                var mapping = await _db.UserSeriesMappings
                .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == seriesId
                    && m.Provider == config.Provider && m.MappingStatus != SeriesMappingStatus.Ignored, token);
                if (mapping == null)
                    continue;
                await provider.EnsureAuthenticatedAsync(user.Id, token);
                Dictionary<decimal, float> states = localStates.ToDictionary(s => s.ChapterNumber, s => s.Progress);
                await provider.SetReadChaptersAsync(mapping.ExternalSeriesId, states, token);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Sync failed for user {Username} provider {Provider}", user.Username, config.Provider);
            }
        }
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
                        Progress = c.Value,
                        LastReadDeviceId="",
                        LastReadDeviceName="Rensaiō",
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

    private async Task SyncForUserAndProviderAsync(UserEntity user, UserScrobblerConfigEntity config, CancellationToken token)
    {
        var provider = _providerFactory.GetProvider(config.Provider);
        if (provider == null) return;
        try
        {
            await provider.EnsureAuthenticatedAsync(user.Id, token);

            // Download remote changes and merge
            var seriesList = await _db.Series.ToListAsync(token);
            var mappings = await _db.UserSeriesMappings
                .Where(m => m.UserId == user.Id && m.Provider == config.Provider
                    && m.MappingStatus != SeriesMappingStatus.Ignored)
                .ToListAsync(token);

            var series = await _db.Series.Where(s => mappings.Select(m => m.SeriesId).Contains(s.Id)).ToListAsync(token);

            foreach (var serie in series)
            {
                var mapping = mappings.First(m => m.SeriesId == serie.Id);
                await SyncSeriesForProviderAsync(user, serie, mapping, config, token);
            }

            config.LastSyncAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sync failed for user {Username} provider {Provider}", user.Username, config.Provider);
        }
    }

    private async Task SyncSeriesForProviderAsync(UserEntity user, SeriesEntity series, UserSeriesMappingEntity mapping, UserScrobblerConfigEntity config, CancellationToken token)
    {
        var provider = _providerFactory.GetProvider(config.Provider);
        if (provider == null) return;

        await provider.EnsureAuthenticatedAsync(user.Id, token);

        if (series == null) return;

        // Download remote state
        var remoteChapters = await provider.GetReadChaptersAsync(mapping.ExternalSeriesId, token);
        var localStates = _readStateService.GetSeriesReadStates(user.Username, series.StoragePath);

        Dictionary<decimal, float> states = localStates.ToDictionary(s => s.ChapterNumber, s => s.Progress);
        // Upload new local chapters that aren't on remote

        await provider.SetReadChaptersAsync(mapping.ExternalSeriesId, states, token);

        config.LastDownloadAt = DateTime.UtcNow;
    }
}