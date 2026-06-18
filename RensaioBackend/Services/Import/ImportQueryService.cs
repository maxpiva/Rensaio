using RensaioBackend.Data;
using RensaioBackend.Extensions;
using RensaioBackend.Models;
using RensaioBackend.Services.Jobs;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
using static System.Net.Mime.MediaTypeNames;
using Action = RensaioBackend.Models.Action;
using RensaioBackend.Services.Jobs.Models;
using RensaioBackend.Services.Jobs.Report;
using RensaioBackend.Services.Helpers;
using RensaioBackend.Services.Import;
using RensaioBackend.Services.Providers;
using RensaioBackend.Services.Search;
using RensaioBackend.Services.Series;
using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;

namespace RensaioBackend.Services.Import;

public class ImportQueryService
{
    private readonly AppDbContext _db;

    private readonly SearchCommandService _searchCommand;

    public ImportQueryService(AppDbContext db, SearchCommandService searchCommand)
    {
        _db = db;
        _searchCommand = searchCommand;
    }

    public async Task<ImportTotalsDto> GetImportsTotalsAsync(CancellationToken token = default)
    {
        ImportTotalsDto totals = new ImportTotalsDto();
        List<RensaioBackend.Models.Database.ImportEntity> imports = await _db.Imports
            .Where(a => a.Status != ImportStatus.DoNotChange && a.Action == Action.Add)
            .AsNoTracking()
            .ToListAsync(token).ConfigureAwait(false);
        HashSet<string> providers = [];
        foreach (RensaioBackend.Models.Database.ImportEntity imp in imports)
        {
            totals.TotalSeries++;
            ImportChapterMetrics metrics = imp.CalculateSeriesMetrics();
            totals.TotalDownloads += metrics.TotalDownloads;
            foreach (string provider in metrics.Providers)
            {
                providers.Add(provider);
            }
        }
        totals.TotalProviders = providers.Count;
        return totals;
    }

    public async Task<List<ImportSeriesEntry>> GetImportsAsync(CancellationToken token = default)
    {
        var imports = await _db.Imports.ToListAsync(token).ConfigureAwait(false);
        return imports.Select(import => import.ToImportSeriesEntry()).ToList();
    }

    public async Task<ImportSeriesEntry?> AugmentAsync(string path, List<LinkedSeriesDto> linked, CancellationToken token = default)
    {
        RensaioBackend.Models.Database.ImportEntity? import = await _db.Imports.FirstOrDefaultAsync(a => a.Path == path, token).ConfigureAwait(false);
        if (import == null)
            return null;
        AugmentedResponseDto augmented = await _searchCommand.AugmentSeriesAsync(linked, token).ConfigureAwait(false);
        if (augmented.Series.Count > 0)
        {
            import.Series = augmented.Series;
            await _db.SaveChangesAsync(token).ConfigureAwait(false);
        }
        return import.ToImportSeriesEntry();
    }
}

