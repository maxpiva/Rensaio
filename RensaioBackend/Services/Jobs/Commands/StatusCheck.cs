using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Jobs.Models;
using RensaioBackend.Services.Status;

namespace RensaioBackend.Services.Jobs.Commands;

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