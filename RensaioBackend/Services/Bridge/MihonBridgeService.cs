using Mihon.ExtensionsBridge.Core.Extensions;
using Mihon.ExtensionsBridge.Models;
using Mihon.ExtensionsBridge.Models.Abstractions;
using Microsoft.Extensions.Logging;
using RensaioBackend.Services.Search;
using RensaioBackend.Utils;
using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Linq;
using System.Net;
using System.Threading;

namespace RensaioBackend.Services.Bridge
{
    public class MihonBridgeService : IExtensionManager, IRepositoryManager
    {
        private readonly IBridgeManager _bridgeManager;
        private readonly IWorkingFolderStructure _workingFolderStructure;
        private readonly ILogger _logger;

        /// <summary>
        /// Serializes source-extension calls on a per-(provider+manga) basis. Some extensions
        /// (e.g. Madara-based ones) throw <c>IllegalStateException: getMangaUpdate must not be
        /// called concurrently for same manga</c> when two calls target the same manga at once.
        /// The global <see cref="SourceTimeoutGate"/> only bounds total concurrency; this keyed
        /// lock guarantees same-manga calls queue instead of racing. Static because the service
        /// is scoped — a single lock must be shared across every job scope/worker.
        /// </summary>
        private static readonly KeyedAsyncLock PerMangaLock = new();

        private ConcurrentDictionary<string, Lazy<Task<IExtensionInterop>>> extOps = [];
        
        public Task<Preferences> GetPreferencesAsync(CancellationToken cancellationToken) => _bridgeManager.GetPreferencesAsync(cancellationToken);
        public Task SetPreferencesAsync(Preferences prefs, CancellationToken cancellationToken) => _bridgeManager.SetPreferencesAsync(prefs, cancellationToken);

        public MihonBridgeService(ILogger<MihonBridgeService> logger, IBridgeManager bridgeManager, IWorkingFolderStructure workingFolderStructure)
        {

            _logger = logger;
            _bridgeManager = bridgeManager;
            _workingFolderStructure = workingFolderStructure;
        }
        /// <summary>
        /// Default number of retries (after the initial attempt) for transient HTTP errors that
        /// warrant exponential backoff before giving up on a Mihon extension call.
        /// </summary>IMetadataProvider
        private const int DefaultMaxRetries = 5;

        /// <summary>
        /// Base delay (seconds) for the first retry; each subsequent retry doubles it, so a run of
        /// 3 retries waits 2s, 4s, then 8s before the final attempt.
        /// </summary>
        private static readonly TimeSpan RetryBaseDelay = TimeSpan.FromSeconds(2);

        /// <summary>
        /// Wraps a source-extension call with error handling, retry and the global concurrency
        /// budget (<see cref="SourceTimeoutGate"/>). See
        /// <see cref="MihonErrorWrapperLockedAsync"/> for the same-manga-locked variant.
        /// </summary>
        public async Task<T?> MihonErrorWrapperAsync<T>(Func<Task<T>> func, string errorMessage, params object[] pars) where T : class, new()
            => await MihonErrorWrapperCoreAsync(func, errorMessage, null, null, pars).ConfigureAwait(false);

        /// <summary>
        /// Like <see cref="MihonErrorWrapperAsync"/>, but additionally records each HTTP failure
        /// status into the supplied <paramref name="failureBreakdown"/> map so bulk callers can
        /// aggregate per-run failures. Purely diagnostic — the per-call error still gets logged.
        /// </summary>
        public async Task<T?> MihonErrorWrapperAsync<T>(Func<Task<T>> func, string errorMessage, ConcurrentDictionary<string, int>? failureBreakdown, params object[] pars) where T : class, new()
            => await MihonErrorWrapperCoreAsync(func, errorMessage, null, failureBreakdown, pars).ConfigureAwait(false);

        /// <summary>
        /// Like <see cref="MihonErrorWrapperAsync"/>, but additionally serializes the call on a
        /// per-(provider+manga) <paramref name="lockKey"/>. Madara-based sources throw
        /// "getMangaUpdate must not be called concurrently for same manga" when two extension
        /// calls target the same manga at once; the global <see cref="SourceTimeoutGate"/> only
        /// bounds total concurrency, so same-manga calls must queue on this keyed lock instead.
        /// </summary>
        public async Task<T?> MihonErrorWrapperLockedAsync<T>(Func<Task<T>> func, string errorMessage, string lockKey, params object[] pars) where T : class, new()
            => await MihonErrorWrapperCoreAsync(func, errorMessage, lockKey, null, pars).ConfigureAwait(false);

        /// <summary>
        /// Like <see cref="MihonErrorWrapperLockedAsync"/>, but additionally records each HTTP
        /// failure status into the supplied <paramref name="failureBreakdown"/> map so bulk
        /// callers can aggregate per-run failures. Purely diagnostic — the per-call error still
        /// gets logged.
        /// </summary>
        public async Task<T?> MihonErrorWrapperLockedAsync<T>(Func<Task<T>> func, string errorMessage, string lockKey, ConcurrentDictionary<string, int>? failureBreakdown, params object[] pars) where T : class, new()
            => await MihonErrorWrapperCoreAsync(func, errorMessage, lockKey, failureBreakdown, pars).ConfigureAwait(false);

        private async Task<T?> MihonErrorWrapperCoreAsync<T>(Func<Task<T>> func, string errorMessage, string? lockKey, ConcurrentDictionary<string, int>? failureBreakdown, params object[] pars) where T : class, new()
        {
            // Serialize same-manga calls per (provider+manga); non-manga calls (search page,
            // latest page, images) pass lockKey=null and are only bounded by the global gate.
            IDisposable? mangaLock = lockKey != null
                ? await PerMangaLock.LockAsync(lockKey, CancellationToken.None).ConfigureAwait(false)
                : null;
            try
            {
                // Global in-flight budget for source-extension calls (see SourceTimeoutGate).
                // All extension calls (details, chapters, pages, images, latest) flow through here,
                // so this bounds the total concurrent IKVM-crossing work regardless of how many
                // parallel loops or downloads are active.
                for (int attempt = 0; ; attempt++)
                {
                    try
                    {
                        using (await SourceTimeoutGate.AcquireAsync(CancellationToken.None).ConfigureAwait(false))
                        {
                            return await func().ConfigureAwait(false);
                        }
                    }
                    catch (HttpRequestException httpEx)
                    {
                        HttpStatusCode status = httpEx.StatusCode ?? HttpStatusCode.InternalServerError;

                        // Retry with exponential backoff on the two transient responses we care about:
                        //  - TooManyRequests (429): the server explicitly asked us to back off.
                        //  - NotFound (404): some Cloudflare-protected sources return an empty/404 page
                        //    when their bot/rate-limit detection triggers.
                        if (IsRetryableHttpStatus(status) && attempt < DefaultMaxRetries)
                        {
                            _logger.LogDebug("Retrying {ErrorMessage} (attempt {Attempt}/{Max}) after {Delay}s",
                                errorMessage, attempt + 1, DefaultMaxRetries, ComputeBackoff(attempt).TotalSeconds);
                            await Task.Delay(ComputeBackoff(attempt)).ConfigureAwait(false);
                            continue;
                        }

                        object[] pars2 = pars.ToArray();
                        Array.Resize(ref pars2, pars2.Length + 1);
                        pars2[^1] = status;
                        _logger.LogError(errorMessage + " Http Error: {httperror}", pars2);
                        if (failureBreakdown != null)
                        {
                            string reason = status.ToString();
                            int current = failureBreakdown.GetOrAdd(reason, 0);
                            failureBreakdown[reason] = current + 1;
                        }
                        return null;
                    }
                    catch (TaskCanceledException)
                    {
                        _logger.LogError(errorMessage + " Task was cancelled", pars);
                        return null;
                    }
                    catch (OperationCanceledException)
                    {
                        _logger.LogError(errorMessage + " Operation was cancelled", pars);
                        return null;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, errorMessage, pars);
                        return null;
                    }
                }
            }
            finally
            {
                mangaLock?.Dispose();
            }
        }

        private static bool IsRetryableHttpStatus(HttpStatusCode status)
            => status == HttpStatusCode.TooManyRequests || status == HttpStatusCode.NotFound;

        private static TimeSpan ComputeBackoff(int attempt)
        {
            // Exponential backoff: 2s, 4s, 8s for attempts 0, 1, 2. The exponent is capped so an
            // unexpected over-run never yields an absurd delay. A small random jitter spreads
            // parallel retries so multiple sources don't all hammer the server in lock-step.
            int shift = Math.Min(attempt, 4);
            double baseSeconds = RetryBaseDelay.TotalSeconds * (1 << shift);
            double jitter = Random.Shared.NextDouble() * 0.5; // up to 500ms
            return TimeSpan.FromSeconds(baseSeconds + jitter);
        }
        /// <summary>
        /// Resolves the current group for [keyName] and compares the active entry version
        /// against a previously cached interop. Returns null when no group matches, so callers
        /// can decide to evict the stale cache entry and re-resolve.
        /// </summary>
        private RepositoryGroup? ResolveActiveGroup(string keyName)
        {
            var allLocal = _bridgeManager.LocalExtensionManager.ListExtensions();
            return allLocal.FirstOrDefault(a => a.Name.Equals(keyName, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Returns the cached (or newly created) interop for the given name. When the cached
        /// interop no longer matches the group's active version, the entry is evicted and
        /// re-resolved so a previously pinned classloader is never handed out.
        /// </summary>
        private async Task<IExtensionInterop> GetFromNameAsync(string name, CancellationToken token = default)
        {
            var repo = ResolveActiveGroup(name);
            if (repo == null)
                EvictExtOp(name);

            string cacheKey = repo?.Name ?? name;
            Lazy<Task<IExtensionInterop>>? cached = null;
            if (extOps.TryGetValue(cacheKey, out var candidate))
            {
                var interop = await candidate.Value.ConfigureAwait(false);
                // Stale-guard: if the active version changed, drop the pin and re-resolve.
                if (repo != null && interop.Version != repo.GetActiveEntry().Extension.Version)
                {
                    EvictExtOp(cacheKey);
                }
                else
                {
                    return interop;
                }
            }

            if (repo == null)
                throw new InvalidOperationException($"Extension '{name}' not found");

            Lazy<Task<IExtensionInterop>> value = extOps.GetOrAdd(cacheKey, (nam) =>
            {
                var fresh = ResolveActiveGroup(nam);
                if (fresh == null)
                    throw new InvalidOperationException($"Extension '{nam}' not found");
                return new Lazy<Task<IExtensionInterop>>(_bridgeManager.LocalExtensionManager.GetInteropAsync(fresh, token));
            });
            return await value.Value.ConfigureAwait(false);
        }
        private async Task<IExtensionInterop> GetFromPackageAsync(string package, CancellationToken token = default)
        {
            var allLocal = _bridgeManager.LocalExtensionManager.ListExtensions();
            var repo = allLocal.FirstOrDefault(a => a.GetActiveEntry().Extension.Package.Equals(package, StringComparison.OrdinalIgnoreCase));
            if (repo==null)
            {
                throw new InvalidOperationException("Package not found");
            }
            return await GetFromNameAsync(repo.Name, token).ConfigureAwait(false);
        }
        private async Task<ISourceInterop> GetFromNameAndSourceAsync(string nameandsource, CancellationToken token = default)
        {
            string[] split = nameandsource.Split("|");
            if (split.Length < 2)
                throw new InvalidOperationException("Invalid Name And Source");
            long source = 0;
            if (!long.TryParse(split[1], out source))
                throw new InvalidOperationException("Invalid Source Id");
            string name = split[0];
            IExtensionInterop extOp = await GetFromNameAsync(name, token).ConfigureAwait(false);
            if (extOp == null)
                throw new InvalidOperationException($"Extension '{name}' not found for source '{source}'");
            ISourceInterop? src = extOp.Sources.FirstOrDefault(a => a.Id == source);
            if (src == null)
                throw new InvalidOperationException($"Source '{source}' not found in extension '{name}'");
            return src!;
        }
        private async Task<ISourceInterop> GetFromMihonProviderIdAsync(string mihonproviderId, CancellationToken token = default)
        {
            string[] split = mihonproviderId.Split("|");
            if (split.Length < 2)
                throw new InvalidOperationException("Invalid Package And Source");
            long source = 0;
            if (!long.TryParse(split[1], out source))
                throw new InvalidOperationException("Invalid Source Id");
            string package = split[0];
            IExtensionInterop extOp = await GetFromPackageAsync(package, token).ConfigureAwait(false);
            if (extOp == null)
                throw new InvalidOperationException($"Extension '{package}' not found for source '{source}'");
            ISourceInterop? src = extOp.Sources.FirstOrDefault(a => a.Id == source);
            if (src == null)
                throw new InvalidOperationException($"Source '{source}' not found in extension '{package}'");
            return src!;
        }


        public Task<ISourceInterop> SourceFromProviderIdAsync(string mihonProviderName, CancellationToken token = default)
        {
            return GetFromMihonProviderIdAsync(mihonProviderName, token);
        }

        public Task<RepositoryGroup?> AddExtensionAsync(TachiyomiExtension extension, bool force = false, CancellationToken token = default)
        {
            return _bridgeManager.LocalExtensionManager.AddExtensionAsync(extension, force, token);
        }

        public Task<RepositoryGroup?> AddExtensionAsync(TachiyomiRepository repository, TachiyomiExtension extension, bool force = false, CancellationToken token = default)
        {
            return _bridgeManager.LocalExtensionManager.AddExtensionAsync(repository, extension, force, token);
        }

        public Task<RepositoryGroup?> AddExtensionAsync(byte[] apk, bool force = false, CancellationToken token = default)
        {
            return _bridgeManager.LocalExtensionManager.AddExtensionAsync(apk, force, token);
        }

        /// <summary>
        /// Shadow-loads a not-installed online extension for discovery search.
        /// Never registers the extension as installed anywhere.
        /// </summary>
        public Task<IExtensionInterop> GetDiscoveryInteropAsync(TachiyomiExtension extension, CancellationToken token = default)
        {
            return _bridgeManager.LocalExtensionManager.GetDiscoveryInteropAsync(extension, token);
        }

        public IExtensionInterop? TryGetLoadedDiscoveryInterop(string package)
        {
            return _bridgeManager.LocalExtensionManager.TryGetLoadedDiscoveryInterop(package);
        }

        /// <summary>
        /// Resolves a source interop from an ALREADY shadow-loaded discovery extension, or null when
        /// the extension isn't loaded (never triggers a shadow-load). Used as a fallback for fetching
        /// discovery-result covers with the source's own HTTP client/headers when the plain HTTP
        /// fetch is rejected (referer/Cloudflare/CDN checks) and the extension isn't installed.
        /// </summary>
        public ISourceInterop? TryGetLoadedDiscoverySource(string mihonProviderId)
        {
            if (string.IsNullOrEmpty(mihonProviderId))
                return null;
            string[] split = mihonProviderId.Split("|");
            if (split.Length < 2 || !long.TryParse(split[1], out long sourceId))
                return null;
            IExtensionInterop? interop = _bridgeManager.LocalExtensionManager.TryGetLoadedDiscoveryInterop(split[0]);
            return interop?.Sources.FirstOrDefault(a => a.Id == sourceId);
        }

        /// <summary>
        /// Prepares discovery artifacts (APK + converted JAR on disk) without classloading, so a
        /// worker process can load and search the extension out-of-process.
        /// </summary>
        public Task<DiscoveryArtifact> PrepareDiscoveryArtifactsAsync(TachiyomiExtension extension, CancellationToken token = default)
        {
            return _bridgeManager.LocalExtensionManager.PrepareDiscoveryArtifactsAsync(extension, token);
        }

        public Task<IExtensionInterop> GetInteropAsync(RepositoryGroup entry, CancellationToken token = default)
        {
            return GetFromNameAsync(entry.Name, token);
        }

        public List<RepositoryGroup> ListExtensions()
        {
            return _bridgeManager.LocalExtensionManager.ListExtensions();
        }

        public RepositoryGroup? FindExtension(string name)
        {
            return _bridgeManager.LocalExtensionManager.FindExtension(name);
        }

        /// <summary>
        /// Drops any cached interop for the group name. Called whenever a mutation invalidates
        /// a previously resolved interop so the next access re-resolves against fresh state
        /// instead of returning a pinned, possibly-unloaded interop from <see cref="extOps"/>.
        /// </summary>
        private void EvictExtOp(string groupName)
        {
            if (string.IsNullOrWhiteSpace(groupName))
                return;
            if (extOps.TryRemove(groupName, out var removed))
            {
                _logger.LogInformation("Evicted cached interop for extension group {GroupName}.", groupName);
            }
        }

        public Task<bool> RemoveExtensionAsync(RepositoryGroup group, CancellationToken token = default)
        {
            // Evict first so a racing in-flight resolve does not re-cache a now-removed group.
            EvictExtOp(group?.Name);
            return _bridgeManager.LocalExtensionManager.RemoveExtensionAsync(group, token);
        }

        public Task<RepositoryGroup?> RemoveExtensionVersionAsync(RepositoryEntry entry, CancellationToken token = default)
        {
            return Task.Run(() =>
            {
                // The entry identifies a group; evict its cached interop so version removal
                // does not leave a stale interop pinned in extOps.
                string? groupName = null;
                try
                {
                    var groups = _bridgeManager.LocalExtensionManager.ListExtensions();
                    var match = groups.FirstOrDefault(g => g.Entries.Any(e => e.Id == entry.Id));
                    groupName = match?.Name;
                }
                catch
                {
                    // Fall back to the entry name if the group cannot be resolved.
                    groupName = entry?.Name;
                }
                EvictExtOp(groupName);
                return _bridgeManager.LocalExtensionManager.RemoveExtensionVersionAsync(entry, token);
            }, token);
        }

        public Task<RepositoryGroup> SetActiveExtensionVersionAsync(RepositoryGroup group, CancellationToken token = default)
        {
            EvictExtOp(group?.Name);
            return _bridgeManager.LocalExtensionManager.SetActiveExtensionVersionAsync(group, token);
        }

        public Task<TachiyomiRepository> AddOnlineRepositoryAsync(TachiyomiRepository repository, CancellationToken token = default)
        {
            return _bridgeManager.OnlineRepositoryManager.AddOnlineRepositoryAsync(repository, token);
        }

        public List<TachiyomiRepository> ListOnlineRepositories()
        {
            return _bridgeManager.OnlineRepositoryManager.ListOnlineRepositories();
        }

        public Task RefreshAllRepositoriesAsync(CancellationToken token = default)
        {
            return _bridgeManager.OnlineRepositoryManager.RefreshAllRepositoriesAsync(token);
        }

        public Task<bool> RemoveOnlineRespositoryAsync(TachiyomiRepository repository, CancellationToken token = default)
        {
            return _bridgeManager.OnlineRepositoryManager.RemoveOnlineRespositoryAsync(repository, token);
        }
    }
}
