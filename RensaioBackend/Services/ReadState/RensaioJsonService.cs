using RensaioBackend.Models;
using RensaioBackend.Services.Settings;
using RensaioBackend.Utils;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace RensaioBackend.Services.ReadState;

/// <summary>
/// Singleton service providing atomic read-modify-write access to rensaio.json files.
/// Uses a per-file KeyedAsyncLock to ensure that concurrent reads and writes from
/// different services (SeriesStateService, ReadStateService) do not interleave,
/// preventing the classic "lost update" race condition.
///
/// The modifyFunc receives the current on-disk snapshot (null if file doesn't exist)
/// and returns the new snapshot to persist. The entire read → modify → write cycle
/// is serialized per file path.
/// </summary>
public class RensaioJsonService
{
    private static readonly KeyedAsyncLock Lock = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettingsService _settingsService;
    private readonly ILogger<RensaioJsonService> _logger;

    public RensaioJsonService(SettingsService settingsService, ILogger<RensaioJsonService> logger)
    {
        _settingsService = settingsService;
        _logger = logger;
    }

    /// <summary>
    /// Atomically reads, modifies, and writes rensaio.json for the given series folder.
    /// Accepts either an absolute folder path or a partial storage path (e.g. "Manhwa/Series_Name").
    /// The modifyFunc is called under a per-file exclusive lock and receives the current
    /// snapshot (null if file doesn't exist or is unreadable).
    /// </summary>
    public async Task ModifyAsync(
        string seriesFolderOrStoragePath,
        Func<ImportSeriesSnapshot?, ImportSeriesSnapshot> modifyFunc,
        CancellationToken token = default)
    {
        string rensaioJsonPath = ResolveRensaioJsonPath(seriesFolderOrStoragePath);
        string seriesFolder = System.IO.Path.GetDirectoryName(rensaioJsonPath)!;

        using (await Lock.LockAsync(rensaioJsonPath, token).ConfigureAwait(false))
        {
            // Read current state from disk
            ImportSeriesSnapshot? existingSnapshot = null;
            if (File.Exists(rensaioJsonPath))
            {
                try
                {
                    string jsonContent = await File.ReadAllTextAsync(rensaioJsonPath, token).ConfigureAwait(false);
                    existingSnapshot = JsonSerializer.Deserialize<ImportSeriesSnapshot>(jsonContent);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error parsing rensaio.json at {Path}, will overwrite", rensaioJsonPath);
                }
            }

            // Apply the modification
            ImportSeriesSnapshot newSnapshot = modifyFunc(existingSnapshot);

            // Write atomically (temp file then rename)
            await WriteAtomicallyAsync(seriesFolder, rensaioJsonPath, newSnapshot, token).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Synchronous version of ModifyAsync for callers in sync contexts (e.g. OPDS request path).
    /// </summary>
    public void Modify(
        string seriesStoragePath,
        Func<ImportSeriesSnapshot?, ImportSeriesSnapshot> modifyFunc)
    {
        string rensaioJsonPath = ResolveRensaioJsonPath(seriesStoragePath);
        string seriesFolder = System.IO.Path.GetDirectoryName(rensaioJsonPath)!;

        using (Lock.LockAsync(rensaioJsonPath).GetAwaiter().GetResult())
        {
            // Read current state from disk
            ImportSeriesSnapshot? existingSnapshot = null;
            if (File.Exists(rensaioJsonPath))
            {
                try
                {
                    string jsonContent = File.ReadAllText(rensaioJsonPath);
                    existingSnapshot = JsonSerializer.Deserialize<ImportSeriesSnapshot>(jsonContent);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error parsing rensaio.json at {Path}, will overwrite", rensaioJsonPath);
                }
            }

            // Apply the modification
            ImportSeriesSnapshot newSnapshot = modifyFunc(existingSnapshot);

            // Write atomically (temp file then rename)
            WriteAtomicallySync(seriesFolder, rensaioJsonPath, newSnapshot);
        }
    }

    /// <summary>
    /// Loads rensaio.json for a series folder WITHOUT locking.
    /// For read-only use (cache warmup, etc.). For read-modify-write, use ModifyAsync/Modify.
    /// Accepts either an absolute folder path or a partial storage path.
    /// </summary>
    public async Task<ImportSeriesSnapshot?> LoadAsync(string seriesFolderOrStoragePath, CancellationToken token = default)
    {
        string rensaioJsonPath = ResolveRensaioJsonPath(seriesFolderOrStoragePath);
        if (!File.Exists(rensaioJsonPath))
            return null;

        try
        {
            string jsonContent = await File.ReadAllTextAsync(rensaioJsonPath, token).ConfigureAwait(false);
            return JsonSerializer.Deserialize<ImportSeriesSnapshot>(jsonContent);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error parsing rensaio.json at {Path}", rensaioJsonPath);
            return null;
        }
    }

    /// <summary>
    /// Synchronous read-only load. For use in sync contexts.
    /// </summary>
    public ImportSeriesSnapshot? Load(string seriesStoragePath)
    {
        string rensaioJsonPath = ResolveRensaioJsonPath(seriesStoragePath);
        if (!File.Exists(rensaioJsonPath))
            return null;

        try
        {
            string jsonContent = File.ReadAllText(rensaioJsonPath);
            return JsonSerializer.Deserialize<ImportSeriesSnapshot>(jsonContent);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error parsing rensaio.json at {Path}", rensaioJsonPath);
            return null;
        }
    }

    /// <summary>
    /// Returns the full path to rensaio.json for a given series folder or storage path.
    /// If the input is an absolute path (contains drive letter or starts with / or \),
    /// it's used as-is. Otherwise it's resolved relative to the configured storage folder.
    /// </summary>
    private string ResolveRensaioJsonPath(string seriesFolderOrStoragePath)
    {
        // If it's already an absolute path, use it directly
        if (System.IO.Path.IsPathRooted(seriesFolderOrStoragePath))
        {
            return System.IO.Path.Combine(seriesFolderOrStoragePath, "rensaio.json");
        }

        // Otherwise treat as a partial storage path relative to configured StorageFolder
        var settings = _settingsService.DirectSettings;
        string fullPath = settings != null && !string.IsNullOrWhiteSpace(settings.StorageFolder)
            ? System.IO.Path.Combine(settings.StorageFolder, seriesFolderOrStoragePath)
            : seriesFolderOrStoragePath;

        // Handle kaizoku.json → rensaio.json migration
        string rensaioPath = System.IO.Path.Combine(fullPath, "rensaio.json");
        string oldPath = System.IO.Path.Combine(fullPath, "kaizoku.json");
        if (File.Exists(oldPath) && !File.Exists(rensaioPath))
        {
            try
            {
                File.Move(oldPath, rensaioPath);
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Unable to rename {OldPath} to {NewPath}", oldPath, rensaioPath);
            }
        }

        return rensaioPath;
    }

    private async Task WriteAtomicallyAsync(string seriesFolder, string rensaioJsonPath, ImportSeriesSnapshot snapshot, CancellationToken token)
    {
        if (!Directory.Exists(seriesFolder))
            Directory.CreateDirectory(seriesFolder);

        string tempPath = rensaioJsonPath + ".tmp";
        string jsonContent = JsonSerializer.Serialize(snapshot, JsonOptions);
        await File.WriteAllTextAsync(tempPath, jsonContent, token).ConfigureAwait(false);
        File.Move(tempPath, rensaioJsonPath, overwrite: true);
    }

    private static void WriteAtomicallySync(string seriesFolder, string rensaioJsonPath, ImportSeriesSnapshot snapshot)
    {
        if (!Directory.Exists(seriesFolder))
            Directory.CreateDirectory(seriesFolder);

        string tempPath = rensaioJsonPath + ".tmp";
        string jsonContent = JsonSerializer.Serialize(snapshot, JsonOptions);
        File.WriteAllText(tempPath, jsonContent);
        File.Move(tempPath, rensaioJsonPath, overwrite: true);
    }
}