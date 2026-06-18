using System.Diagnostics.CodeAnalysis;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Jobs.Models;
using RensaioBackend.Services.Series;

namespace RensaioBackend.Services.Jobs.Commands;

public class UpdateAllSeries : ICommand
{
    public JobType JobType => JobType.UpdateAllSeries;
    public Type? ParameterType => null;
    private readonly SeriesArchiveService _archiveService;
    
    [DynamicDependency(DynamicallyAccessedMemberTypes.PublicConstructors, typeof(UpdateAllSeries))]
    public UpdateAllSeries(SeriesArchiveService archiveService)
    {
        _archiveService = archiveService;
    }

    public Task<JobResult> ExecuteAsync(JobInfo job, CancellationToken token = default)
    {
        return _archiveService.UpdateAllSeriesAsync(job, token);
    }
}