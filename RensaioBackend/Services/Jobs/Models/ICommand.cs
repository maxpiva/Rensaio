using RensaioBackend.Models.Enums;

namespace RensaioBackend.Services.Jobs.Models;

public interface ICommand
{
    public JobType JobType { get; }
    public Type? ParameterType { get; }
    public Task<JobResult> ExecuteAsync(JobInfo job, CancellationToken token = default);
}