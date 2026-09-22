using System.Text.Json.Serialization;
using RensaioBackend.Extensions;

namespace RensaioBackend.Models.Dto;

public class SettingsDto : EditableSettingsDto
{
    private string _storageFolder = string.Empty;

    [JsonPropertyName("storageFolder")]
    public string StorageFolder
    {
        get => _storageFolder.SanitizeDirectory();
        set => _storageFolder = value;
    }

    /// <summary>
    /// True when any of the basic OIDC values (enabled, issuer, client id, secret)
    /// is supplied via appsettings.json or environment variables. The UI shows the
    /// fields read-only in that case, since config overrides what is stored here.
    /// Server-computed, never persisted.
    /// </summary>
    [JsonPropertyName("oidcManagedByConfig")]
    public bool OidcManagedByConfig { get; set; }

    /// <summary>
    /// The database engine in use: "SQLite" or "PostgreSQL". Shown read-only in
    /// Settings. Server-computed, never persisted.
    /// </summary>
    [JsonPropertyName("database")]
    public string Database { get; set; } = string.Empty;

    /// <summary>
    /// True when a client secret is configured. The secret itself is never sent to
    /// clients; <see cref="SettingsController"/> blanks it. Server-computed, never persisted.
    /// </summary>
    [JsonPropertyName("oidcClientSecretSet")]
    public bool OidcClientSecretSet { get; set; }

    /// <summary>
    /// Input-only: set to true on PUT to remove the stored client secret (switch to a
    /// public client). Needed because an empty secret on PUT means "keep".
    /// </summary>
    [JsonPropertyName("oidcClearClientSecret")]
    public bool OidcClearClientSecret { get; set; }

    /// <summary>
    /// Set when the "Oidc" configuration section could not be read (e.g. a malformed
    /// boolean in an environment variable); SSO is disabled until it is fixed.
    /// Server-computed, never persisted.
    /// </summary>
    [JsonPropertyName("oidcConfigError")]
    public string? OidcConfigError { get; set; }

}