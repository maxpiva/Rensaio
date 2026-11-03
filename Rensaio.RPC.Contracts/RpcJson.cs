using System.Text.Json;
using System.Text.Json.Serialization;

namespace Rensaio.RPC.Contracts;

/// <summary>
/// Central JSON settings for every model payload that crosses the RPC boundary.
///
/// The shared <c>Mihon.ExtensionsBridge.Models</c> types are serialized with these
/// options on both sides so a payload produced by the RPC host deserializes
/// identically in RensaioBackend (and vice versa). Keeping this in one place is
/// what lets us avoid duplicating DTOs in the protobuf contract.
/// </summary>
public static class RpcJson
{
    /// <summary>Shared serializer options for all RPC model payloads.</summary>
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
        // See UndefinedJsonElementConverter: an unset Manga/Chapter.Memo is a default
        // (Undefined) JsonElement, which JsonElement.WriteTo refuses to serialize.
        Converters = { new UndefinedJsonElementConverter() },
    };

    /// <summary>Serializes a model payload to JSON.</summary>
    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    /// <summary>Deserializes a model payload, returning default when the input is empty.</summary>
    public static T? Deserialize<T>(string? json)
        => string.IsNullOrWhiteSpace(json) ? default : JsonSerializer.Deserialize<T>(json, Options);

    /// <summary>
    /// Writes an <c>Undefined</c> <see cref="JsonElement"/> as JSON <c>null</c> instead of
    /// throwing.
    ///
    /// <see cref="JsonElement"/> is a <c>struct</c> whose default value has
    /// <see cref="JsonValueKind.Undefined"/> and no backing document.
    /// <see cref="JsonElement.WriteTo"/> (and therefore the default STJ converter) throws
    /// <see cref="InvalidOperationException"/> ("Operation is not valid due to the current state
    /// of the object.") for that value. <see cref="Mihon.ExtensionsBridge.Models.Extensions.Manga.Memo"/>
    /// and <c>Chapter.Memo</c> are such elements: any <c>Manga</c>/<c>Chapter</c> constructed without
    /// a memo (e.g. from a persisted series) hits this the moment it is serialized for an RPC call.
    /// Normalising here fixes it for every payload in one place, rather than at each call site.
    /// </summary>
    private sealed class UndefinedJsonElementConverter : JsonConverter<JsonElement>
    {
        public override JsonElement Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            => JsonElement.ParseValue(ref reader);

        public override void Write(Utf8JsonWriter writer, JsonElement value, JsonSerializerOptions options)
        {
            if (value.ValueKind == JsonValueKind.Undefined)
            {
                writer.WriteNullValue();
                return;
            }

            value.WriteTo(writer);
        }
    }
}
