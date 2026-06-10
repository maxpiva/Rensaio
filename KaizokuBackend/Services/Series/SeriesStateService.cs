using KaizokuBackend.Data;
using KaizokuBackend.Extensions;
using KaizokuBackend.Models;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Services.Settings;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace KaizokuBackend.Services.Series;

/// <summary>
/// Central service for synchronizing series state between the database and kaizoku.json files.
/// Ensures kaizoku.json always reflects the current DB state while preserving UserReadStates.
/// Called after any metadata or file-state change (add, update, chapter fetch, download,
/// archive rename, cleanup, integrity verify, provider match, etc.).
/// </summary>
public class SeriesStateService
{
    private readonly AppDbContext _db;
    private readonly SettingsService _settings;
    private readonly ILogger<SeriesStateService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public SeriesStateService(
        AppDbContext db,
        SettingsService settings,
        ILogger<SeriesStateService> logger)
    {
        _db = db;
        _settings = settings;
        _logger = logger;
    }

    /// <summary>
    /// Syncs the current DB state to kaizoku.json for a series.
    /// Always preserves UserReadStates from the existing kaizoku.json.
    /// Called after any metadata or file-state change.
    /// </summary>
    public async Task SyncToKaizokuJsonAsync(Guid seriesId, CancellationToken token = default)
    {
        SeriesEntity? series = await _db.Series
            .Include(s => s.Sources)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token)
            .ConfigureAwait(false);

        if (series == null)
        {
            _logger.LogWarning("Cannot sync kaizoku.json: Series {SeriesId} not found", seriesId);
            return;
        }

        await SyncToKaizokuJsonAsync(series, token).ConfigureAwait(false);
    }

    /// <summary>
    /// Syncs the current DB state to kaizoku.json using a pre-loaded SeriesEntity.
    /// This overload avoids double-loading the entity from the database.
    /// Always preserves UserReadStates from the existing kaizoku.json.
    /// </summary>
    public async Task SyncToKaizokuJsonAsync(SeriesEntity series, CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(series);

        try
        {
            SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
            string seriesFolder = System.IO.Path.Combine(settings.StorageFolder, series.StoragePath);

            // Step 1: Build snapshot from current DB state
            ImportSeriesSnapshot snapshot = series.ToImportSeriesSnapshot();

            // Step 1.5: Populate ExternalMappings from SeriesMappings table
            var mappings = await _db.SeriesMappings
                .Where(m => m.SeriesId == series.Id)
                .ToListAsync(token);

            if (mappings.Count > 0)
            {
                snapshot.Series.ExternalMappings = mappings.Select(a=>
                new ExternalMapping {  
                    ExternalId = a.ExternalSeriesId, 
                    Provider = a.Provider.ToString(), 
                    ExternalTitle = a.ExternalSeriesTitle ?? "" }
                ).ToList();
            }

            // Step 2: Preserve UserReadStates from existing kaizoku.json
            ImportSeriesSnapshot? existingSnapshot = await LoadFromKaizokuJsonAsync(seriesFolder, token)
                .ConfigureAwait(false);

            if (existingSnapshot?.UserReadStates != null && existingSnapshot.UserReadStates.Count > 0)
            {
                snapshot.UserReadStates = existingSnapshot.UserReadStates;
                snapshot.KaizokuVersion = Math.Max(snapshot.KaizokuVersion, existingSnapshot.KaizokuVersion);
            }

            // Step 3: Write atomically (write to .tmp then rename)
            await SaveToKaizokuJsonAsync(seriesFolder, snapshot, token).ConfigureAwait(false);

            _logger.LogDebug("Synced kaizoku.json for series {SeriesId} ({Title})", series.Id, series.Title);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing kaizoku.json for series {SeriesId}: {Message}", series.Id, ex.Message);
        }
    }

    /// <summary>
    /// Reads current state from kaizoku.json for a series folder.
    /// Returns null if the file doesn't exist or is unreadable.
    /// </summary>
    public async Task<ImportSeriesSnapshot?> LoadFromKaizokuJsonAsync(string seriesFolder, CancellationToken token = default)
    {
        string kaizokuJsonPath = System.IO.Path.Combine(seriesFolder, "kaizoku.json");
        if (!File.Exists(kaizokuJsonPath))
            return null;

        try
        {
            string jsonContent = await File.ReadAllTextAsync(kaizokuJsonPath, token).ConfigureAwait(false);
            return JsonSerializer.Deserialize<ImportSeriesSnapshot>(jsonContent);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Error parsing kaizoku.json in {SeriesFolder}: {Message}", seriesFolder, ex.Message);
            return null;
        }
    }

    /// <summary>
    /// Gets the current DB state as an ImportSeriesSnapshot (without reading kaizoku.json).
    /// Useful for verification, export, or when read state preservation isn't needed.
    /// </summary>
    public async Task<ImportSeriesSnapshot> GetCurrentSnapshotAsync(Guid seriesId, CancellationToken token = default)
    {
        SeriesEntity? series = await _db.Series
            .Include(s => s.Sources)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == seriesId, token)
            .ConfigureAwait(false);

        return series?.ToImportSeriesSnapshot() ?? new ImportSeriesSnapshot();
    }

    /// <summary>
    /// Writes the snapshot to kaizoku.json atomically (temp file then rename).
    /// </summary>
    private async Task SaveToKaizokuJsonAsync(string seriesFolder, ImportSeriesSnapshot snapshot, CancellationToken token = default)
    {
        if (!Directory.Exists(seriesFolder))
            Directory.CreateDirectory(seriesFolder);

        string kaizokuJsonPath = System.IO.Path.Combine(seriesFolder, "kaizoku.json");
        string tempPath = kaizokuJsonPath + ".tmp";

        string jsonContent = JsonSerializer.Serialize(snapshot, JsonOptions);
        await File.WriteAllTextAsync(tempPath, jsonContent, token).ConfigureAwait(false);
        File.Move(tempPath, kaizokuJsonPath, overwrite: true);
    }
}