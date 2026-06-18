using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Import;
using RensaioBackend.Services.Jobs.Models;
using System.Diagnostics.CodeAnalysis;

namespace RensaioBackend.Services.Jobs.Commands;

public class SearchProviders : ICommand
{
    public JobType JobType => JobType.SearchProviders;
    public Type? ParameterType => null;
    private readonly ImportCommandService _service;
    [DynamicDependency(DynamicallyAccessedMemberTypes.PublicConstructors, typeof(SearchProviders))]
    public SearchProviders(ImportCommandService service)
    {
        _service = service;
    }
    public Task<JobResult> ExecuteAsync(JobInfo job, CancellationToken token = default)
    {
        return _service.SearchSeriesAsync(job, token);
    }
}