using System.Text.Json;
using System.Text.Json.Serialization;

namespace Rensaio.RPC.Contracts;

/// <summary>
/// Category of the original exception that produced an RPC failure. It lets the backend
/// re-materialize the same failure the pre-split in-process bridge would have thrown,
/// instead of observing a bare transport <c>RpcException</c>.
/// </summary>
public enum RpcErrorKind
{
    /// <summary>Any failure with no transport-specific categorization.</summary>
    Other = 0,

    /// <summary>An <see cref="System.Net.Http.HttpRequestException"/> (source HTTP failure).</summary>
    Http = 1,

    /// <summary>An <see cref="OperationCanceledException"/>/<c>TaskCanceledException</c>.</summary>
    Canceled = 2,
}

/// <summary>
/// Wire envelope describing the original exception behind a gRPC failure.
///
/// gRPC drops CLR exception identity — an <c>RpcException</c> carries no
/// <c>InnerException</c> — so the original category, type name, HTTP status and message
/// travel inside the status detail. The backend's <c>RpcExceptionUnwrapper</c> decodes this
/// to restore the original per-category handling (HTTP status/retry, cancellation) and to
/// surface the true underlying exception in logs.
/// </summary>
public sealed class RpcErrorEnvelope
{
    /// <summary>Failure category.</summary>
    [JsonPropertyName("k")]
    public RpcErrorKind Kind { get; set; }

    /// <summary>Fully-qualified name of the original exception type.</summary>
    [JsonPropertyName("t")]
    public string? ExceptionType { get; set; }

    /// <summary>HTTP status code, when the failure was an HTTP failure.</summary>
    [JsonPropertyName("s")]
    public int? HttpStatus { get; set; }

    /// <summary>Original exception message.</summary>
    [JsonPropertyName("m")]
    public string? Message { get; set; }

    /// <summary>
    /// Original exception <c>ToString()</c> (type + message + stack trace) captured where the
    /// extension actually ran. gRPC carries no CLR exception identity, so without this the backend
    /// only ever sees the remote TYPE name and the stack is unrecoverable — which is exactly what
    /// turned a real host-side failure into a bare "System.InvalidOperationException" with no
    /// origin. Optional: older hosts omit it and the field stays null.
    /// </summary>
    [JsonPropertyName("st")]
    public string? Stack { get; set; }
}

/// <summary>
/// Encodes/decodes an <see cref="RpcErrorEnvelope"/> into a gRPC status detail string.
///
/// The detail stays human-readable: the original message is kept verbatim and the envelope
/// is appended after <see cref="Sentinel"/>. Decoding splits on the LAST sentinel so a
/// message that happens to contain the marker is still handled.
/// </summary>
public static class RpcError
{
    /// <summary>Marker separating the human-readable status detail from the encoded envelope.</summary>
    public const string Sentinel = "[rens-rpc-error]";

    // Default encoder escapes non-ASCII, keeping the gRPC status detail ASCII-only.
    private static readonly JsonSerializerOptions Options = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>Builds a status detail carrying both the human message and the encoded envelope.</summary>
    public static string Encode(string? humanMessage, RpcErrorEnvelope envelope)
        => $"{humanMessage}{Sentinel}{JsonSerializer.Serialize(envelope, Options)}";

    /// <summary>
    /// Splits a status detail back into its human message and envelope. Returns <c>false</c>
    /// (and <paramref name="humanMessage"/> = the raw detail) when the detail carries no
    /// envelope, e.g. transport failures that never had an underlying CLR exception.
    /// </summary>
    public static bool TryDecode(string? detail, out string humanMessage, out RpcErrorEnvelope? envelope)
    {
        humanMessage = detail ?? string.Empty;
        envelope = null;

        if (string.IsNullOrEmpty(detail))
            return false;

        int index = detail.LastIndexOf(Sentinel, StringComparison.Ordinal);
        if (index < 0)
            return false;

        try
        {
            var decoded = JsonSerializer.Deserialize<RpcErrorEnvelope>(detail[(index + Sentinel.Length)..], Options);
            if (decoded == null)
                return false;

            envelope = decoded;
            humanMessage = detail[..index];
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
