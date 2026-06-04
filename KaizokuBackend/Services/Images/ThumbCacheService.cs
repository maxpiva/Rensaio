using com.sun.org.apache.bcel.@internal.generic;
using KaizokuBackend.Data;
using KaizokuBackend.Extensions;
using KaizokuBackend.Models;
using KaizokuBackend.Models.Abstractions;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Services.Bridge;
using KaizokuBackend.Services.Images.Providers;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Mihon.ExtensionsBridge.Models.Abstractions;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;

namespace KaizokuBackend.Services.Images
{

    public class ThumbCacheService
    {
        
        private readonly ILogger _logger;
        private readonly IHttpClientFactory _factory;
        private readonly AppDbContext _db;
        private readonly CacheOptions _options;
        private readonly List<IImageProvider> _imageProviders;

        private readonly static Dictionary<string, string> _urlCache = new Dictionary<string, string>();
        private readonly static Dictionary<string, EtagCacheEntity> _etagCache = new Dictionary<string,EtagCacheEntity>();
        private readonly static SemaphoreSlim _urlLock = new SemaphoreSlim(1);
        private readonly static SemaphoreSlim _eTagLock = new SemaphoreSlim(1);
        // Per-URL semaphores prevent duplicate-row inserts when multiple concurrent
        // callers pass the existence check before any of them commits.  The key space
        // is bounded by library size so entries are left alive for the process lifetime.
        private readonly static ConcurrentDictionary<string, SemaphoreSlim> _insertLocks =
            new ConcurrentDictionary<string, SemaphoreSlim>(StringComparer.OrdinalIgnoreCase);

        public ThumbCacheService(IOptions<CacheOptions> options,
            ILogger<ThumbCacheService> logger,
            AppDbContext db,
            IHttpClientFactory factory,
            IWorkingFolderStructure workingFolderStructure,
            MihonBridgeService mihonBridgeService,
            IEnumerable<IImageProvider> imageProviders
            )
        {
            _db = db;
            _logger = logger;          
            _factory = factory;
            _options = options.Value;
            _imageProviders = imageProviders.ToList();
        }

        public async ValueTask<EtagCacheEntity?> GetEtagAsync(string key, CancellationToken token = default)
        {
            // --- Phase 1: short lock — check in-memory cache ---
            await _eTagLock.WaitAsync(token).ConfigureAwait(false);
            EtagCacheEntity? cached;
            try
            {
                _etagCache.TryGetValue(key, out cached);
            }
            finally
            {
                _eTagLock.Release();
            }

            if (cached != null)
                return cached;

            // --- Phase 2: outside the lock — DB lookup ---
            EtagCacheEntity? c = await _db.ETagCache.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Key == key, token).ConfigureAwait(false);
            if (c == null)
            {
                _logger.LogWarning("ETag with key {key} not found in cache.", key);
                return null;
            }

            // --- Phase 3: short lock — write result into cache (tolerate concurrent insert) ---
            await _eTagLock.WaitAsync(token).ConfigureAwait(false);
            try
            {
                if (!_etagCache.ContainsKey(key))
                    _etagCache[key] = c;
            }
            finally
            {
                _eTagLock.Release();
            }

            return c;
        }
        public async ValueTask<string> GetKeyAsync(string url, CancellationToken token = default)
        {
            if (string.IsNullOrEmpty(url))
                return string.Empty;

            // --- Phase 1: short lock — check in-memory cache ---
            await _urlLock.WaitAsync(token).ConfigureAwait(false);
            string? cached;
            try
            {
                _urlCache.TryGetValue(url, out cached);
            }
            finally
            {
                _urlLock.Release();
            }

            if (cached != null)
                return cached;

            // --- Phase 2: outside the lock — DB lookup / insert ---
            EtagCacheEntity? c = await _db.ETagCache.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Url == url, token).ConfigureAwait(false);
            if (c == null)
                c = await AddInternalUrlAsync(url, null, token).ConfigureAwait(false);
            if (c == null)
                return string.Empty;

            // --- Phase 3: short lock — write result into cache ---
            await _urlLock.WaitAsync(token).ConfigureAwait(false);
            try
            {
                if (!_urlCache.ContainsKey(url))
                    _urlCache[url] = c.Key;
                else
                    cached = _urlCache[url]; // another thread resolved it concurrently; use that key
            }
            finally
            {
                _urlLock.Release();
            }

            return cached ?? c.Key;
        }
        public async ValueTask PopulateThumbsAsync(IThumb thumb, string prefix = "/api/image/", CancellationToken token = default)
        {
            thumb.ThumbnailUrl = prefix + await GetKeyAsync(thumb.ThumbnailUrl, token).ConfigureAwait(false);
        }
        public async ValueTask PopulateThumbsAsync(IEnumerable<IThumb> thumbs, string prefix = "/api/image/", CancellationToken token = default)
        {
            List<EtagCacheEntity> etags = [];

            // --- Phase 1: short lock — resolve cache hits, snapshot unresolved set ---
            List<IThumb> unresolved;
            Dictionary<string, List<IThumb>> unresolvedByUrl;
            await _urlLock.WaitAsync(token).ConfigureAwait(false);
            try
            {
                List<IThumb> all = thumbs.ToList();
                unresolved = [];
                foreach (IThumb t in all)
                {
                    string? url = t?.ThumbnailUrl;
                    if (t == null || string.IsNullOrEmpty(url))
                        continue;
                    if (_urlCache.TryGetValue(url, out string k))
                        t.ThumbnailUrl = prefix + k;
                    else
                        unresolved.Add(t);
                }
            }
            finally
            {
                _urlLock.Release();
            }

            if (unresolved.Count == 0)
                return;

            // --- Phase 2: outside the lock — do all awaited DB work ---
            unresolvedByUrl = unresolved
                .GroupBy(a => a.ThumbnailUrl, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

            // Batch-fetch existing DB entries for the unresolved URLs.
            // SQLite's default SQLITE_LIMIT_VARIABLE_NUMBER is 999; chunking to 500
            // keeps each IN-clause well within that limit even on cold-cache loads.
            List<EtagCacheEntity> dbHits = [];
            List<string> unresolvedKeys = unresolvedByUrl.Keys.ToList();
            foreach (string[] chunk in unresolvedKeys.Chunk(500))
            {
                List<EtagCacheEntity> chunkHits = await _db.ETagCache.AsNoTracking()
                    .Where(e => chunk.Contains(e.Url))
                    .ToListAsync(token).ConfigureAwait(false);
                dbHits.AddRange(chunkHits);
            }

            // Map DB hits back to thumbs and remove from remaining unresolved set.
            foreach (EtagCacheEntity m in dbHits)
            {
                if (!unresolvedByUrl.TryGetValue(m.Url, out List<IThumb>? group))
                    continue;
                foreach (IThumb t in group)
                    t.ThumbnailUrl = prefix + m.Key;
                unresolvedByUrl.Remove(m.Url);
                etags.Add(m);
            }

            // Insert genuinely new entries (AddInternalUrlAsync re-checks by Url before inserting).
            List<(string OriginalUrl, EtagCacheEntity Entity)> newlyAdded = [];
            foreach (KeyValuePair<string, List<IThumb>> kvp in unresolvedByUrl)
            {
                EtagCacheEntity? ee = await AddInternalUrlAsync(kvp.Key, null, token).ConfigureAwait(false);
                if (ee == null)
                    continue;
                foreach (IThumb t in kvp.Value)
                    t.ThumbnailUrl = prefix + ee.Key;
                etags.Add(ee);
                newlyAdded.Add((kvp.Key, ee));
            }

            // --- Phase 3: short lock — merge newly-resolved entries into _urlCache ---
            if (newlyAdded.Count > 0 || dbHits.Count > 0)
            {
                await _urlLock.WaitAsync(token).ConfigureAwait(false);
                try
                {
                    foreach (EtagCacheEntity m in dbHits)
                    {
                        if (!_urlCache.ContainsKey(m.Url))
                            _urlCache[m.Url] = m.Key;
                    }
                    foreach ((string origUrl, EtagCacheEntity ee) in newlyAdded)
                    {
                        if (!_urlCache.ContainsKey(origUrl))
                            _urlCache[origUrl] = ee.Key;
                    }
                }
                finally
                {
                    _urlLock.Release();
                }
            }

            // --- Phase 4: _eTagLock — unchanged pattern, only dictionary mutation ---
            if (etags.Count > 0)
            {
                await _eTagLock.WaitAsync(token).ConfigureAwait(false);
                try
                {
                    foreach (EtagCacheEntity eee in etags)
                    {
                        if (!_etagCache.ContainsKey(eee.Key))
                            _etagCache[eee.Key] = eee;
                    }
                }
                finally
                {
                    _eTagLock.Release();
                }
            }
        }


        public async Task<bool> CheckETagAsync(string key, string? etag, CancellationToken token = default)
        {
            try
            {
                if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(etag))
                {
                    return false;
                }

                var cacheEntry = await _db.ETagCache.FirstOrDefaultAsync(e => e.Key == key, token).ConfigureAwait(false);

                if (cacheEntry == null)
                {
                    return false;
                }

                return cacheEntry.Etag == etag;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error checking ETag for key {key}: {ex.Message}");
                return false;
            }
        }


        public async Task<string?> CacheFromUrlAsync(string url, CancellationToken token = default)
        {
            var existingEntry = await _db.ETagCache.FirstOrDefaultAsync(e => e.Url == url, token).ConfigureAwait(false);
            if (existingEntry == null)
                return null;

            {                
                _logger.LogInformation($"Cache entry for the Url {url} already exists.");
                return existingEntry.Url;
            }
        }
        
        public async Task<string?> AddUrlAsync(string url, string? mihonProviderId, CancellationToken token = default)
        {
            EtagCacheEntity? cac = await AddInternalUrlAsync(url, mihonProviderId, token).ConfigureAwait(false);
            return cac?.Url;
        }

        /// <summary>
        /// Batch-registers multiple thumbnail URLs in a single DB round-trip.
        /// Skips URLs that already exist in the cache or have no matching image provider.
        /// </summary>
        public async Task AddUrlsBatchAsync(IEnumerable<(string Url, string? MihonProviderId)> urls, CancellationToken token = default)
        {
            var validUrls = urls
                .Where(u => !string.IsNullOrEmpty(u.Url) && GetProviderForUrl(u.Url) != null)
                .DistinctBy(u => u.Url)
                .ToList();

            if (validUrls.Count == 0)
                return;

            try
            {
                var urlStrings = validUrls.Select(u => u.Url).ToList();

                // SQLite's default SQLITE_LIMIT_VARIABLE_NUMBER is 999; chunking to 500
                // keeps each IN-clause well within that limit for large batch registrations.
                var existingUrls = new List<string>();
                foreach (string[] chunk in urlStrings.Chunk(500))
                {
                    List<string> chunkHits = await _db.ETagCache
                        .Where(e => chunk.Contains(e.Url))
                        .Select(e => e.Url)
                        .ToListAsync(token).ConfigureAwait(false);
                    existingUrls.AddRange(chunkHits);
                }

                var existingSet = new HashSet<string>(existingUrls, StringComparer.OrdinalIgnoreCase);
                var newEntries = validUrls
                    .Where(u => !existingSet.Contains(u.Url))
                    .Select(u => new EtagCacheEntity
                    {
                        Key = Guid.NewGuid().ToString("N"),
                        Url = u.Url,
                        MihonProviderId = u.MihonProviderId,
                        NextUpdateUTC = DateTime.UtcNow.Add(GetCacheDuration())
                    })
                    .ToList();

                if (newEntries.Count > 0)
                {
                    await _db.ETagCache.AddRangeAsync(newEntries, token).ConfigureAwait(false);
                    await _db.SaveChangesAsync(token).ConfigureAwait(false);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error batch-adding {Count} cache entries: {Message}", validUrls.Count, ex.Message);
            }
        }
     
        private async Task<EtagCacheEntity?> AddInternalUrlAsync(string url, string? mihonProviderId, CancellationToken token = default)
        {
            if (string.IsNullOrEmpty(url))
            {
                _logger.LogWarning("Url is null or empty.");
                return null;
            }
            IImageProvider? provider = GetProviderForUrl(url);
            if (provider == null)
                return null;

            // Acquire the per-URL semaphore so that only one caller performs the
            // existence check + insert for a given URL at a time.  Callers for
            // different URLs are not serialized (they get independent semaphores).
            SemaphoreSlim urlSem = _insertLocks.GetOrAdd(url, _ => new SemaphoreSlim(1, 1));
            await urlSem.WaitAsync(token).ConfigureAwait(false);
            try
            {
                // Re-check inside the gate in case a concurrent caller already inserted.
                // AsNoTracking: this is a read-only existence check; avoids change-tracker
                // accumulation under high concurrency (the entry, if new, is Added below).
                var existingEntry = await _db.ETagCache.AsNoTracking().FirstOrDefaultAsync(e => e.Url == url, token).ConfigureAwait(false);
                if (existingEntry != null)
                    return existingEntry;

                string key = Guid.NewGuid().ToString("N");
                var newCacheEntry = new Models.Database.EtagCacheEntity
                {
                    Key = key,
                    Url = url,
                    MihonProviderId = mihonProviderId,
                    NextUpdateUTC = DateTime.UtcNow.Add(GetCacheDuration())
                };
                try
                {
                    await _db.ETagCache.AddAsync(newCacheEntry, token).ConfigureAwait(false);
                    await _db.SaveChangesAsync(token).ConfigureAwait(false);
                    return newCacheEntry;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error adding cache entry for {url}: {ex.Message}");
                    return null;
                }
            }
            finally
            {
                urlSem.Release();
            }
        }
        IImageProvider? GetProviderForUrl(string url)
        {
            foreach(IImageProvider p in _imageProviders)
            {
                if (p.CanProcess(url))
                {
                    return p;
                }
            }
            return null;
        }

        public async Task UpdateAllCacheWithRemoteAsync(CancellationToken token = default)
        {
            DateTime now = DateTime.UtcNow;
            List<EtagCacheEntity> caches = await _db.ETagCache.Where(a=>a.NextUpdateUTC<now).ToListAsync(token).ConfigureAwait(false);
            var httpClient = _factory.CreateClient(nameof(ThumbCacheService));
            foreach (EtagCacheEntity cache in caches)
            {
                IImageProvider? provider = GetProviderForUrl(cache.Url);
                if (provider is UrlImageProvider urlImageProvider)
                    await urlImageProvider.UpdateCacheWithRemoteAsync(cache, httpClient, token).ConfigureAwait(false);
                else
                {
                    cache.NextUpdateUTC = DateTime.UtcNow.Add(TimeSpan.FromDays(_options.AgeInDays > 0 ? _options.AgeInDays : 1));
                    await _db.SaveChangesAsync(token).ConfigureAwait(false);
                }
            }
        }
       
        public TimeSpan GetCacheDuration()
        {
            return TimeSpan.FromDays(_options.AgeInDays > 0 ? _options.AgeInDays : 1);
        }
       
        public async Task<Stream?> GetStreamAsync(EtagCacheEntity entry, CancellationToken token = default)
        {
            if (entry == null || string.IsNullOrEmpty(entry.Url))
                return null;
            IImageProvider? img = GetProviderForUrl(entry.Url);
            if (img == null)
                return null;
            return await img.ObtainStreamAsync(entry, token).ConfigureAwait(false);
        }
        public async Task<(HttpStatusCode StatusCode, string? etag, string? mimetype, Stream? stream)> ProcessKeyAsync(string key, string etag, CancellationToken token = default)
        {
            if (string.IsNullOrEmpty(key))
                return (HttpStatusCode.BadRequest, null, null, null);
            var cacheEntry = await _db.ETagCache.FirstOrDefaultAsync(e => e.Key == key, token).ConfigureAwait(false);
            if (cacheEntry == null)
                return (HttpStatusCode.NotFound, null, null, null);
            if (cacheEntry != null && !string.IsNullOrEmpty(etag) && etag.Equals(cacheEntry.Etag, StringComparison.OrdinalIgnoreCase))
                return (HttpStatusCode.NotModified, null, null, null);
            IImageProvider? img = GetProviderForUrl(cacheEntry!.Url);
            if (img==null)
                return (HttpStatusCode.NotFound, null, null, null);
            Stream? s = await img.ObtainStreamAsync(cacheEntry!, token).ConfigureAwait(false);
            if (s==null)
                return (HttpStatusCode.NotFound, null, null, null);
            string contentType = cacheEntry!.ContentType;
            if (string.IsNullOrEmpty(contentType))
            {
                (string? detectedContentType, string? detectedExtension) = s.GetImageMimeTypeAndExtension();
                s.Position = 0;
                contentType = detectedContentType ?? "";
            }
            return (HttpStatusCode.OK, cacheEntry!.Etag, contentType, s);
        }
    }
}
