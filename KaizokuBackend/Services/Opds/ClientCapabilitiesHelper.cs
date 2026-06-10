using KaizokuBackend.Extensions;
using Microsoft.AspNetCore.Http;
using System.Collections.Concurrent;

namespace KaizokuBackend.Services.Opds;

/// <summary>
/// Shared static helper for caching client image format capabilities.
/// Used by both <see cref="OpdsController"/> and <see cref="OpdsImageController"/>.
/// Cache key is "user-agent:client-ip" — a naturally bounded set, no eviction needed.
/// </summary>
public static class ClientCapabilitiesHelper
{
    private static readonly ConcurrentDictionary<string, List<string>> _cache = new();

    /// <summary>
    /// Gets the cache key from the current request's User-Agent and client IP.
    /// </summary>
    public static string GetClientCapabilitiesKey(HttpRequest request, HttpContext httpContext)
    {
        string userAgent = request.Headers["User-Agent"].FirstOrDefault() ?? "";
        string ip = request.Headers["X-Forwarded-For"].FirstOrDefault()
                    ?? httpContext.Connection.RemoteIpAddress?.ToString()
                    ?? "unknown";
        return $"{userAgent}:{ip}";
    }

    /// <summary>
    /// Captures and caches the client's supported image formats from the Accept header.
    /// Overwrites the cached entry if the formats differ from what's already cached.
    /// </summary>
    public static void Capture(HttpRequest request, HttpContext httpContext)
    {
        string key = GetClientCapabilitiesKey(request, httpContext);
        List<string> formats = request.SupportedImageTypesFromRequest();

        _cache.AddOrUpdate(key, formats, (_, existing) =>
        {
            if (existing.Count != formats.Count ||
                !existing.OrderBy(x => x).SequenceEqual(formats.OrderBy(x => x)))
            {
                return formats;
            }
            return existing;
        });
    }

    /// <summary>
    /// Gets the cached client capabilities for the current request, or empty list.
    /// </summary>
    public static List<string> GetSupportedImageFormats(HttpRequest request, HttpContext httpContext)
    {
        string key = GetClientCapabilitiesKey(request, httpContext);
        return _cache.TryGetValue(key, out var formats) ? formats : [];
    }
}