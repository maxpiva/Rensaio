using Grpc.Core;
using Microsoft.Extensions.Logging;
using Rensaio.RPC.Contracts;
using Rensaio.RPC.Runtime;

namespace Rensaio.RPC.Services;

/// <summary>
/// Shared helpers for the gRPC services: token validation, readiness checks,
/// and mapping RPC exceptions onto gRPC status codes so the backend observes the
/// same failure categories it did before the process split.
///
/// The per-start token travels as gRPC metadata (header "rens-rpc-token") on
/// every call rather than in each message, so it is enforced uniformly.
/// </summary>
public static class GrpcGuard
{
    /// <summary>Metadata key carrying the per-start token.</summary>
    public const string TokenHeader = "rens-rpc-token";

    /// <summary>Reads the token from the call metadata (empty when absent).</summary>
    public static string ReadToken(ServerCallContext context)
    {
        foreach (var entry in context.RequestHeaders)
        {
            if (string.Equals(entry.Key, TokenHeader, StringComparison.OrdinalIgnoreCase))
                return entry.Value ?? string.Empty;
        }
        return string.Empty;
    }

    /// <summary>Throws <see cref="RpcException"/> when the token is invalid.</summary>
    public static void EnsureAuthorized(RpcStartupToken startup, ServerCallContext context)
    {
        if (!startup.IsValid(ReadToken(context)))
            throw new RpcException(new Status(StatusCode.Unauthenticated, "Invalid or missing RPC token."));
    }

    /// <summary>Throws when the bridge has not finished initializing yet.</summary>
    public static void EnsureReady(RpcReadiness readiness)
    {
        if (readiness.Failure != null)
            throw new RpcException(new Status(StatusCode.FailedPrecondition, readiness.Failure.Message));

        if (!readiness.IsReady)
            throw new RpcException(new Status(StatusCode.Unavailable, "RPC bridge is still initializing."));
    }

    /// <summary>
    /// Maps a domain/transport exception onto a gRPC status. The original category, type name,
    /// HTTP status, message AND stack trace are embedded in the status detail via
    /// <see cref="RpcError"/> so the backend can re-materialize the same exception the in-process
    /// bridge would have thrown (gRPC otherwise replaces it with a bare <see cref="RpcException"/>
    /// and drops the cause).
    ///
    /// Callers still rely on the backend's own retry/backoff wrapper for transient cases, which
    /// inspects the reconstructed <c>HttpRequestException</c> server-side.
    /// </summary>
    /// <param name="ex">The exception thrown while serving the call.</param>
    /// <param name="logger">
    /// Optional host logger. When supplied, a non-<see cref="RpcException"/> failure is logged
    /// WITH its stack trace at the point it is thrown. This is the only place the real origin is
    /// observable: the backend's reconstruction loses the stack, so a failure that is not logged
    /// here is undiagnosable from the backend side.
    /// </param>
    public static RpcException Map(Exception ex, ILogger? logger = null)
    {
        // Transport failures (an RpcException raised by the gRPC stack itself) already carry their
        // own status and are re-thrown verbatim; logging them would just duplicate the backend log.
        if (ex is RpcException rpc)
            return rpc;

        // The host is where the extension actually runs, so this is the ONLY place the true
        // exception (type + message + stack) is still intact. Log it before it is flattened into
        // a status detail the backend can only partially reconstruct.
        logger?.LogError(ex, "RPC call failed: {Type}: {Message}", ex.GetType().FullName, ex.Message);

        // ex.ToString() captures type + message + stack. Truncated so a pathological stack cannot
        // blow past the gRPC status-detail size limit.
        string stack = Truncate(ex.ToString(), MaxStackChars);

        return ex switch
        {
            SourceNotFoundException notFound => new RpcException(new Status(StatusCode.NotFound, notFound.Message)),
            UnauthorizedRpcException => new RpcException(new Status(StatusCode.Unauthenticated, ex.Message)),
            HttpRequestException http => new RpcException(new Status(
                StatusCode.Unavailable,
                RpcError.Encode(
                    $"Source HTTP failure ({(int?)http.StatusCode}): {http.Message}",
                    new RpcErrorEnvelope
                    {
                        Kind = RpcErrorKind.Http,
                        ExceptionType = http.GetType().FullName,
                        HttpStatus = (int?)http.StatusCode,
                        Message = http.Message,
                        Stack = stack,
                    }))),
            OperationCanceledException => new RpcException(new Status(
                StatusCode.Cancelled,
                RpcError.Encode("Operation cancelled.", new RpcErrorEnvelope
                {
                    Kind = RpcErrorKind.Canceled,
                    ExceptionType = ex.GetType().FullName,
                    Message = ex.Message,
                    Stack = stack,
                }))),
            _ => new RpcException(new Status(
                StatusCode.Internal,
                RpcError.Encode(ex.Message, new RpcErrorEnvelope
                {
                    Kind = RpcErrorKind.Other,
                    ExceptionType = ex.GetType().FullName,
                    Message = ex.Message,
                    Stack = stack,
                }))),
        };
    }

    /// <summary>Upper bound on the stack text embedded in a status detail (protects the wire size).</summary>
    private const int MaxStackChars = 8 * 1024;

    private static string Truncate(string value, int max)
        => value.Length <= max ? value : value[..max] + "… [truncated]";
}
