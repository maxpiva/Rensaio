using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Import;
using RensaioBackend.Services.Jobs.Models;
using System.Diagnostics.CodeAnalysis;

namespace RensaioBackend.Services.Jobs.Commands;

public class InstallAdditionalExtensions : ICommand
{
    public JobType JobType => JobType.InstallAdditionalExtensions;
    public Type? ParameterType => null;
    private readonly ImportCommandService _service;
    [DynamicDependency(DynamicallyAccessedMemberTypes.PublicConstructors, typeof(InstallAdditionalExtensions))]
    public InstallAdditionalExtensions(ImportCommandService service)
    {
        _service = service;
    }
    public Task<JobResult> ExecuteAsync(JobInfo job, CancellationToken token = default)
    {
        return _service.AddExtensionsAsync(job, 0, 100,token);
    }
}