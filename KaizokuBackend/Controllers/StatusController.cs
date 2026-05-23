using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Images;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Controllers;

[ApiController]
[Route("api/status")]
[Produces("application/json")]
public class StatusController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ThumbCacheService _thumb;
    private readonly ILogger<StatusController> _logger;

    public StatusController(AppDbContext db, ThumbCacheService thumb, ILogger<StatusController> logger)
    {
        _db = db;
        _thumb = thumb;
        _logger = logger;
    }

    /// <summary>
    /// Gets all series with active health alerts (yellow/red).
    /// </summary>
    [HttpGet("series")]
    [ProducesResponseType(typeof(List<SeriesHealthDto>), 200)]
    [ProducesResponseType(500)]
    public async Task<ActionResult<List<SeriesHealthDto>>> GetSeriesStatusAsync(CancellationToken token = default)
    {
        try
        {
            var alerts = await _db.HealthStatuses
                .Where(h => h.TargetType == HealthStatusTargetType.Series && h.IsActive)
                .AsNoTracking()
                .ToListAsync(token)
                .ConfigureAwait(false);

            var seriesIds = alerts.Select(a => a.TargetId).ToList();
            var series = await _db.Series
                .Where(s => seriesIds.Contains(s.Id))
                .Include(s => s.Sources)
                .AsNoTracking()
                .ToDictionaryAsync(s => s.Id, token)
                .ConfigureAwait(false);

            var result = new List<SeriesHealthDto>();
            foreach (var alert in alerts)
            {
                if (!series.TryGetValue(alert.TargetId, out var s))
                    continue;

                int? daysWithoutRelease = s.LastChapterDate.HasValue
                    ? (int?)(DateTime.UtcNow - s.LastChapterDate.Value).TotalDays
                    : null;

                var dto = new SeriesHealthDto
                {
                    SeriesId = s.Id,
                    SeriesTitle = s.Title,
                    SeriesThumbnail = s.ThumbnailUrl,
                    Level = alert.Level,
                    Message = alert.Message,
                    LastChapterDate = s.LastChapterDate,
                    DaysWithoutRelease = daysWithoutRelease,
                    Providers = s.Sources
                        .Where(sp => !sp.IsUnknown)
                        .Select(sp => new SmallProviderHealthDto
                        {
                            ProviderId = sp.Id,
                            ProviderName = sp.Provider,
                            Language = sp.Language,
                            Level = GetProviderHealthLevel(sp)
                        }).ToList()
                };

                result.Add(dto);
            }

            await _thumb.PopulateThumbsAsync(result, "/api/image/", s => s.SeriesThumbnail,
                (s, url) => s.SeriesThumbnail = url, token).ConfigureAwait(false);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting series health status");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Gets all providers with active health alerts, including affected series tree.
    /// </summary>
    [HttpGet("providers")]
    [ProducesResponseType(typeof(List<ProviderHealthDto>), 200)]
    [ProducesResponseType(500)]
    public async Task<ActionResult<List<ProviderHealthDto>>> GetProviderStatusAsync(CancellationToken token = default)
    {
        try
        {
            var alerts = await _db.HealthStatuses
                .Where(h => h.TargetType == HealthStatusTargetType.Provider && h.IsActive)
                .AsNoTracking()
                .ToListAsync(token)
                .ConfigureAwait(false);

            var providerIds = alerts.Select(a => a.TargetId).ToList();
            var providers = await _db.SeriesProviders
                .Where(p => providerIds.Contains(p.Id))
                .Include(p => p.Chapters)  // Need chapters for last chapter date
                .AsNoTracking()
                .ToDictionaryAsync(p => p.Id, token)
                .ConfigureAwait(false);

            // Get all series that use these providers
            var seriesLookup = await _db.Series
                .Include(s => s.Sources)
                .AsNoTracking()
                .ToListAsync(token)
                .ConfigureAwait(false);

            var result = new List<ProviderHealthDto>();
            foreach (var alert in alerts)
            {
                if (!providers.TryGetValue(alert.TargetId, out var prov))
                    continue;

                var dto = new ProviderHealthDto
                {
                    ProviderId = prov.Id,
                    ProviderName = prov.Provider,
                    Scanlator = prov.Scanlator,
                    Language = prov.Language,
                    Level = alert.Level,
                    Message = alert.Message,
                    LastErrorDate = prov.LastErrorDate,
                    ConsecutiveErrors = prov.ConsecutiveErrorCount,
                    IsMihonInstalled = !string.IsNullOrEmpty(prov.MihonProviderId),
                    AffectedSeries = []
                };

                // Find series linked to this provider that have their own active health alerts
                var parentSeries = seriesLookup.FirstOrDefault(s => s.Id == prov.SeriesId);
                if (parentSeries != null)
                {
                    // Check if the parent series has an active alert
                    var seriesAlert = await _db.HealthStatuses
                        .Where(h => h.TargetType == HealthStatusTargetType.Series
                                    && h.TargetId == parentSeries.Id
                                    && h.IsActive)
                        .AsNoTracking()
                        .FirstOrDefaultAsync(token)
                        .ConfigureAwait(false);

                    if (seriesAlert != null)
                    {
                        dto.AffectedSeries.Add(new SeriesHealthDto
                        {
                            SeriesId = parentSeries.Id,
                            SeriesTitle = parentSeries.Title,
                            SeriesThumbnail = parentSeries.ThumbnailUrl,
                            Level = seriesAlert.Level,
                            Message = seriesAlert.Message,
                            LastChapterDate = parentSeries.LastChapterDate,
                            DaysWithoutRelease = parentSeries.LastChapterDate.HasValue
                                ? (int?)(DateTime.UtcNow - parentSeries.LastChapterDate.Value).TotalDays
                                : null
                        });
                    }
                }

                result.Add(dto);
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting provider health status");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Gets a summary of active alerts (counts for badges).
    /// </summary>
    [HttpGet("summary")]
    [ProducesResponseType(typeof(StatusSummaryDto), 200)]
    [ProducesResponseType(500)]
    public async Task<ActionResult<StatusSummaryDto>> GetStatusSummaryAsync(CancellationToken token = default)
    {
        try
        {
            var activeAlerts = await _db.HealthStatuses
                .Where(h => h.IsActive)
                .AsNoTracking()
                .ToListAsync(token)
                .ConfigureAwait(false);

            var summary = new StatusSummaryDto
            {
                TotalYellowSeries = activeAlerts.Count(h =>
                    h.TargetType == HealthStatusTargetType.Series && h.Level == HealthStatusLevel.Yellow),
                TotalRedSeries = activeAlerts.Count(h =>
                    h.TargetType == HealthStatusTargetType.Series && h.Level == HealthStatusLevel.Red),
                TotalYellowProviders = activeAlerts.Count(h =>
                    h.TargetType == HealthStatusTargetType.Provider && h.Level == HealthStatusLevel.Yellow),
                TotalRedProviders = activeAlerts.Count(h =>
                    h.TargetType == HealthStatusTargetType.Provider && h.Level == HealthStatusLevel.Red)
            };

            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting status summary");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Manually clears/acknowledges a health alert.
    /// </summary>
    [HttpPost("clear")]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(500)]
    public async Task<IActionResult> ClearAlertAsync([FromBody] ClearAlertRequest request, CancellationToken token = default)
    {
        try
        {
            var alert = await _db.HealthStatuses
                .FirstOrDefaultAsync(h =>
                    h.TargetType == request.TargetType &&
                    h.TargetId == request.TargetId &&
                    h.IsActive, token)
                .ConfigureAwait(false);

            if (alert == null)
                return NotFound(new { error = "No active alert found for the specified target" });

            alert.IsActive = false;
            alert.ResolvedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);

            return Ok(new { message = "Alert cleared successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error clearing health alert");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    private static HealthStatusLevel GetProviderHealthLevel(SeriesProviderEntity provider)
    {
        if (provider.LastErrorDate == null || provider.ConsecutiveErrorCount == 0)
            return HealthStatusLevel.Green;

        double hoursSinceError = (DateTime.UtcNow - provider.LastErrorDate.Value).TotalHours;

        // Hardcoded defaults matching the config defaults
        if (hoursSinceError >= 168) return HealthStatusLevel.Red;
        if (hoursSinceError >= 48) return HealthStatusLevel.Yellow;
        return HealthStatusLevel.Green;
    }
}