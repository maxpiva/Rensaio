using Google.Protobuf;
using Grpc.Core;
using Mihon.ExtensionsBridge.Core.Abstractions;
using Mihon.ExtensionsBridge.Core.Extensions;
using Mihon.ExtensionsBridge.Models;
using Mihon.ExtensionsBridge.Models.Abstractions;
using Rensaio.RPC.Contracts;
using Rensaio.RPC.Contracts.V1;
using Rensaio.RPC.Runtime;

namespace Rensaio.RPC.Services;

/// <summary>
/// Extension/repository surface.
///
/// Product rule enforced here: the backend can enumerate what repositories
/// offer, switch active versions, remove a present version, and install a
/// custom APK — but it can no longer install/uninstall extensions from
/// repositories. Complex descriptors travel as JSON of the shared model types.
/// </summary>
public sealed class ExtensionsGrpcService : ExtensionsService.ExtensionsServiceBase
{
    private const int ChunkSize = 64 * 1024;

    private readonly IInternalExtensionManager _extensions;
    private readonly IInternalRepositoryManager _repositories;
    private readonly IWorkingFolderStructure _folders;
    private readonly RpcStartupToken _token;
    private readonly ILogger<ExtensionsGrpcService> _logger;

    public ExtensionsGrpcService(
        IInternalExtensionManager extensions,
        IInternalRepositoryManager repositories,
        IWorkingFolderStructure folders,
        RpcStartupToken token,
        ILogger<ExtensionsGrpcService> logger)
    {
        _extensions = extensions;
        _repositories = repositories;
        _folders = folders;
        _token = token;
        _logger = logger;
    }

    public override Task<JsonResult> ListInstalledExtensions(ListInstalledRequest request, ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            // Temporary groups (online extensions prepared for a sweep) are excluded unless
            // the caller explicitly asks for them.
            List<RepositoryGroup> groups = _extensions.ListExtensions(request.IncludeTemporary);
            return Task.FromResult(new JsonResult { Json = RpcJson.Serialize(groups) });
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task<JsonResult> ListAvailableExtensions(ListAvailableRequest request, ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            if (request.Refresh)
                await _repositories.RefreshAllRepositoriesAsync(context.CancellationToken).ConfigureAwait(false);

            List<TachiyomiRepository> repos = _repositories.ListOnlineRepositories();
            return new JsonResult { Json = RpcJson.Serialize(repos) };
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override Task<JsonResult> ListVersions(PackageRequest request, ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            RepositoryGroup? group = _extensions.ListExtensions()
                .FirstOrDefault(g => g.Entries.Any(e =>
                    string.Equals(e.Extension?.Package, request.PackageId, StringComparison.OrdinalIgnoreCase)));

            if (group == null)
                throw new SourceNotFoundException($"Extension '{request.PackageId}' was not found.");

            var versions = group.Entries
                .Select((e, i) => new { Version = e.Extension?.Version, Active = i == group.ActiveEntry })
                .OrderByDescending(v => v.Version, StringComparer.OrdinalIgnoreCase)
                .ToList();

            return Task.FromResult(new JsonResult { Json = RpcJson.Serialize(versions) });
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task<JsonResult> ListSources(PackageRequest request, ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            // Temporary-inclusive: a prepared online package must expose its sources.
            RepositoryGroup? group = _extensions.ListExtensions(includeTemporary: true)
                .FirstOrDefault(g => g.Entries.Any(e =>
                    string.Equals(e.Extension?.Package, request.PackageId, StringComparison.OrdinalIgnoreCase)));

            if (group == null)
                throw new SourceNotFoundException($"Extension '{request.PackageId}' was not found.");

            IExtensionInterop interop = await _extensions
                .GetInteropAsync(group, context.CancellationToken).ConfigureAwait(false);

            var descriptors = interop.Sources.Select(s => new SourceDescriptor
            {
                SourceId = s.Id,
                Name = s.Name,
                Language = s.Language,
                SupportsLatest = s.SupportsLatest,
                IsConfigurable = s.IsConfigurableSource,
                IsHttpSource = s.IsHttpSource,
                IsParsedHttpSource = s.IsParsedHttpSource,
                IsCatalogueSource = s.IsCatalogueSource,
            }).ToList();

            return new JsonResult { Json = RpcJson.Serialize(descriptors) };
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task<BoolValue> SetActiveVersion(SetActiveVersionRequest request, ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            RepositoryGroup? group = _extensions.ListExtensions()
                .FirstOrDefault(g => g.Entries.Any(e =>
                    string.Equals(e.Extension?.Package, request.PackageId, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(e.Extension?.Version, request.Version, StringComparison.OrdinalIgnoreCase)));

            if (group == null)
                throw new SourceNotFoundException(
                    $"Extension '{request.PackageId}' version '{request.Version}' was not found.");

            int index = group.Entries.FindIndex(e =>
                string.Equals(e.Extension?.Package, request.PackageId, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(e.Extension?.Version, request.Version, StringComparison.OrdinalIgnoreCase));

            group.ActiveEntry = index;
            group.AutoUpdate = request.AutoUpdate;

            await _extensions.SetActiveExtensionVersionAsync(group, context.CancellationToken).ConfigureAwait(false);
            _logger.LogInformation("Activated {Package} version {Version} (autoUpdate={AutoUpdate}).",
                request.PackageId, request.Version, request.AutoUpdate);
            return new BoolValue { Value = true };
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task<BoolValue> RemoveVersion(SetActiveVersionRequest request, ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            RepositoryGroup? group = _extensions.ListExtensions()
                .FirstOrDefault(g => g.Entries.Any(e =>
                    string.Equals(e.Extension?.Package, request.PackageId, StringComparison.OrdinalIgnoreCase)));

            if (group == null)
                throw new SourceNotFoundException($"Extension '{request.PackageId}' was not found.");

            RepositoryEntry? entry = group.Entries.FirstOrDefault(e =>
                string.Equals(e.Extension?.Version, request.Version, StringComparison.OrdinalIgnoreCase));

            if (entry == null)
                throw new SourceNotFoundException(
                    $"Version '{request.Version}' of '{request.PackageId}' was not found.");

            await _extensions.RemoveExtensionVersionAsync(entry, context.CancellationToken).ConfigureAwait(false);
            return new BoolValue { Value = true };
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task<JsonResult> InstallCustomApk(
        IAsyncStreamReader<InstallApkRequest> requestStream,
        ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            bool force = false;
            using var buffer = new MemoryStream();

            await foreach (InstallApkRequest chunk in requestStream.ReadAllAsync(context.CancellationToken))
            {
                // force travels on the first message alone.
                if (chunk.Data.Length == 0)
                    force = chunk.Force;
                else
                    buffer.Write(chunk.Data.Span);
            }

            RepositoryGroup? group = await _extensions
                .AddExtensionAsync(buffer.ToArray(), force, context.CancellationToken)
                .ConfigureAwait(false);

            if (group == null)
                return new JsonResult { Json = "null" };

            _logger.LogInformation("Installed custom APK ({Bytes} bytes, force={Force}).", buffer.Length, force);
            return new JsonResult { Json = RpcJson.Serialize(group) };
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task<JsonResult> PrepareOnlineExtension(PackageRequest request, ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            RepositoryGroup? group = await _extensions
                .PrepareExtensionAsync(request.PackageId, false, context.CancellationToken)
                .ConfigureAwait(false);

            if (group == null)
                throw new SourceNotFoundException($"Extension '{request.PackageId}' was not found online.");

            IExtensionInterop interop = await _extensions
                .GetInteropAsync(group, context.CancellationToken).ConfigureAwait(false);

            var descriptor = new OnlineExtensionDescriptor
            {
                PackageId = request.PackageId,
                Name = group.Name,
                Version = interop.Version,
                Temporary = group.Temporary,
                Sources = interop.Sources.Select(s => new SourceDescriptor
                {
                    PackageId = request.PackageId,
                    SourceId = s.Id,
                    Name = s.Name,
                    Language = s.Language,
                    SupportsLatest = s.SupportsLatest,
                    IsConfigurable = s.IsConfigurableSource,
                    IsHttpSource = s.IsHttpSource,
                    IsParsedHttpSource = s.IsParsedHttpSource,
                    IsCatalogueSource = s.IsCatalogueSource,
                }).ToList(),
            };

            _logger.LogInformation("Prepared online extension {Package} v{Version} ({Count} source(s), temporary={Temporary}).",
                descriptor.PackageId, descriptor.Version, descriptor.Sources.Count, descriptor.Temporary);
            return new JsonResult { Json = RpcJson.Serialize(descriptor) };
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task<BoolValue> ReleaseOnlineExtension(PackageRequest request, ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            bool released = await _extensions
                .ReleaseExtensionAsync(request.PackageId, context.CancellationToken)
                .ConfigureAwait(false);
            _logger.LogInformation("ReleaseOnlineExtension({Package}) => {Released}.", request.PackageId, released);
            return new BoolValue { Value = released };
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    public override async Task GetExtensionIcon(
        PackageRequest request,
        IServerStreamWriter<Chunk> responseStream,
        ServerCallContext context)
    {
        GrpcGuard.EnsureAuthorized(_token, context);
        try
        {
            RepositoryEntry? active = _extensions.ListExtensions(includeTemporary: true)
                .FirstOrDefault(g => g.Entries.Any(e =>
                    string.Equals(e.Extension?.Package, request.PackageId, StringComparison.OrdinalIgnoreCase)))
                ?.Entries.FirstOrDefault(e =>
                    string.Equals(e.Extension?.Package, request.PackageId, StringComparison.OrdinalIgnoreCase));

            if (active?.Icon?.FileName == null)
                throw new SourceNotFoundException($"No icon for '{request.PackageId}'.");

            string folder = _folders.GetExtensionVersionFolder(active);
            string path = Path.Combine(folder, active.Icon.FileName);
            if (!File.Exists(path))
                throw new SourceNotFoundException($"Icon file missing for '{request.PackageId}'.");

            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, ChunkSize, true);
            await StreamChunksAsync(stream, "image/png", responseStream, context.CancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            throw GrpcGuard.Map(ex, _logger);
        }
    }

    /// <summary>
    /// Streams a source in fixed-size chunks; the first message carries the
    /// content type so the backend can build a forward-only stream.
    /// </summary>
    public static async Task StreamChunksAsync(
        Stream source,
        string contentType,
        IServerStreamWriter<Chunk> responseStream,
        CancellationToken token)
    {
        byte[] buffer = new byte[ChunkSize];
        int index = 0;
        int read;
        string type = contentType;

        while ((read = await source.ReadAsync(buffer.AsMemory(0, ChunkSize), token).ConfigureAwait(false)) > 0)
        {
            var message = new Chunk
            {
                Data = ByteString.CopyFrom(buffer, 0, read),
                ContentType = type,
                First = index == 0,
                ChunkIndex = index,
            };
            type = string.Empty; // only the first message carries the content type
            await responseStream.WriteAsync(message).ConfigureAwait(false);
            index++;
        }
    }
}
