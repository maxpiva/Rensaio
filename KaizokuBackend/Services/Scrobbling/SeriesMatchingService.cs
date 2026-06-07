using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace KaizokuBackend.Services.Scrobbling;

/// <summary>
/// Handles automatic and manual series matching between local series and external scrobbling services.
/// Provides auto-matching with 95% word-coverage threshold, manual search/confirm, and disable logic.
/// </summary>
public class SeriesMatchingService
{
    private readonly AppDbContext _db;
    private readonly ScrobblerProviderFactory _providerFactory;
    private readonly ScrobblerTokenProtector _tokenProtector;
    private readonly TitleMatcher _titleMatcher;
    private readonly ILogger<SeriesMatchingService> _logger;

    public SeriesMatchingService(
        AppDbContext db,
        ScrobblerProviderFactory providerFactory,
        ScrobblerTokenProtector tokenProtector,
        TitleMatcher titleMatcher,
        ILogger<SeriesMatchingService> logger)
    {
        _db = db;
        _providerFactory = providerFactory;
        _tokenProtector = tokenProtector;
        _titleMatcher = titleMatcher;
        _logger = logger;
    }

    /// <summary>
    /// Try to auto-match a series by title across all enabled scrobblers.
    /// Uses cascading matching: exact normalized > alternate titles > word-coverage.
    /// </summary>
    public async Task AutoMatchSeriesAsync(Guid userId, Guid seriesId, CancellationToken token = default)
    {
        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId && c.IsEnabled)
            .ToListAsync(token);

        var series = await _db.Series
            .Include(s => s.Sources)
            .FirstOrDefaultAsync(s => s.Id == seriesId, token);

        if (series == null) return;

        foreach (var config in configs)
        {
            await AutoMatchForProviderAsync(userId, series, config.Provider, token);
        }
    }

    /// <summary>
    /// Auto-match all unmatched series for a user across a specific provider.
    /// </summary>
    public async Task<AutoMatchResultDto> AutoMatchAllAsync(Guid userId, ScrobblerProvider provider, CancellationToken token = default)
    {
        var result = new AutoMatchResultDto();
        var config = await _db.UserScrobblerConfigs
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == provider, token);

        if (config == null || !config.IsEnabled)
            return result;

        var seriesList = await _db.Series
            .Include(s => s.Sources)
            .ToListAsync(token);

        result.TotalSeries = seriesList.Count;

        foreach (var series in seriesList)
        {
            var existingMapping = await _db.UserSeriesMappings
                .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == series.Id
                    && m.Provider == provider, token);

            if (existingMapping != null && existingMapping.MappingStatus != SeriesMappingStatus.Unmatched)
            {
                result.LeftUnmatched++;
                continue;
            }

            var matchResult = await TryAutoMatchAsync(userId, series, provider, token);
            if (matchResult != null)
            {
                result.AutoMatched++;
                if (matchResult.MatchScore.HasValue && matchResult.MatchScore.Value < 0.95)
                {
                    result.SuggestedMatches.Add(matchResult);
                }
            }
            else
            {
                result.LeftUnmatched++;
            }
        }

        return result;
    }

    /// <summary>
    /// Search for a series on an external scrobbling service.
    /// </summary>
    public async Task<List<ScrobblerSearchResult>> SearchExternalSeriesAsync(
        ScrobblerProvider provider, string query, CancellationToken token = default)
    {
        var scrobbler = _providerFactory.GetProvider(provider);
        if (scrobbler == null) return [];

        return await scrobbler.SearchSeriesAsync(query, token);
    }

    /// <summary>
    /// Confirm a manual match between a local series and an external series ID.
    /// Creates a mapping with UserConfirmed status.
    /// </summary>
    public async Task ConfirmMatchAsync(Guid userId, Guid seriesId, ScrobblerProvider provider,
        string externalSeriesId, string? externalTitle = null, CancellationToken token = default)
    {
        var mapping = await _db.UserSeriesMappings
            .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == seriesId
                && m.Provider == provider, token);

        if (mapping != null)
        {
            mapping.ExternalSeriesId = externalSeriesId;
            mapping.ExternalSeriesTitle = externalTitle;
            mapping.MappingStatus = SeriesMappingStatus.UserConfirmed;
        }
        else
        {
            _db.UserSeriesMappings.Add(new UserSeriesMappingEntity
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                SeriesId = seriesId,
                Provider = provider,
                ExternalSeriesId = externalSeriesId,
                ExternalSeriesTitle = externalTitle,
                MappingStatus = SeriesMappingStatus.UserConfirmed
            });
        }

        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Get all series that are unmatched for a user across all scrobblers.
    /// </summary>
    public async Task<List<SeriesMatchStatusDto>> GetUnmatchedSeriesAsync(Guid userId, CancellationToken token = default)
    {
        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId && c.IsEnabled)
            .ToListAsync(token);

        var result = new List<SeriesMatchStatusDto>();

        foreach (var config in configs)
        {
            var seriesList = await _db.Series.ToListAsync(token);

            foreach (var series in seriesList)
            {
                var mapping = await _db.UserSeriesMappings
                    .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == series.Id
                        && m.Provider == config.Provider, token);

                result.Add(new SeriesMatchStatusDto
                {
                    SeriesId = series.Id,
                    SeriesTitle = series.Title,
                    Provider = config.Provider,
                    MappingStatus = mapping?.MappingStatus ?? SeriesMappingStatus.Unmatched,
                    ExternalSeriesId = mapping?.ExternalSeriesId,
                    ExternalSeriesTitle = mapping?.ExternalSeriesTitle,
                    MatchScore = null
                });
            }
        }

        return result;
    }

    /// <summary>
    /// Mark a series as explicitly disabled/linked for a specific scrobbler.
    /// Creates a mapping with Ignored status so the sync service skips it.
    /// </summary>
    public async Task DisableSeriesLinkAsync(Guid userId, Guid seriesId, ScrobblerProvider provider, CancellationToken token = default)
    {
        var mapping = await _db.UserSeriesMappings
            .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == seriesId
                && m.Provider == provider, token);

        if (mapping != null)
        {
            mapping.MappingStatus = SeriesMappingStatus.Ignored;
        }
        else
        {
            _db.UserSeriesMappings.Add(new UserSeriesMappingEntity
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                SeriesId = seriesId,
                Provider = provider,
                ExternalSeriesId = string.Empty,
                MappingStatus = SeriesMappingStatus.Ignored
            });
        }

        await _db.SaveChangesAsync(token);
    }

    /// <summary>
    /// Remove a mapping (reset to Unmatched).
    /// </summary>
    public async Task RemoveMappingAsync(Guid userId, Guid seriesId, ScrobblerProvider provider, CancellationToken token = default)
    {
        var mapping = await _db.UserSeriesMappings
            .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == seriesId
                && m.Provider == provider, token);

        if (mapping != null)
        {
            _db.UserSeriesMappings.Remove(mapping);
            await _db.SaveChangesAsync(token);
        }
    }

    /// <summary>
    /// Get all match statuses for a user.
    /// </summary>
    public async Task<List<SeriesMatchStatusDto>> GetMatchStatusesAsync(Guid userId, CancellationToken token = default)
    {
        var allSeries = await _db.Series.ToListAsync(token);
        var allMappings = await _db.UserSeriesMappings
            .Where(m => m.UserId == userId)
            .ToListAsync(token);

        var result = new List<SeriesMatchStatusDto>();
        var allProviders = Enum.GetValues<ScrobblerProvider>();

        foreach (var series in allSeries)
        {
            foreach (var provider in allProviders)
            {
                var mapping = allMappings.FirstOrDefault(m =>
                    m.SeriesId == series.Id && m.Provider == provider);

                result.Add(new SeriesMatchStatusDto
                {
                    SeriesId = series.Id,
                    SeriesTitle = series.Title,
                    Provider = provider,
                    MappingStatus = mapping?.MappingStatus ?? SeriesMappingStatus.Unmatched,
                    ExternalSeriesId = mapping?.ExternalSeriesId,
                    ExternalSeriesTitle = mapping?.ExternalSeriesTitle,
                    MatchScore = null
                });
            }
        }

        return result;
    }

    /// <summary>
    /// Get sync status per provider for a user.
    /// </summary>
    public async Task<List<SyncStatusDto>> GetSyncStatusAsync(Guid userId, CancellationToken token = default)
    {
        var configs = await _db.UserScrobblerConfigs
            .Where(c => c.UserId == userId)
            .ToListAsync(token);

        var result = new List<SyncStatusDto>();

        foreach (var config in configs)
        {
            var seriesMatched = await _db.UserSeriesMappings
                .CountAsync(m => m.UserId == userId && m.Provider == config.Provider
                    && (m.MappingStatus == SeriesMappingStatus.UserConfirmed
                        || m.MappingStatus == SeriesMappingStatus.AutoMatched), token);

            var seriesUnmatched = await _db.UserSeriesMappings
                .CountAsync(m => m.UserId == userId && m.Provider == config.Provider
                    && m.MappingStatus == SeriesMappingStatus.Unmatched, token);

            var seriesIgnored = await _db.UserSeriesMappings
                .CountAsync(m => m.UserId == userId && m.Provider == config.Provider
                    && m.MappingStatus == SeriesMappingStatus.Ignored, token);

            result.Add(new SyncStatusDto
            {
                Provider = config.Provider,
                LastSyncAt = config.LastSyncAt,
                LastUploadAt = config.LastUploadAt,
                LastDownloadAt = config.LastDownloadAt,
                SeriesMatched = seriesMatched,
                SeriesUnmatched = seriesUnmatched,
                SeriesIgnored = seriesIgnored
            });
        }

        return result;
    }

    // ── Private ──

    private async Task AutoMatchForProviderAsync(Guid userId, SeriesEntity series,
        ScrobblerProvider provider, CancellationToken token)
    {
        await TryAutoMatchAsync(userId, series, provider, token);
    }

    private async Task<SeriesMatchStatusDto?> TryAutoMatchAsync(Guid userId, SeriesEntity series,
        ScrobblerProvider provider, CancellationToken token)
    {
        var scrobbler = _providerFactory.GetProvider(provider);
        if (scrobbler == null) return null;

        var localCandidates = _titleMatcher.BuildTitleCandidates(series);

        // Try search with each candidate
        ScrobblerSearchResult? bestMatch = null;
        double bestScore = 0;

        foreach (var candidate in localCandidates)
        {
            if (string.IsNullOrWhiteSpace(candidate)) continue;

            var searchResults = await scrobbler.SearchSeriesAsync(candidate, token);
            foreach (var result in searchResults)
            {
                var score = _titleMatcher.ScoreMatch(result, localCandidates);
                if (score > bestScore)
                {
                    bestScore = score;
                    bestMatch = result;
                }
            }
        }

        if (bestMatch == null || bestScore < 0.95)
        {
            if (bestMatch != null)
            {
                // Suggest as candidate
                var existingMapping = await _db.UserSeriesMappings
                    .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == series.Id
                        && m.Provider == provider, token);

                if (existingMapping == null)
                {
                    _db.UserSeriesMappings.Add(new UserSeriesMappingEntity
                    {
                        Id = Guid.NewGuid(),
                        UserId = userId,
                        SeriesId = series.Id,
                        Provider = provider,
                        ExternalSeriesId = bestMatch.ExternalId,
                        ExternalSeriesTitle = bestMatch.Title,
                        MappingStatus = SeriesMappingStatus.Unmatched
                    });
                    await _db.SaveChangesAsync(token);
                }

                return new SeriesMatchStatusDto
                {
                    SeriesId = series.Id,
                    SeriesTitle = series.Title,
                    Provider = provider,
                    MappingStatus = SeriesMappingStatus.Unmatched,
                    ExternalSeriesId = bestMatch.ExternalId,
                    ExternalSeriesTitle = bestMatch.Title,
                    ExternalCoverUrl = bestMatch.CoverUrl,
                    MatchScore = bestScore
                };
            }

            return null;
        }

        // Auto-match
        var existing = await _db.UserSeriesMappings
            .FirstOrDefaultAsync(m => m.UserId == userId && m.SeriesId == series.Id
                && m.Provider == provider, token);

        if (existing != null)
        {
            existing.ExternalSeriesId = bestMatch.ExternalId;
            existing.ExternalSeriesTitle = bestMatch.Title;
            existing.MappingStatus = SeriesMappingStatus.AutoMatched;
        }
        else
        {
            _db.UserSeriesMappings.Add(new UserSeriesMappingEntity
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                SeriesId = series.Id,
                Provider = provider,
                ExternalSeriesId = bestMatch.ExternalId,
                ExternalSeriesTitle = bestMatch.Title,
                MappingStatus = SeriesMappingStatus.AutoMatched
            });
        }

        await _db.SaveChangesAsync(token);

        return new SeriesMatchStatusDto
        {
            SeriesId = series.Id,
            SeriesTitle = series.Title,
            Provider = provider,
            MappingStatus = SeriesMappingStatus.AutoMatched,
            ExternalSeriesId = bestMatch.ExternalId,
            ExternalSeriesTitle = bestMatch.Title,
            ExternalCoverUrl = bestMatch.CoverUrl,
            MatchScore = bestScore
        };
    }
}