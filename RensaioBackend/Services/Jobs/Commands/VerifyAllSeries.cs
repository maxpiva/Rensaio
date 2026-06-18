using System.Diagnostics.CodeAnalysis;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Jobs.Models;
using RensaioBackend.Services.Series;

namespace RensaioBackend.Services.Jobs.Commands;

public class VerifyAllSeries : ICommand
{
    public JobType JobType => JobType.VerifyAllSeries;
    public Type? ParameterType => null;
    private readonly SeriesArchiveService _archiveService;

    [DynamicDependency(DynamicallyAccessedMemberTypes.PublicConstructors, typeof(VerifyAllSeries))]
    public VerifyAllSeries(SeriesArchiveService archiveService)
    {
        _archiveService = archiveService;
    }

    public Task<JobResult> ExecuteAsync(JobInfo job, CancellationToken token = default)
    {
        return _archiveService.VerifyAllSeriesAsync(job, token);
    }
}