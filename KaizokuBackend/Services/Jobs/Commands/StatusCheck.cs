using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Jobs.Models;
using KaizokuBackend.Services.Status;

namespace KaizokuBackend.Services.Jobs.Commands;

public class StatusCheck : ICommand
{
    public JobType JobType => JobType.StatusCheck;
    public Type? ParameterType => null;
    private readonly StatusEvaluationService _statusEvaluation;

    public StatusCheck(StatusEvaluationService statusEvaluation)
    {
        _statusEvaluation = statusEvaluation;
    }

    public async Task<JobResult> ExecuteAsync(JobInfo job, CancellationToken token = default)
    {
        await _statusEvaluation.EvaluateAllAsync(token).ConfigureAwait(false);
        return JobResult.Success;
    }
}