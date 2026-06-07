using KaizokuBackend.Data;
using KaizokuBackend.Hubs;
using KaizokuBackend.Models;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Helpers;
using KaizokuBackend.Services.Import;
using KaizokuBackend.Services.Jobs;
using KaizokuBackend.Services.Settings;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IO;
using System.Runtime;

namespace KaizokuBackend.Controllers
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
        /// Augment series metadata
        /// </summary>
        [HttpPost("augment")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> AugmentSeriesAsync(CancellationToken token = default)
        {
            try
            {
                await _jobManagementService.EnqueueJobAsync(JobType.SearchProviders, default(object), Priority.High, null, null, null, "Default", token).ConfigureAwait(false);
                return Ok(new { success = true, message = "Search providers scheduled" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching providers");
                return StatusCode(500, new { error = $"An error occurred during searching: {ex.Message}" });
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
        /// GET /api/setup/import/users - Check if import found UserReadStates.
        /// Auto-creates users from kaizoku.json UserReadStates and returns results.
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
