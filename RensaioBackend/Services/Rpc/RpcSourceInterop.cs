using System.Runtime.ExceptionServices;
using Grpc.Core;
using Grpc.Net.Client;
using Mihon.ExtensionsBridge.Models;
using Mihon.ExtensionsBridge.Models.Abstractions;
using Mihon.ExtensionsBridge.Models.Extensions;
using Rensaio.RPC.Contracts;
using Rensaio.RPC.Contracts.V1;
using RensaioBackend.Services.Scrobbling.Providers;

namespace RensaioBackend.Services.Rpc;

/// <summary>
/// Backend-side <see cref="ISourceInterop"/> that forwards every call to the RPC
/// process over gRPC. Streaming payloads are materialized into a
/// <see cref="ContentTypeStream"/> so existing callers keep the same shape, while
/// the wire transfer stays chunked (the backend only buffers on demand).
/// </summary>
public sealed class RpcSourceInterop : ISourceInterop
{
    private readonly RpcBridgeClient _bridge;
    private readonly SourceDescriptor _descriptor;

    public RpcSourceInterop(RpcBridgeClient bridge, SourceDescriptor descriptor)
    {
        _bridge = bridge;
        _descriptor = descriptor;
    }

    public long Id => _descriptor.SourceId;
    public bool IsCatalogueSource => _descriptor.IsCatalogueSource;
    public bool IsConfigurableSource => _descriptor.IsConfigurable;
    public bool IsHttpSource => _descriptor.IsHttpSource;
    public bool IsParsedHttpSource => _descriptor.IsParsedHttpSource;
    public string Language => _descriptor.Language;
    public string Name => _descriptor.Name;
    public bool SupportsLatest => _descriptor.SupportsLatest;

    private Task<CatalogService.CatalogServiceClient> CatalogAsync(CancellationToken token)
        => _bridge.GetCallContextAsync(token).ContinueWith(
            t => new CatalogService.CatalogServiceClient(t.Result.Channel), token,
            TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);

    private SourceRef Ref() => new() { SourceId = _descriptor.SourceId, PackageId = _descriptor.PackageId };

    /// <summary>
    /// Runs an RPC call and, on failure, rethrows the original exception the RPC host
    /// reconstructed from the status detail (see <see cref="RpcExceptionUnwrapper"/>).
    /// gRPC otherwise surfaces a bare <see cref="Grpc.Core.RpcException"/>, hiding the true
    /// category (HTTP status, cancellation) from every caller of this interop.
    /// </summary>
    private static async Task<T> GuardedAsync<T>(Func<Task<T>> call)
    {
        try
        {
            return await call().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // `throw <expr>` resets the stack trace to THIS line, which is why the original
            // origin was invisible. Rethrow via ExceptionDispatchInfo so whatever trace the
            // unwrapped exception carries (and the reconstructed RemoteSourceException's
            // RemoteStack) is preserved rather than replaced by the guard frame.
            ExceptionDispatchInfo.Capture(RpcExceptionUnwrapper.Unwrap(ex)).Throw();
            throw; // unreachable; satisfies the compiler's definite-assignment analysis
        }
    }

    private static T Guarded<T>(Func<T> call)
    {
        try
        {
            return call();
        }
        catch (Exception ex)
        {
            ExceptionDispatchInfo.Capture(RpcExceptionUnwrapper.Unwrap(ex)).Throw();
            throw; // unreachable
        }
    }

    private static void GuardedAction(Action call)
    {
        try
        {
            call();
        }
        catch (Exception ex)
        {
            ExceptionDispatchInfo.Capture(RpcExceptionUnwrapper.Unwrap(ex)).Throw();
        }
    }

    public async Task<MangaUpdate> GetDetailsAndChaptersAsync(Manga manga, CancellationToken token = default)
    {
        await ProviderRateLimits.EnforceSourceMethodAsync(_descriptor.PackageId, token).ConfigureAwait(false);
        var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = await GuardedAsync(() => client.GetDetailsAndChaptersAsync(
            new SourceMangaRequest { Source = Ref(), MangaJson = RpcJson.Serialize(manga) }, headers, null, token)
            .ResponseAsync).ConfigureAwait(false);
        return RpcJson.Deserialize<MangaUpdate>(r.Json) ?? new MangaUpdate();
    }

    public async Task<List<ParsedChapter>> GetChaptersAsync(Manga manga, CancellationToken token = default)
    {
        await ProviderRateLimits.EnforceSourceMethodAsync(_descriptor.PackageId, token).ConfigureAwait(false);
        var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = await GuardedAsync(() => client.GetChaptersAsync(
            new SourceMangaRequest { Source = Ref(), MangaJson = RpcJson.Serialize(manga) }, headers, null, token)
            .ResponseAsync).ConfigureAwait(false);
        return RpcJson.Deserialize<List<ParsedChapter>>(r.Json) ?? [];
    }

    public async Task<ParsedManga> GetDetailsAsync(Manga manga, CancellationToken token = default)
    {
        await ProviderRateLimits.EnforceSourceMethodAsync(_descriptor.PackageId, token).ConfigureAwait(false);
        var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = await GuardedAsync(() => client.GetDetailsAsync(
            new SourceMangaRequest { Source = Ref(), MangaJson = RpcJson.Serialize(manga) }, headers, null, token)
            .ResponseAsync).ConfigureAwait(false);
        return RpcJson.Deserialize<ParsedManga>(r.Json) ?? new ParsedManga();
    }

    public async Task<string> GetMangaUrlAsync(Manga manga, CancellationToken token = default)
    {
        var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = await GuardedAsync(() => client.GetMangaUrlAsync(
            new SourceMangaRequest { Source = Ref(), MangaJson = RpcJson.Serialize(manga) }, headers, null, token)
            .ResponseAsync).ConfigureAwait(false);
        return RpcJson.Deserialize<string>(r.Json) ?? string.Empty;
    }

    public Task<ContentTypeStream> GetPageImageAsync(Page page, CancellationToken token = default)
        => DownloadStreamAsync((channel, headers) =>
        {
            var client = new ContentService.ContentServiceClient(channel);
            return client.GetPageImage(
                new PageImageRequest { Source = Ref(), PageJson = RpcJson.Serialize(page) }, headers, null, token);
        }, token);

    public Task<ContentTypeStream> DownloadUrlAsync(string url, CancellationToken token = default)
        => DownloadStreamAsync((channel, headers) =>
        {
            var client = new ContentService.ContentServiceClient(channel);
            return client.DownloadUrl(
                new DownloadUrlRequest { Source = Ref(), Url = url }, headers, null, token);
        }, token);

    /// <summary>
    /// Drains a server stream of chunks into a ContentTypeStream, capturing the
    /// content type from the first message.
    /// </summary>
    private async Task<ContentTypeStream> DownloadStreamAsync(
        Func<GrpcChannel, Grpc.Core.Metadata, AsyncServerStreamingCall<Chunk>> start,
        CancellationToken token)
    {
        try
        {
            await ProviderRateLimits.EnforceSourceImageAsync(_descriptor.PackageId, token).ConfigureAwait(false);
            var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
            using var call = start(channel, headers);

            var buffer = new MemoryStream();
            string contentType = "application/octet-stream";

            await foreach (Chunk chunk in call.ResponseStream.ReadAllAsync(token).ConfigureAwait(false))
            {
                if (chunk.First && !string.IsNullOrEmpty(chunk.ContentType))
                    contentType = chunk.ContentType;
                if (chunk.Data.Length > 0)
                    buffer.Write(chunk.Data.Span);
            }

            buffer.Position = 0;
            return new RpcContentTypeStream(contentType, buffer.ToArray());
        }
        catch (Exception ex)
        {
            // Streaming failures (including the terminal status raised mid-stream) arrive as a
            // bare RpcException; restore the original category for the caller. Rethrow via
            // ExceptionDispatchInfo so the reconstructed exception's own origin is preserved.
            ExceptionDispatchInfo.Capture(RpcExceptionUnwrapper.Unwrap(ex)).Throw();
            throw; // unreachable
        }
    }

    public async Task<MangaList> GetLatestAsync(int page, CancellationToken token = default)
    {
        await ProviderRateLimits.EnforceSourceMethodAsync(_descriptor.PackageId, token).ConfigureAwait(false);
        var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = await GuardedAsync(() => client.GetLatestAsync(
            new SourcePageRequest { Source = Ref(), Page = page }, headers, null, token).ResponseAsync).ConfigureAwait(false);
        return RpcJson.Deserialize<MangaList>(r.Json) ?? new MangaList();
    }

    public async Task<List<Page>> GetPagesAsync(Chapter chapter, CancellationToken token = default)
    {
        await ProviderRateLimits.EnforceSourceMethodAsync(_descriptor.PackageId, token).ConfigureAwait(false);
        var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = await GuardedAsync(() => client.GetPagesAsync(
            new SourceChapterRequest { Source = Ref(), ChapterJson = RpcJson.Serialize(chapter) }, headers, null, token)
            .ResponseAsync).ConfigureAwait(false);
        return RpcJson.Deserialize<List<Page>>(r.Json) ?? [];
    }

    public async Task<MangaList> GetPopularAsync(int page, CancellationToken token = default)
    {
        await ProviderRateLimits.EnforceSourceMethodAsync(_descriptor.PackageId, token).ConfigureAwait(false);
        var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = await GuardedAsync(() => client.GetPopularAsync(
            new SourcePageRequest { Source = Ref(), Page = page }, headers, null, token).ResponseAsync).ConfigureAwait(false);
        return RpcJson.Deserialize<MangaList>(r.Json) ?? new MangaList();
    }

    public async Task<MangaList> SearchAsync(int page, string query, CancellationToken token = default)
    {
        await ProviderRateLimits.EnforceSourceMethodAsync(_descriptor.PackageId, token).ConfigureAwait(false);
        var (channel, headers) = await _bridge.GetCallContextAsync(token).ConfigureAwait(false);
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = await GuardedAsync(() => client.SearchAsync(
            new SourceSearchRequest { Source = Ref(), Page = page, Query = query }, headers, null, token)
            .ResponseAsync).ConfigureAwait(false);
        return RpcJson.Deserialize<MangaList>(r.Json) ?? new MangaList();
    }

    public List<KeyPreference> GetPreferences()
    {
        var (channel, headers) = _bridge.GetCallContextAsync(CancellationToken.None).GetAwaiter().GetResult();
        var client = new CatalogService.CatalogServiceClient(channel);
        JsonResult r = Guarded(() => client.GetPreferencesAsync(Ref(), headers).ResponseAsync.GetAwaiter().GetResult());
        return RpcJson.Deserialize<List<KeyPreference>>(r.Json) ?? [];
    }

    public void SetPreference(int position, string value)
    {
        var (channel, headers) = _bridge.GetCallContextAsync(CancellationToken.None).GetAwaiter().GetResult();
        var client = new CatalogService.CatalogServiceClient(channel);
        GuardedAction(() => client.SetPreferenceByIndexAsync(
            new SetPreferenceIndexRequest { Source = Ref(), Position = position, Value = value }, headers)
            .ResponseAsync.GetAwaiter().GetResult());
    }

    public void SetPreference(KeyPreference preference)
    {
        var (channel, headers) = _bridge.GetCallContextAsync(CancellationToken.None).GetAwaiter().GetResult();
        var client = new CatalogService.CatalogServiceClient(channel);
        GuardedAction(() => client.SetPreferenceAsync(
            new SetPreferenceRequest { Source = Ref(), PreferenceJson = RpcJson.Serialize(preference) }, headers)
            .ResponseAsync.GetAwaiter().GetResult());
    }

    public void SetPreferences(IEnumerable<KeyPreference> preferences)
    {
        var (channel, headers) = _bridge.GetCallContextAsync(CancellationToken.None).GetAwaiter().GetResult();
        var client = new CatalogService.CatalogServiceClient(channel);
        GuardedAction(() => client.SetPreferencesAsync(
            new SetPreferencesRequest { Source = Ref(), PreferencesJson = RpcJson.Serialize(preferences) }, headers)
            .ResponseAsync.GetAwaiter().GetResult());
    }

    /// <summary>
    /// No-op on the backend side: the interop lifecycle (and its IKVM classloader
    /// release) is owned entirely by the RPC process.
    /// </summary>
    public void Release()
    {
    }
}

/// <summary>
/// ContentTypeStream over an already-materialized buffer. Uses the protected
/// buffer constructor of <see cref="ContentTypeStream"/> so the payload is
/// available immediately and the stream is seekable like the original.
/// </summary>
internal sealed class RpcContentTypeStream : ContentTypeStream
{
    public RpcContentTypeStream(string contentType, byte[] buffer)
        : base(buffer)
    {
        ContentType = contentType;
    }
}
