using RensaioBackend.Models;
using RensaioBackend.Models.ReadState;
using RensaioBackend.Models.Database;
using Microsoft.AspNetCore.Mvc;

namespace RensaioBackend.Controllers;

[ApiController]
[Route("/api/read-state")]
public class ReadStateController : ControllerBase
{
    private readonly Services.ReadState.ReadStateService _readStateService;
    private readonly Services.Series.SeriesQueryService _seriesQueryService;

    public ReadStateController(
        Services.ReadState.ReadStateService readStateService,
        Services.Series.SeriesQueryService seriesQueryService)
    {
        _readStateService = readStateService;
        _seriesQueryService = seriesQueryService;
    }

    /// <summary>
    /// GET /api/read-state/series/{seriesId} - Get all chapter read states for a series for the current user.
    /// </summary>
    [HttpGet("series/{seriesId:guid}")]
    public async Task<ActionResult<List<ChapterReadState>>> GetSeriesReadState(Guid seriesId, CancellationToken token)
    {
        UserEntity? user = HttpContext.Items["User"] as UserEntity;
        if (user == null)
            return Unauthorized();

        var series = await _seriesQueryService.GetSeriesAsync(seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound();

        var states = _readStateService.GetSeriesReadStates(user.Username, series.StoragePath);
        return Ok(states);
    }

}

public class ChapterReadStateUpdateDto
{
    public int LastReadPage { get; set; }
    public int TotalPages { get; set; }
}