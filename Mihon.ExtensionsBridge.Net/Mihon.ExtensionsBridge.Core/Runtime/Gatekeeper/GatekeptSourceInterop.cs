using Microsoft.Extensions.Logging;
using Mihon.ExtensionsBridge.Models;
using Mihon.ExtensionsBridge.Models.Abstractions;
using Mihon.ExtensionsBridge.Models.Extensions;

namespace Mihon.ExtensionsBridge.Core.Runtime.Gatekeeper
{
    // Wrapper for ISourceInterop that coordinates entry/exit with gatekeeper
    internal sealed class GatekeptSourceInterop : ISourceInterop
    {
        private readonly GatekeptExtensionInterop _gate;
        private ISourceInterop _inner;
        private readonly ILogger _logger;

        public GatekeptSourceInterop(GatekeptExtensionInterop gate, ISourceInterop inner, ILogger logger)
        {
            _gate = gate;
            _inner = inner;
            _logger = logger;
        }

        private ISourceInterop EnsureActive()
        {
            var inner = _inner;
            if (inner == null)
                throw new InvalidOperationException("GatekeptSourceInterop has been released.");
            return inner;
        }

        public long Id => EnsureActive().Id;
        public bool IsCatalogueSource => EnsureActive().IsCatalogueSource;
        public bool IsConfigurableSource => EnsureActive().IsConfigurableSource;
        public bool IsHttpSource => EnsureActive().IsHttpSource;
        public bool IsParsedHttpSource => EnsureActive().IsParsedHttpSource;
        public string Language => EnsureActive().Language;
        public string Name => EnsureActive().Name;
        public bool SupportsLatest => EnsureActive().SupportsLatest;

        public async Task<MangaUpdate> GetDetailsAndChaptersAsync(Manga manga, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().GetDetailsAndChaptersAsync(manga, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public async Task<List<ParsedChapter>> GetChaptersAsync(Manga manga, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().GetChaptersAsync(manga, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public async Task<ParsedManga> GetDetailsAsync(Manga manga, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().GetDetailsAsync(manga, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public async Task<ContentTypeStream> DownloadUrlAsync(string url, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().DownloadUrlAsync(url, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public async Task<ContentTypeStream> GetPageImageAsync(Page page, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().GetPageImageAsync(page, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public async Task<MangaList> GetLatestAsync(int page, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().GetLatestAsync(page, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public async Task<List<Page>> GetPagesAsync(Chapter chapter, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().GetPagesAsync(chapter, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public async Task<MangaList> GetPopularAsync(int page, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().GetPopularAsync(page, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public async Task<MangaList> SearchAsync(int page, string query, CancellationToken token = default)
        { await _gate.EnterAsync(token); try { return await EnsureActive().SearchAsync(page, query, token).ConfigureAwait(false); } finally { _gate.Exit(); } }
        public Dictionary<string, string> GetImageRequestHeaders()
        { return EnsureActive().GetImageRequestHeaders(); }
        public List<KeyPreference> GetPreferences()
        { return EnsureActive().GetPreferences(); }
        public void SetPreference(int position, string value)
        { EnsureActive().SetPreference(position, value); }
        public void SetPreference(KeyPreference preference)
        { EnsureActive().SetPreference(preference); }
        public void SetPreferences(IEnumerable<KeyPreference> preferences)
        { EnsureActive().SetPreferences(preferences); }

        /// <summary>
        /// Releases the wrapped source interop and drops the strong reference to it so
        /// the wrapper does not keep the extension's Kotlin classloader alive.
        /// </summary>
        public void Release()
        {
            var inner = _inner;
            // Detach first so this wrapper no longer pins the inner interop.
            _inner = null;
            try
            {
                inner?.Release();
            }
            catch
            {
                // Best-effort teardown.
            }
        }
    }
}
