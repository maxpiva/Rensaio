using Grpc.Core;
using Microsoft.Extensions.Logging;
using Mihon.ExtensionsBridge.Models;
using Mihon.ExtensionsBridge.Models.Abstractions;
using Mihon.ExtensionsBridge.Models.Extensions;
using Rensaio.RPC.Contracts;
using Rensaio.RPC.Contracts.V1;
using Rensaio.RPC.Runtime;

namespace Rensaio.RPC.Services;

/// <summary>
/// Binary payloads (page images and direct downloads) streamed to the backend
/// as chunks so the backend never buffers a whole payload in memory.
/// </summary>
public sealed class ContentGrpcService : ContentService.ContentServiceBase
{
    private readonly SourceResolver _resolver;
    private readonly SourceCallRunner _runner;
    private readonly RpcStartupToken _token;
    private readonly RpcReadiness _readiness;
    private readonly ILogger<ContentGrpcService> _logger;

    public ContentGrpcService(
        SourceResolver resolver,
        SourceCallRunner runner,
        RpcStartupToken token,
        RpcReadiness readiness,
        ILogger<ContentGrpcService> logger)
    {
        _resolver = resolver;
        _runner = runner;
        _token = token;
        _readiness = readiness;
        _logger = logger;
    }

    public override async Task GetPageImage(
        PageImageRequest request,
        IServerStreamWriter<Chunk> responseStream,
        ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        GrpcGuard.EnsureReady(_readiness);
        try
        {
            Page page = RpcJson.Deserialize<Page>(request.PageJson)
                ?? throw new SourceNotFoundException("Missing page payload.");

            ISourceInterop source = await _resolver
                .ResolveAsync(request.Source.PackageId, request.Source.SourceId, context.CancellationToken)
                .ConfigureAwait(false);

            ContentTypeStream image = await _runner.RunAsync(
                () => source.GetPageImageAsync(page, context.CancellationToken)).ConfigureAwait(false);

            if (image == null)
                throw new SourceNotFoundException("Source returned no image.");

            await ExtensionsGrpcService
                .StreamChunksAsync(image, image.ContentType ?? "application/octet-stream", responseStream, context.CancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task DownloadUrl(
        DownloadUrlRequest request,
        IServerStreamWriter<Chunk> responseStream,
        ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        GrpcGuard.EnsureReady(_readiness);
        try
        {
            ISourceInterop source = await _resolver
                .ResolveAsync(request.Source.PackageId, request.Source.SourceId, context.CancellationToken)
                .ConfigureAwait(false);

            ContentTypeStream data = await _runner.RunAsync(
                () => source.DownloadUrlAsync(request.Url, context.CancellationToken)).ConfigureAwait(false);

            if (data == null)
                throw new SourceNotFoundException("Source returned no content.");

            await ExtensionsGrpcService
                .StreamChunksAsync(data, data.ContentType ?? "application/octet-stream", responseStream, context.CancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }
}
