using RensaioBackend.Data;
using RensaioBackend.Hubs;
using RensaioBackend.Models;
using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Helpers;
using RensaioBackend.Services.Import;
using RensaioBackend.Services.Jobs;
using RensaioBackend.Services.Settings;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IO;
using System.Runtime;

namespace RensaioBackend.Controllers
{
    /// <summary>
    /// Controller for handling setup wizard operations
    /// </summary>
    [ApiController]
    [Route("api/setup")]
    [Produces("application/json")]
    public class SetupWizardController : ControllerBase
    {
        private readonly ILogger _logger;
        private readonly AppDbContext _db;
        private readonly JobManagementService _jobManagementService;
        private readonly ImportQueryService _importQueryService;
        private readonly ImportCommandService _importCommandService;
        private readonly SettingsService _settings;
        public SetupWizardController(ILogger<SetupWizardController> logger,
            JobManagementService jobManagementService,
            AppDbContext db,
            ImportQueryService importQueryService,
            ImportCommandService importCommandService,
            SettingsService settings)
        {
            _jobManagementService = jobManagementService;
            _db = db;
            _settings = settings;
            _logger = logger;
            _importQueryService = importQueryService;
            _importCommandService = importCommandService;
        }

        private UserImportService? _userImportService;
        private UserImportService GetUserImportService()
        {
            _userImportService ??= HttpContext.RequestServices.GetRequiredService<UserImportService>();
            return _userImportService;
        }

        /// <summary>
        /// Scan local files for series
        /// </summary>
        [HttpPost("scan")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> ScanLocalFilesAsync(CancellationToken token = default)
        {
            try
            {
                SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
                await _jobManagementService.EnqueueJobAsync(JobType.ScanLocalFiles, settings.StorageFolder, Priority.High, null, null, null, "Default", token).ConfigureAwait(false);
                return Ok(new { success = true, message = "Scan Scheduled" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scheduling scan");
                return StatusCode(500, new { error = $"An error occurred during scheduling: {ex.Message}" });
            }
        }

        /// <summary>
        /// Install additional extensions required for the imported series
        /// </summary>
        [HttpPost("install-extensions")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> InstallExtensionsAsync(CancellationToken token = default)
        {
            try
            {
                await _jobManagementService.EnqueueJobAsync(JobType.InstallAdditionalExtensions, default(object), Priority.High, null, null, null, "Default", token).ConfigureAwait(false);
                return Ok(new { success = true, message = "Extension installation completed" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error installing extensions");
                return StatusCode(500, new { error = $"An error occurred during installation: {ex.Message}" });
            }
        }

        /// <summary>
        /// Search series against providers during import wizard
        /// </summary>
        [HttpPost("search")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> SearchSeriesAsync(CancellationToken token = default)
        {
            try
            {
                await _jobManagementService.EnqueueJobAsync<string?>(JobType.SearchProviders, null, Priority.High, null, null, null, "Default", token).ConfigureAwait(false);
                return Ok(new { success = true, message = "Search Series Scheduled" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scheduling Search Series");
                return StatusCode(500, new { error = $"An error occurred during scheduling: {ex.Message}" });
            }
        }
        /// <summary>
        /// Update import information.
        /// </summary>
        /// <param name="info">Import information to update.</param>
        /// <param name="token">Cancellation token.</param>
        /// <returns>Status of the update operation.</returns>
        /// <response code="200">Update completed successfully</response>
        /// <response code="400">If no import was provided</response>
        /// <response code="500">If an error occurs during update</response>
        [HttpPost("update")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> UpdateAsync([FromBody] ImportSeriesEntry info, CancellationToken token = default)
        {
            try
            {
                if (info == null)
                {
                    return BadRequest(new { error = "No Import provided" });
                }
                await _importCommandService.UpdateImportSeriesEntryAsync(info, token).ConfigureAwait(false);
                return Ok(new { success = true, message = "Import updated successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating Import: {Message}", ex.Message);
                return StatusCode(500, new { error = "An error occurred while updating Import" });
            }
        }
        /// <summary>
        /// Augment series metadata
        /// </summary>
        [HttpPost("augment")]
        [ProducesResponseType(typeof(ImportSeriesEntry), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ImportSeriesEntry>> AugmentAsync([FromQuery] string path, [FromBody] List<LinkedSeriesDto> linkedSeries, CancellationToken token = default)
        {
            try
            {
                if (linkedSeries == null || linkedSeries.Count == 0)
                {
                    return BadRequest(new { error = "No series provided to augment" });
                }
                return Ok(await _importQueryService.AugmentAsync(path, linkedSeries, token).ConfigureAwait(false));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error augmenting series: {Message}", ex.Message);
                return StatusCode(500, new { error = "An error occurred while augmenting series." });
            }
        }

        /// <summary>
        /// Get list of pending imports
        /// </summary>
        [HttpGet("imports")]
        [ProducesResponseType(typeof(List<ImportSeriesEntry>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<List<ImportSeriesEntry>>> GetImportsAsync(CancellationToken token = default)
        {
            try
            {
                return Ok(await _importQueryService.GetImportsAsync(token).ConfigureAwait(false));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving imports");
                return StatusCode(500, new { error = $"An error occurred retrieving imports: {ex.Message}" });
            }
        }

        /// <summary>
        /// Get list of pending imports
        /// </summary>
        [HttpGet("imports/totals")]
        [ProducesResponseType(typeof(ImportTotalsDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ImportTotalsDto>> GetImportsTotalsAsync(CancellationToken token = default)
        {
            try
            {
                return Ok(await _importQueryService.GetImportsTotalsAsync(token).ConfigureAwait(false));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving imports totals");
                return StatusCode(500, new { error = $"An error occurred retrieving imports totals: {ex.Message}" });
            }
        }

        /// <summary>
        /// Import series from the provided list
        /// </summary>
        [HttpPost("import")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> ImportSeriesAsync([FromQuery] bool disableDownloads, CancellationToken token = default)
        {
            try
            {
                // Idempotency guard: if an import is already running or queued, don't enqueue another one.
                // This prevents a page reload (which re-mounts the wizard's final step) from restarting
                // a long-running import from scratch.
                bool alreadyActive = await _db.Queues
                    .AnyAsync(q => q.JobType == JobType.ImportSeries &&
                                   (q.Status == QueueStatus.Running || q.Status == QueueStatus.Waiting), token)
                    .ConfigureAwait(false);

                if (alreadyActive)
                {
                    return Ok(new { success = true, message = "Import Series already in progress", alreadyRunning = true });
                }

                await _jobManagementService.EnqueueJobAsync<bool>(JobType.ImportSeries, disableDownloads, Priority.High, null, null, null,"Default", token).ConfigureAwait(false);
                return Ok(new { success = true, message = "Import Series Scheduled" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scheduling Import Series");
                return StatusCode(500, new { error = $"An error occurred during scheduling: {ex.Message}" });
            }
        }

        /// <summary>
        /// GET /api/setup/import/status - Reports the current state of the series import job.
        /// Lets the frontend reconnect to an in-progress import after a page reload instead of
        /// restarting it, and lets a background progress indicator resume after a disconnect.
        /// </summary>
        [HttpGet("import/status")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> GetImportStatusAsync(CancellationToken token = default)
        {
            try
            {
                var latest = await _db.Queues
                    .Where(q => q.JobType == JobType.ImportSeries)
                    .OrderByDescending(q => q.EnqueuedDate)
                    .Select(q => new { q.Status })
                    .FirstOrDefaultAsync(token)
                    .ConfigureAwait(false);

                bool isRunning = latest?.Status == QueueStatus.Running;
                bool isQueued = latest?.Status == QueueStatus.Waiting;
                bool hasCompleted = latest?.Status == QueueStatus.Completed;
                bool hasFailed = latest?.Status == QueueStatus.Failed;

                return Ok(new
                {
                    isRunning,
                    isQueued,
                    isActive = isRunning || isQueued,
                    hasCompleted,
                    hasFailed
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving import status");
                return StatusCode(500, new { error = $"An error occurred retrieving import status: {ex.Message}" });
            }
        }

        /// <summary>
        /// GET /api/setup/import/users - Check if import found UserReadStates.
        /// Auto-creates users from rensaio.json UserReadStates and returns results.
        /// </summary>
        [HttpGet("import/users")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> GetImportUsersAsync(CancellationToken token = default)
        {
            try
            {
                var userImportService = GetUserImportService();
                bool hasReadStates = await userImportService.HasImportUserReadStatesAsync(token);
                var autoCreatedUsers = new List<string>();

                if (hasReadStates)
                {
                    autoCreatedUsers = await userImportService.AutoCreateUsersFromImportAsync(token);
                }

                return Ok(new
                {
                    hasReadStates,
                    autoCreatedUsers,
                    userCount = autoCreatedUsers.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking import users");
                return StatusCode(500, new { error = $"An error occurred: {ex.Message}" });
            }
        }
    }
}
