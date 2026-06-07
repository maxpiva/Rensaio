using KaizokuBackend.Models;
using KaizokuBackend.Models.ReadState;
using KaizokuBackend.Models.Database;
using Microsoft.AspNetCore.Mvc;

namespace KaizokuBackend.Controllers;

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

    /// <summary>
    /// PUT /api/read-state/series/{seriesId}/chapter/{chapterNumber} - Update read state for a chapter.
    /// </summary>
    [HttpPut("series/{seriesId:guid}/chapter/{chapterNumber:decimal}")]
    public async Task<ActionResult> UpdateReadState(Guid seriesId, decimal chapterNumber,
        [FromBody] ChapterReadStateUpdateDto dto, CancellationToken token)
    {
        UserEntity? user = HttpContext.Items["User"] as UserEntity;
        if (user == null)
            return Unauthorized();

        var series = await _seriesQueryService.GetSeriesAsync(seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound();

        _readStateService.SetReadState(user.Username, series.StoragePath, chapterNumber, dto.LastReadPage, dto.TotalPages);
        return Ok(new { success = true });
    }

    /// <summary>
    /// POST /api/read-state/series/{seriesId}/chapter/{chapterNumber}/complete - Mark chapter as completed.
    /// </summary>
    [HttpPost("series/{seriesId:guid}/chapter/{chapterNumber:decimal}/complete")]
    public async Task<ActionResult> MarkChapterCompleted(Guid seriesId, decimal chapterNumber, CancellationToken token)
    {
        UserEntity? user = HttpContext.Items["User"] as UserEntity;
        if (user == null)
            return Unauthorized();

        var series = await _seriesQueryService.GetSeriesAsync(seriesId, token);
        if (series == null || string.IsNullOrWhiteSpace(series.StoragePath))
            return NotFound();

        _readStateService.MarkChapterCompleted(user.Username, series.StoragePath, chapterNumber);
        return Ok(new { success = true });
    }
}

public class ChapterReadStateUpdateDto
{
    public int LastReadPage { get; set; }
    public int TotalPages { get; set; }
}