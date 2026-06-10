namespace KaizokuBackend.Services.Scrobbling.Providers;

/// <summary>
/// Shared extension methods for scrobbler provider HTTP clients.
/// </summary>
internal static class HttpClientExtensions
{
    /// <summary>
    /// Applies the Bearer Authorization header before each API call if a token is set.
    /// Removes any previous Authorization header first to avoid duplicates.
    /// </summary>
    internal static void ApplyBearerToken(this HttpClient client, string? accessToken)
    {
        client.DefaultRequestHeaders.Remove("Authorization");
        if (!string.IsNullOrEmpty(accessToken))
            client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", $"Bearer {accessToken}");
    }
}