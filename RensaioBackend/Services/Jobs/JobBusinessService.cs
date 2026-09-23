using RensaioBackend.Models.Database;
using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Jobs;
using RensaioBackend.Services.Settings;
using System.Text.Json;

namespace RensaioBackend.Services.Jobs
{
    /// <summary>
    /// Service containing business logic for different job types
    /// </summary>
    public class JobBusinessService
    {
        private readonly JobManagementService _jobManagement;
        private readonly SettingsService _settings;
        private readonly ILogger<JobBusinessService> _logger;

        public JobBusinessService(JobManagementService jobManagement, SettingsService settings, 
            ILogger<JobBusinessService> logger)
        {
            _jobManagement = jobManagement;
            _settings = settings;
            _logger = logger;
        }

        #region Series Provider Job Management

        public async Task ManageSeriesProviderJobAsync(SeriesProviderEntity provider, bool runNow = false,
            bool forceDisable = false, CancellationToken token = default)
        {
            string groupKey = BuildProviderGroupKey(provider);
            
            if (provider.IsDisabled || provider.IsUninstalled || forceDisable)
            {
                await _jobManagement.DisableRecurringJobAsync(JobType.GetChapters, provider.Id.ToString(), token)
                    .ConfigureAwait(false);
                _logger.LogInformation("[job] SeriesProvider {Provider} ({SeriesId}) schedule: disabled.",
                    provider.Provider, provider.SeriesId);
            }
            else
            {
                await _jobManagement.ScheduleRecurringJobAsync(JobType.GetChapters, provider.Id,
                    provider.Id.ToString(), groupKey, runNow, priority: Priority.Low, token: token)
                    .ConfigureAwait(false);
                _logger.LogInformation("[job] SeriesProvider {Provider} ({SeriesId}) schedule: {Action}.",
                    provider.Provider, provider.SeriesId, runNow ? "enabled+run-now" : "enabled");
            }
        }

        public async Task DeleteSeriesProviderJobAsync(SeriesProviderEntity provider, CancellationToken token = default)
        {
            await _jobManagement.DeleteRecurringJobAsync(JobType.GetChapters, provider.Id.ToString(), token)
                .ConfigureAwait(false);
            _logger.LogInformation("[job] SeriesProvider {Provider} ({SeriesId}) recurring job deleted.",
                provider.Provider, provider.SeriesId);
        }

        #endregion

        #region Extension Management

        public async Task ManageExtensionUpdatesAsync(bool enable, CancellationToken token = default)
        {
            SettingsDto settings = await _settings.GetSettingsAsync(token).ConfigureAwait(false);
            string groupKey = nameof(JobType.UpdateExtensions);
            
            if (!enable)
            {
                await _jobManagement.DisableRecurringJobAsync(JobType.UpdateExtensions, groupKey, token)
                    .ConfigureAwait(false);
                _logger.LogInformation("[job] Extension auto-update disabled.");
            }
            else
            {
                await _jobManagement.ScheduleRecurringJobAsync(JobType.UpdateExtensions, groupKey,
                    groupKey, groupKey, false, settings.ExtensionsCheckForUpdateSchedule, Priority.High, token)
                    .ConfigureAwait(false);
                _logger.LogInformation("Extension auto-update enabled (interval {Interval}).",
                    settings.ExtensionsCheckForUpdateSchedule);
            }
        }

        /// <summary>
        /// Schedules (or disables) the low-priority discovery precache job that pre-downloads and
        /// pre-converts artifacts for eligible not-installed extensions, so automatic discovery
        /// searches never hit the cold download+dex2jar path. Pass runNow=true when something that
        /// changes the eligible set just happened (extension index refresh, language/NSFW settings
        /// change) — the job itself no-ops cheaply when the eligible set is unchanged.
        /// </summary>
        public async Task ManageDiscoveryPrecacheAsync(bool enable, bool runNow = false, CancellationToken token = default)
        {
            string groupKey = nameof(JobType.PrepareDiscovery);

            if (!enable)
            {
                await _jobManagement.DisableRecurringJobAsync(JobType.PrepareDiscovery, groupKey, token)
                    .ConfigureAwait(false);
                _logger.LogInformation("[job] Discovery artifact precache disabled.");
            }
            else
            {
                await _jobManagement.ScheduleRecurringJobAsync(JobType.PrepareDiscovery, groupKey,
                    groupKey, groupKey, runNow, priority: Priority.Low, token: token)
                    .ConfigureAwait(false);
                _logger.LogInformation("[job] Discovery artifact precache enabled.");
            }
        }

        #endregion

        #region Source Management

        public async Task ManageSourceJobAsync(ProviderStorageEntity provider, bool enable, bool runNow = false, 
            CancellationToken token = default)
        {
            string groupKey = BuildSourceGroupKey(provider);
            string mihonProviderId = provider.MihonProviderId;

            if (enable)
            {
                await _jobManagement.ScheduleRecurringJobAsync(JobType.GetLatest, JsonSerializer.Serialize(mihonProviderId), mihonProviderId,
                    groupKey, runNow, priority: Priority.Low, token: token)
                    .ConfigureAwait(false);
                _logger.LogInformation("[job] Source {Provider} ({Lang}) {Action}.",
                    provider.Name, provider.Language, runNow ? "enabled+run-now" : "enabled");
            }
            else
            {
                await _jobManagement.DisableRecurringJobAsync(JobType.GetLatest, mihonProviderId, token)
                    .ConfigureAwait(false);
                _logger.LogInformation("[job] Source {Provider} ({Lang}) disabled.",
                    provider.Name, provider.Language);
            }
        }

        #endregion

        #region Job Status

        public async Task<bool?> GetJobStatusAsync(JobType jobType, string key, CancellationToken token = default)
        {
            return await _jobManagement.GetRecurringJobStatusAsync(jobType, key, token).ConfigureAwait(false);
        }

        #endregion

        #region Helper Methods

        private static string BuildProviderGroupKey(SeriesProviderEntity provider)
        {
            return $"{provider.Provider}|{provider.Language}|{provider.Scanlator ?? ""}";
        }

        private static string BuildSourceGroupKey(ProviderStorageEntity provider)
        {
            return $"{provider.Name}|{provider.Language}";
        }

        #endregion
    }
}