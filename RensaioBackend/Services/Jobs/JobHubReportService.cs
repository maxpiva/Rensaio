using RensaioBackend.Extensions;
using RensaioBackend.Hubs;
using RensaioBackend.Models;
using RensaioBackend.Models.Database;
using RensaioBackend.Services.Jobs.Models;
using RensaioBackend.Services.Jobs.Report;
using Microsoft.AspNetCore.SignalR;

namespace RensaioBackend.Services.Jobs;

/// <summary>
/// Unified service for reporting both job state changes and progress updates via SignalR
/// </summary>
public class JobHubReportService : IReportProgress
{
    private readonly IHubContext<ProgressHub> _hub;

    public JobHubReportService(IHubContext<ProgressHub> hub)
    {
        _hub = hub;
    }

    /// <summary>
    /// Reports job state changes (queued, running, completed, failed) to SignalR clients
    /// </summary>
    /// <param name="state">The job queue state</param>
    /// <param name="token">Cancellation token</param>
    /// <returns>Task representing the async operation</returns>
    /*
    public Task ReportJobAsync(Enqueue state, CancellationToken token = default)
    {
        return _hub.Clients.All.SendAsync("Jobs", state.ToJobState(), token);
    }
    */

    /// <summary>
    /// Reports job progress updates to SignalR clients
    /// </summary>
    /// <param name="state">The progress state</param>
    /// <returns>Task representing the async operation</returns>
    public Task ReportProgressAsync(ProgressState state)
    {
        return _hub.Clients.All.SendAsync("Progress", state);
    }

    /// <summary>
    /// Creates a progress reporter for a specific job
    /// </summary>
    /// <param name="job">Job information</param>
    /// <returns>Progress reporter instance</returns>
    public ProgressReporter CreateReporter(JobInfo job)
    {
        return new ProgressReporter(this, job);
    }
}