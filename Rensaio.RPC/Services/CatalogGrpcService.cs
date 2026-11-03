using Grpc.Core;
using Microsoft.Extensions.Logging;
using Mihon.ExtensionsBridge.Models.Abstractions;
using Mihon.ExtensionsBridge.Models.Extensions;
using Rensaio.RPC.Contracts;
using Rensaio.RPC.Contracts.V1;
using Rensaio.RPC.Runtime;

namespace Rensaio.RPC.Services;

/// <summary>
/// Catalogue/source reads forwarded to <see cref="ISourceInterop"/>.
///
/// Every call runs through <see cref="SourceCallRunner"/> so the global
/// concurrency budget, retry/backoff, and (for same-manga calls) the per-manga
/// keyed lock are applied where the extension actually runs. Manga/Chapter
/// inputs and outputs travel as JSON of the shared model types.
/// </summary>
public sealed class CatalogGrpcService : CatalogService.CatalogServiceBase
{
    private readonly SourceResolver _resolver;
    private readonly SourceCallRunner _runner;
    private readonly RpcStartupToken _token;
    private readonly RpcReadiness _readiness;
    private readonly ILogger<CatalogGrpcService> _logger;

    public CatalogGrpcService(
        SourceResolver resolver,
        SourceCallRunner runner,
        RpcStartupToken token,
        RpcReadiness readiness,
        ILogger<CatalogGrpcService> logger)
    {
        _resolver = resolver;
        _runner = runner;
        _token = token;
        _readiness = readiness;
        _logger = logger;
    }

    public override async Task<JsonResult> GetDetails(SourceMangaRequest request, ServerCallContext context)
    {
        return await ExecuteAsync(request.Source, context, async source =>
        {
            Manga manga = RpcJson.Deserialize<Manga>(request.MangaJson) ?? throw new SourceNotFoundException("Missing manga payload.");
            ParsedManga result = await _runner.RunAsync(
                () => source.GetDetailsAsync(manga, context.CancellationToken),
                MangaLockKey(source, manga)).ConfigureAwait(false);

            return new JsonResult { Json = RpcJson.Serialize(result) };
        }).ConfigureAwait(false);
    }

    public override async Task<JsonResult> GetChapters(SourceMangaRequest request, ServerCallContext context)
    {
        return await ExecuteAsync(request.Source, context, async source =>
        {
            Manga manga = RpcJson.Deserialize<Manga>(request.MangaJson) ?? throw new SourceNotFoundException("Missing manga payload.");
            List<ParsedChapter> result = await _runner.RunAsync(
                () => source.GetChaptersAsync(manga, context.CancellationToken),
                MangaLockKey(source, manga)).ConfigureAwait(false);

            return new JsonResult { Json = RpcJson.Serialize(result) };
        }).ConfigureAwait(false);
    }

    public override async Task<JsonResult> GetDetailsAndChapters(SourceMangaRequest request, ServerCallContext context)
    {
        return await ExecuteAsync(request.Source, context, async source =>
        {
            Manga manga = RpcJson.Deserialize<Manga>(request.MangaJson) ?? throw new SourceNotFoundException("Missing manga payload.");
            MangaUpdate result = await _runner.RunAsync(
                () => source.GetDetailsAndChaptersAsync(manga, context.CancellationToken),
                MangaLockKey(source, manga)).ConfigureAwait(false);

            return new JsonResult { Json = RpcJson.Serialize(result) };
        }).ConfigureAwait(false);
    }

    public override async Task<JsonResult> Search(SourceSearchRequest request, ServerCallContext context)
    {
        return await ExecuteAsync(request.Source, context, async source =>
        {
            MangaList result = await _runner.RunAsync(
                () => source.SearchAsync(request.Page, request.Query, context.CancellationToken))
                .ConfigureAwait(false);

            return new JsonResult { Json = RpcJson.Serialize(result) };
        }).ConfigureAwait(false);
    }

    public override async Task<JsonResult> GetPopular(SourcePageRequest request, ServerCallContext context)
    {
        return await ExecuteAsync(request.Source, context, async source =>
        {
            MangaList result = await _runner.RunAsync(
                () => source.GetPopularAsync(request.Page, context.CancellationToken)).ConfigureAwait(false);

            return new JsonResult { Json = RpcJson.Serialize(result) };
        }).ConfigureAwait(false);
    }

    public override async Task<JsonResult> GetLatest(SourcePageRequest request, ServerCallContext context)
    {
        return await ExecuteAsync(request.Source, context, async source =>
        {
            MangaList result = await _runner.RunAsync(
                () => source.GetLatestAsync(request.Page, context.CancellationToken)).ConfigureAwait(false);

            return new JsonResult { Json = RpcJson.Serialize(result) };
        }).ConfigureAwait(false);
    }

    public override async Task<JsonResult> GetPages(SourceChapterRequest request, ServerCallContext context)
    {
        return await ExecuteAsync(request.Source, context, async source =>
        {
            Chapter chapter = RpcJson.Deserialize<Chapter>(request.ChapterJson) ?? throw new SourceNotFoundException("Missing chapter payload.");
            List<Page> result = await _runner.RunAsync(
                () => source.GetPagesAsync(chapter, context.CancellationToken)).ConfigureAwait(false);

            return new JsonResult { Json = RpcJson.Serialize(result) };
        }).ConfigureAwait(false);
    }

    public override async Task<JsonResult> GetMangaUrl(SourceMangaRequest request, ServerCallContext context)
    {
        return await ExecuteAsync(request.Source, context, async source =>
        {
            Manga manga = RpcJson.Deserialize<Manga>(request.MangaJson) ?? throw new SourceNotFoundException("Missing manga payload.");
            string url = await _runner.RunAsync(
                () => source.GetMangaUrlAsync(manga, context.CancellationToken)).ConfigureAwait(false);

            return new JsonResult { Json = RpcJson.Serialize(url ?? string.Empty) };
        }).ConfigureAwait(false);
    }

    public override async Task<JsonResult> GetPreferences(SourceRef request, ServerCallContext context)
    {
        return await ExecuteAsync(request, context, source =>
        {
            List<KeyPreference> prefs = source.GetPreferences() ?? [];
            return Task.FromResult(new JsonResult { Json = RpcJson.Serialize(prefs) });
        }).ConfigureAwait(false);
    }

    public override async Task<BoolValue> SetPreferenceByIndex(SetPreferenceIndexRequest request, ServerCallContext context)
    {
        JsonResult result = await ExecuteAsync(request.Source, context, source =>
        {
            source.SetPreference(request.Position, request.Value ?? string.Empty);
            return Task.FromResult(new JsonResult { Json = "true" });
        }).ConfigureAwait(false);

        return new BoolValue { Value = true };
    }

    public override async Task<BoolValue> SetPreference(SetPreferenceRequest request, ServerCallContext context)
    {
        await ExecuteAsync(request.Source, context, source =>
        {
            KeyPreference pref = RpcJson.Deserialize<KeyPreference>(request.PreferenceJson)
                ?? throw new SourceNotFoundException("Missing preference payload.");
            source.SetPreference(pref);
            return Task.FromResult(new JsonResult { Json = "true" });
        }).ConfigureAwait(false);

        return new BoolValue { Value = true };
    }

    public override async Task<BoolValue> SetPreferences(SetPreferencesRequest request, ServerCallContext context)
    {
        await ExecuteAsync(request.Source, context, source =>
        {
            List<KeyPreference> prefs = RpcJson.Deserialize<List<KeyPreference>>(request.PreferencesJson)
                ?? throw new SourceNotFoundException("Missing preferences payload.");
            source.SetPreferences(prefs);
            return Task.FromResult(new JsonResult { Json = "true" });
        }).ConfigureAwait(false);

        return new BoolValue { Value = true };
    }

    /// <summary>
    /// Shared wrapper: authorize, resolve, run, and map failures to gRPC status.
    /// </summary>
    private async Task<JsonResult> ExecuteAsync(
        SourceRef reference,
        ServerCallContext context,
        Func<ISourceInterop, Task<JsonResult>> action)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        GrpcGuard.EnsureReady(_readiness);
        try
        {
            ISourceInterop source = await _resolver
                .ResolveAsync(reference.PackageId, reference.SourceId, context.CancellationToken)
                .ConfigureAwait(false);
            return await action(source).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    /// <summary>
    /// Same-manga serialization key, matching the pre-split convention
    /// (canonical source id + manga url).
    /// </summary>
    private static string MangaLockKey(ISourceInterop source, Manga manga)
        => $"{source.Id}|{manga.Url}";
}
