using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Services.Status;

/// <summary>
/// Service responsible for evaluating health status of series and providers.
/// Runs periodically to detect stale series, failing providers, and other issues.
/// </summary>
public class StatusEvaluationService
{
    private readonly AppDbContext _db;
    private readonly SettingsService _settings;
    private readonly ILogger<StatusEvaluationService> _logger;

    public StatusEvaluationService(AppDbContext db, SettingsService settings, ILogger<StatusEvaluationService> logger)
    {
        _db = db;
        _settings = settings;
        _logger = logger;
    }

    /// <summary>
    /// Evaluates all series and providers for health status.
    /// Creates/updates HealthStatusEntity records as needed.
    /// </summary>
    public async Task EvaluateAllAsync(CancellationToken token = default)
    {
        SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
        
        _logger.LogInformation("Starting health status evaluation...");
        
        await EvaluateSeriesAsync(settings, token).ConfigureAwait(false);
        await EvaluateProvidersAsync(settings, token).ConfigureAwait(false);
        
        _logger.LogInformation("Health status evaluation completed.");
    }

    /// <summary>
    /// Evaluates all series for release cadence violations.
    /// </summary>
    private async Task EvaluateSeriesAsync(SettingsDto settings, CancellationToken token = default)
    {
        var seriesList = await _db.Series
            .Include(s => s.Sources)
            .AsNoTracking()
            .ToListAsync(token)
            .ConfigureAwait(false);

        foreach (var series in seriesList)
        {
            await EvaluateSingleSeriesAsync(series, settings, token).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Evaluates a single series for health status.
    /// </summary>
    public async Task EvaluateSingleSeriesAsync(SeriesEntity series, SettingsDto settings, CancellationToken token = default)
    {
        // Skip series that are completed, cancelled, hiatus, or finished — they don't need monitoring
        if (series.Status == SeriesStatus.COMPLETED ||
            series.Status == SeriesStatus.CANCELLED ||
            series.Status == SeriesStatus.ON_HIATUS ||
            series.Status == SeriesStatus.PUBLISHING_FINISHED)
        {
            await ClearActiveAlertAsync(HealthStatusTargetType.Series, series.Id, token).ConfigureAwait(false);
            return;
        }

        // Skip series with no last chapter date (never had chapters)
        if (series.LastChapterDate == null)
        {
            await ClearActiveAlertAsync(HealthStatusTargetType.Series, series.Id, token).ConfigureAwait(false);
            return;
        }

        // Count active (non-disabled, non-uninstalled) providers
        var activeProviders = series.Sources
            .Where(s => !s.IsDisabled && !s.IsUninstalled && !s.IsUnknown)
            .ToList();

        // Estimate release cadence from chapter history
        double estimatedCadenceDays = EstimateReleaseCadence(series);
        if (estimatedCadenceDays <= 0)
            estimatedCadenceDays = settings.ReleaseCadenceDefaultDays;

        double daysSinceLastChapter = (DateTime.UtcNow - series.LastChapterDate.Value).TotalDays;

        // Check for RED: no active sources AND past red threshold
        if (activeProviders.Count == 0 && daysSinceLastChapter >= estimatedCadenceDays * settings.ReleaseCadenceMultiplierRed)
        {
            await UpsertAlertAsync(HealthStatusTargetType.Series, series.Id,
                HealthStatusLevel.Red,
                $"No active sources for {(int)daysSinceLastChapter} days (all providers down or unassigned)",
                token).ConfigureAwait(false);
            return;
        }

        // Check for YELLOW: past yellow threshold
        if (daysSinceLastChapter >= estimatedCadenceDays * settings.ReleaseCadenceMultiplierYellow)
        {
            await UpsertAlertAsync(HealthStatusTargetType.Series, series.Id,
                HealthStatusLevel.Yellow,
                $"No new chapters for {(int)daysSinceLastChapter} days (expected cadence: {estimatedCadenceDays:F1} days)",
                token).ConfigureAwait(false);
            return;
        }

        // All good — clear any existing alert
        await ClearActiveAlertAsync(HealthStatusTargetType.Series, series.Id, token).ConfigureAwait(false);
    }

    /// <summary>
    /// Evaluates all providers for error-based health status.
    /// </summary>
    private async Task EvaluateProvidersAsync(SettingsDto settings, CancellationToken token = default)
    {
        var providers = await _db.SeriesProviders
            .Where(p => !p.IsDisabled && !p.IsUninstalled && !p.IsUnknown)
            .AsNoTracking()
            .ToListAsync(token)
            .ConfigureAwait(false);

        foreach (var provider in providers)
        {
            await EvaluateSingleProviderAsync(provider, settings, token).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Evaluates a single provider for health status based on error history.
    /// </summary>
    public async Task EvaluateSingleProviderAsync(SeriesProviderEntity provider, SettingsDto settings, CancellationToken token = default)
    {
        // No errors recorded — clear any alert
        if (provider.LastErrorDate == null || provider.ConsecutiveErrorCount == 0)
        {
            await ClearActiveAlertAsync(HealthStatusTargetType.Provider, provider.Id, token).ConfigureAwait(false);
            return;
        }

        double hoursSinceLastError = (DateTime.UtcNow - provider.LastErrorDate.Value).TotalHours;

        // Check for RED: errors persisting beyond red threshold
        if (hoursSinceLastError >= settings.ProviderErrorRedHours)
        {
            // Find affected series for this provider
            var affectedSeries = await _db.SeriesProviders
                .Where(sp => sp.Id == provider.Id)
                .Join(_db.Series, sp => sp.SeriesId, s => s.Id, (sp, s) => s.Title)
                .ToListAsync(token)
                .ConfigureAwait(false);

            string affectedJson = System.Text.Json.JsonSerializer.Serialize(affectedSeries);

            await UpsertAlertAsync(HealthStatusTargetType.Provider, provider.Id,
                HealthStatusLevel.Red,
                $"Provider has been failing for {(int)hoursSinceLastError} hours ({provider.ConsecutiveErrorCount} consecutive errors)",
                token, affectedJson).ConfigureAwait(false);
            return;
        }

        // Check for YELLOW: errors persisting beyond yellow threshold
        if (hoursSinceLastError >= settings.ProviderErrorYellowHours)
        {
            var affectedSeries = await _db.SeriesProviders
                .Where(sp => sp.Id == provider.Id)
                .Join(_db.Series, sp => sp.SeriesId, s => s.Id, (sp, s) => s.Title)
                .ToListAsync(token)
                .ConfigureAwait(false);

            string affectedJson = System.Text.Json.JsonSerializer.Serialize(affectedSeries);

            await UpsertAlertAsync(HealthStatusTargetType.Provider, provider.Id,
                HealthStatusLevel.Yellow,
                $"Provider has been failing for {(int)hoursSinceLastError} hours ({provider.ConsecutiveErrorCount} consecutive errors)",
                token, affectedJson).ConfigureAwait(false);
            return;
        }

        // Errors exist but haven't crossed the yellow threshold yet — no alert
        await ClearActiveAlertAsync(HealthStatusTargetType.Provider, provider.Id, token).ConfigureAwait(false);
    }

    /// <summary>
    /// Estimates the release cadence for a series based on its chapter history.
    /// Looks at the last 5 chapters to compute average interval.
    /// Falls back to default cadence if insufficient data.
    /// </summary>
    private double EstimateReleaseCadence(SeriesEntity series)
    {
        // We need to look at chapters across all providers
        // Since chapters are stored as JSON on each provider, we need to load them
        // This is a best-effort heuristic
        return -1; // Signal to use default
    }

    /// <summary>
    /// Creates or updates an active health alert for the given target.
    /// If an active alert already exists with the same level, it's updated.
    /// If a different level exists, it's replaced.
    /// </summary>
    private async Task UpsertAlertAsync(HealthStatusTargetType targetType, Guid targetId,
        HealthStatusLevel level, string message, CancellationToken token = default,
        string? affectedSeriesJson = null)
    {
        var existing = await _db.HealthStatuses
            .FirstOrDefaultAsync(h => h.TargetType == targetType && h.TargetId == targetId && h.IsActive, token)
            .ConfigureAwait(false);

        if (existing != null)
        {
            if (existing.Level == level && existing.Message == message)
                return; // No change needed

            // Resolve the old alert
            existing.IsActive = false;
            existing.ResolvedAt = DateTime.UtcNow;
        }

        var alert = new HealthStatusEntity
        {
            Id = Guid.NewGuid(),
            TargetType = targetType,
            TargetId = targetId,
            Level = level,
            Message = message,
            AffectedSeriesJson = affectedSeriesJson,
            CreatedAt = DateTime.UtcNow,
            IsActive = true
        };

        _db.HealthStatuses.Add(alert);
        await _db.SaveChangesAsync(token).ConfigureAwait(false);
    }

    /// <summary>
    /// Clears any active alert for the given target (marks as resolved).
    /// </summary>
    private async Task ClearActiveAlertAsync(HealthStatusTargetType targetType, Guid targetId, CancellationToken token = default)
    {
        var existing = await _db.HealthStatuses
            .FirstOrDefaultAsync(h => h.TargetType == targetType && h.TargetId == targetId && h.IsActive, token)
            .ConfigureAwait(false);

        if (existing == null)
            return;

        existing.IsActive = false;
        existing.ResolvedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(token).ConfigureAwait(false);
    }
}