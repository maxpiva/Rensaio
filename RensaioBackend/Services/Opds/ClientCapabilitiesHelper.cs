using java.text;
using RensaioBackend.Extensions;
using RensaioBackend.Services.Settings;
using Microsoft.AspNetCore.Http;
using System.Collections.Concurrent;

namespace RensaioBackend.Services.Opds;

/// <summary>
/// Shared static helper for caching client image format capabilities.
/// Used by both <see cref="OpdsController"/> and <see cref="OpdsImageController"/>.
/// Cache key is "user-agent:client-ip" — a naturally bounded set, no eviction needed.
/// </summary>
public class ClientCapabilitiesHelper
{
    private static readonly ConcurrentDictionary<string, List<string>> _formatsCache = new();

    private static readonly ConcurrentDictionary<string, bool> _supportsProgression = new();

    private string[] _supportProgressionClients;

    public ClientCapabilitiesHelper(IConfiguration config)
    {
        _supportProgressionClients = config.GetSection("SupportProgressionClients").Get<string[]>() ?? [];
    }

    /// <summary>
    /// Gets the cache key from the current request's User-Agent and client IP.
    /// </summary>
    public string GetClientUserCapabilitiesKey(HttpRequest request, HttpContext httpContext)
    {
        string userAgent = request.Headers["User-Agent"].FirstOrDefault() ?? "";
        string ip = request.Headers["X-Forwarded-For"].FirstOrDefault()
                    ?? httpContext.Connection.RemoteIpAddress?.ToString()
                    ?? "unknown";
        return $"{userAgent}:{ip}";
    }

    public void SetSupportProgression(HttpRequest request, HttpContext httpContext)
    {
        string key = GetClientUserCapabilitiesKey(request, httpContext);
        _supportsProgression.AddOrUpdate(key, true, (k, v) => true);
    }


    /// <summary>
    /// Captures and caches the client's supported image formats from the Accept header.
    /// Overwrites the cached entry if the formats differ from what's already cached.
    /// </summary>
    public void Capture(HttpRequest request, HttpContext httpContext)
    {
        string key = GetClientUserCapabilitiesKey(request, httpContext);
        List<string> formats = request.SupportedImageTypesFromRequest();

        _formatsCache.AddOrUpdate(key, formats, (_, existing) =>
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
    public List<string> GetSupportedImageFormats(HttpRequest request, HttpContext httpContext)
    {
        string key = GetClientUserCapabilitiesKey(request, httpContext);
        return _formatsCache.TryGetValue(key, out var formats) ? formats : [];
    }
    public bool SupportProgression(HttpRequest request, HttpContext httpContext)
    {
        string userAgent = request.Headers["User-Agent"].FirstOrDefault() ?? "";
        if (!string.IsNullOrEmpty(userAgent) && _supportProgressionClients.Any(client => userAgent.Contains(client, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }
        string key = GetClientUserCapabilitiesKey(request, httpContext);
        return _supportsProgression.TryGetValue(key, out bool res) ? res : false;
    }

}