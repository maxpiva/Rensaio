using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Daily;
using RensaioBackend.Services.Downloads;
using RensaioBackend.Services.Jobs.Models;

namespace RensaioBackend.Services.Jobs.Commands
{
    public class DailyUpdate : ICommand
    {
        public JobType JobType => JobType.DailyUpdate;
        public Type? ParameterType => null;
        private readonly DailyService _dailyService;

        [DynamicDependency(DynamicallyAccessedMemberTypes.PublicConstructors, typeof(DailyUpdate))]
        public DailyUpdate(DailyService dailyService)
        {
            _dailyService = dailyService;
        }

        public Task<JobResult> ExecuteAsync(JobInfo job, CancellationToken token = default)
        {
            return _dailyService.ExecuteAsync(job, token);
        }

    }
}
