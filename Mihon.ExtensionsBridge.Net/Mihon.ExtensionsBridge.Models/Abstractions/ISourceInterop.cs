using Mihon.ExtensionsBridge.Models.Extensions;

namespace Mihon.ExtensionsBridge.Models.Abstractions
{
    public interface ISourceInterop
    {
        long Id { get; }
        bool IsCatalogueSource { get; }
        bool IsConfigurableSource { get; }
        bool IsHttpSource { get; }
        bool IsParsedHttpSource { get; }
        string Language { get; }
        string Name { get; }
        bool SupportsLatest { get; }

        Task<MangaUpdate> GetDetailsAndChaptersAsync(Manga manga, CancellationToken token = default);
        Task<List<ParsedChapter>> GetChaptersAsync(Manga manga, CancellationToken token = default);
        Task<ParsedManga> GetDetailsAsync(Manga manga, CancellationToken token = default);
        Task<ContentTypeStream> GetPageImageAsync(Page page, CancellationToken token = default);
        Task<ContentTypeStream> DownloadUrlAsync(string url, CancellationToken token = default);
        Task<MangaList> GetLatestAsync(int page, CancellationToken token = default);
        Task<List<Page>> GetPagesAsync(Chapter chapter, CancellationToken token = default);
        Task<MangaList> GetPopularAsync(int page, CancellationToken token = default);
        Task<MangaList> SearchAsync(int page, string query, CancellationToken token = default);

        /// <summary>
        /// The HTTP headers this source's own client sends for image/cover requests
        /// (User-Agent, Referer, ...). Empty for non-HTTP sources. Lets callers replay a
        /// cover fetch with the source's identity when no interop is available.
        /// </summary>
        Dictionary<string, string> GetImageRequestHeaders();

        List<KeyPreference> GetPreferences();
        void SetPreference(int position, string value);
        void SetPreference(KeyPreference preference);
        void SetPreferences(IEnumerable<KeyPreference> preferences);

        /// <summary>
        /// Releases all underlying Kotlin/Java references held by this interop so the
        /// extension's classloader and jar can be garbage-collected after unloading.
        /// Implementations must be idempotent and must not throw.
        /// After <see cref="Release"/> no further calls are permitted.
        /// </summary>
        void Release();
    }

}
