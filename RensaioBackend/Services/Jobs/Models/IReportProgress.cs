using RensaioBackend.Models;

namespace RensaioBackend.Services.Jobs.Models;

public interface IReportProgress
{
    Task ReportProgressAsync(ProgressState state);
}