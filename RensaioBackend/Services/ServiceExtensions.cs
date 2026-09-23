using RensaioBackend.Extensions;
using RensaioBackend.Migration;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Auth;
using RensaioBackend.Services.Background;
using RensaioBackend.Services.Bridge;
using RensaioBackend.Services.Daily;
using RensaioBackend.Services.Downloads;
using RensaioBackend.Services.Helpers;
using RensaioBackend.Services.Images;
using RensaioBackend.Services.Images.Providers;
using RensaioBackend.Services.Import;
using RensaioBackend.Services.Jobs;
using RensaioBackend.Services.Jobs.Settings;
using RensaioBackend.Services.Opds;
using RensaioBackend.Services.Providers;
using RensaioBackend.Services.ReadState;
using RensaioBackend.Services.Scrobbling;
using RensaioBackend.Services.Scrobbling.Abstractions;
using RensaioBackend.Services.Search;
using RensaioBackend.Services.Series;
using RensaioBackend.Services.Settings;
using RensaioBackend.Services.Users;
using Microsoft.Extensions.DependencyInjection.Extensions;
using sun.net.www.http;
using System.Net.Http.Headers;

namespace RensaioBackend.Services
{
    public static class ServiceExtensions
    {
        public static IServiceCollection AddImportService(this IServiceCollection services)
        {
            services.TryAddScoped<SeriesScanner>();
            services.TryAddScoped<SeriesComparer>();
            services.TryAddScoped<ImportQueryService>();
            services.TryAddScoped<ImportCommandService>();
            services.TryAddScoped<UserImportService>();
            return services;
        }

        public static IServiceCollection AddRensaioJsonService(this IServiceCollection services)
        {
            // Singleton: shared per-file lock state across all services
            services.TryAddSingleton<RensaioJsonService>();
            return services;
        }

        public static IServiceCollection AddSeriesServices(this IServiceCollection services)
        {
            // Specialized series services
            services.TryAddScoped<SeriesQueryService>();
            services.TryAddScoped<SeriesCommandService>();
            services.TryAddScoped<SeriesProviderService>();
            services.TryAddScoped<SeriesArchiveService>();
            services.TryAddScoped<CadenceCalculationService>();
            
            // Series state sync service - central authority for rensaio.json sync
            services.TryAddScoped<SeriesStateService>();
            
            return services;
        }

        public static IServiceCollection AddJobServices(this IServiceCollection services)
        {
            // Core job services
            services.TryAddScoped<JobManagementService>();
            services.TryAddScoped<JobBusinessService>();
            services.TryAddScoped<JobExecutionService>();
            
            // Configuration and supporting services
            services.TryAddSingleton<JobsSettings>();
            services.TryAddScoped<JobHubReportService>();
            
            return services;
        }
        public static IServiceCollection AddHelperServices(this IServiceCollection services)
        {
            services.TryAddScoped<SettingsService>();

            services.AddScoped<IImageProvider, UrlImageProvider>();
            services.AddScoped<IImageProvider, ExtensionsImageProvider>();
            services.AddScoped<IImageProvider, StorageImageProvider>();
            // Scoped: the bounded URL/ETag caches are static, so they are already shared
            // across all scoped consumers regardless of lifetime. A singleton must NOT
            // capture the scoped AppDbContext (and scoped IImageProviders) in its
            // constructor — that shares one DbContext across concurrent requests and
            // throws "A second operation was started on this context instance.
            services.TryAddScoped<ThumbCacheService>();
            services.AddHttpClient(nameof(ThumbCacheService), SetHttpClientHeaders);
            services.TryAddScoped<IImageFactory, NetVipsImageFactory>();
            services.TryAddScoped<ArchiveHelperService>();
            services.TryAddScoped<DailyService>();
            services.TryAddScoped<Status.StatusEvaluationService>();
            services.TryAddScoped<MihonBridgeService>();
            services.TryAddScoped<MigrationService>();
            services.TryAddScoped<NouisanceFixer20ExtraLarge>();
            return services;
        }
        public static IServiceCollection AddScrobblingServices(this IServiceCollection services, IConfiguration configuration)
        {
            services.TryAddScoped<Contributions.ContributionPropagationService>();
            services.TryAddScoped<Contributions.ContributionMappingService>();
            services.TryAddScoped<Contributions.RensaioMappingCascadeService>();

            return AddScrobblingServicesCore(services, configuration);
        }

        private static IServiceCollection AddScrobblingServicesCore(this IServiceCollection services, IConfiguration configuration)
        {
            services.TryAddScoped<ScrobblerTokenProtector>();
            services.TryAddScoped<ITokenStorageService, TokenStorageService>();
            services.TryAddScoped<ExternalSeriesProviderFactory>();
            services.TryAddScoped<TitleMatcher>();
            services.TryAddScoped<ScrobblerSyncService>();
            services.TryAddScoped<SeriesMatchingService>();

            // Metadata ecosystem services
            services.TryAddScoped<Metadata.SeriesMetadataResolver>();
            // Database-agnostic matcher + provider helpers shared by the External Mappings and
            // Contribution Mappings flows (registered before the engine which depends on them).
            services.TryAddScoped<Metadata.MetadataMatchCore>();
            services.TryAddScoped<Metadata.ExternalMappingSupport>();
            services.TryAddScoped<Metadata.MetadataLinkEngine>();
            // Wrong-linkage detection + auto-block repair (depends on the engine; registered after).
            services.TryAddScoped<Metadata.MappingConflictRepairService>();


            // Register all external provider implementations under the UMBRELLA interface.
            // NOTE: Must use AddScoped (not TryAddScoped) so each provider is registered,
            // and the key MUST be IExternalSeriesProvider: ExternalSeriesProviderFactory
            // injects IEnumerable<IExternalSeriesProvider>, and the container auto-collects
            // beans bound to that exact key. Registering under the read-state sub-interface
            // IScrobblerProvider would yield an empty collection here.
            // Direct auth: Kitsu and MangaDex use password-based auth directly
            services.AddScoped<Scrobbling.Abstractions.IExternalSeriesProvider, Scrobbling.Providers.KitsuScrobblerProvider>();
            services.AddScoped<Scrobbling.Abstractions.IExternalSeriesProvider, Scrobbling.Providers.MangaDexScrobblerProvider>();

            // AniList and MyAnimeList use OAuth2 via the central OAuth proxy for authorization,
            // but call their respective APIs directly for search/tracking operations.
            services.AddScoped<Scrobbling.Abstractions.IExternalSeriesProvider, Scrobbling.Providers.AniListScrobblerProvider>();
            services.AddScoped<Scrobbling.Abstractions.IExternalSeriesProvider, Scrobbling.Providers.MyAnimeListScrobblerProvider>();

            // Metadata-only providers (implement IExternalSeriesProvider directly)
            services.AddScoped<Scrobbling.Abstractions.IExternalSeriesProvider, Scrobbling.Providers.MangaBakaMetadataProvider>();
            services.AddScoped<Scrobbling.Abstractions.IExternalSeriesProvider, Scrobbling.Providers.BangumiMetadataProvider>();
            services.AddScoped<Scrobbling.Abstractions.IExternalSeriesProvider, Scrobbling.Providers.MangaUpdatesMetadataProvider>();
            services.AddScoped<Scrobbling.Abstractions.IExternalSeriesProvider, Scrobbling.Providers.ComicVineMetadataProvider>();
            // Global metadata repository (in-memory; PR #76 will back it with the snapshot index).
            services.TryAddScoped<Contributions.Abstractions.IGlobalMetadataRepository, Contributions.InMemoryGlobalMetadataRepository>();
            services.TryAddScoped<Contributions.InMemoryGlobalMetadataRepository>();

            // Discovery ("search not-installed sources") — worker pool + sweep orchestrator.
            services.TryAddScoped<DiscoverySearchService>();
            services.TryAddSingleton<Search.Discovery.DiscoverySearchCoordinator>();
            services.TryAddSingleton<Search.Discovery.DiscoveryWorkerPool>();
            services.TryAddSingleton<Search.Discovery.DiscoverySourceHeaderRegistry>();
            services.TryAddSingleton<Search.Discovery.InteractiveDiscoveryGate>();

            // Register HTTP clients
            services.AddHttpClient("Scrobbler_AniList", SetHttpClientHeaders);
            services.AddHttpClient("Scrobbler_MAL", SetHttpClientHeaders);
            services.AddHttpClient("Scrobbler_Kitsu", SetHttpClientHeaders);
            services.AddHttpClient("Scrobbler_MangaDex", SetHttpClientHeaders);
            services.AddHttpClient("Scrobbler_MangaBaka", SetHttpClientHeaders);
            services.AddHttpClient("Scrobbler_Bangumi", SetHttpClientHeaders);
            services.AddHttpClient("Scrobbler_MangaUpdates", SetHttpClientHeaders);

            return services;
        }
        internal static void SetHttpClientHeaders(System.Net.Http.HttpClient client)
        {
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Rensaio", "1.0"));
        }
        public static IServiceCollection AddBackgroundServices(this IServiceCollection services)
        {
            services.TryAddSingleton<JobQueueHostedService>();
            services.TryAddSingleton<JobScheduledHostedService>();
            services.AddHostedService<DebouncedScrobblerSyncHostedService>();
            services.TryAddSingleton<MetadataBackgroundScanService>();
            services.TryAddSingleton<ContributionUploadBackgroundService>();
            services.TryAddSingleton<ContributionImportBackgroundService>();
            return services;
        }


        public static IServiceCollection AddProviderServices(this IServiceCollection services)
        {

            
            // Provider Services (SRP-focused)
            services.TryAddScoped<ProviderManagerService>();
            services.TryAddScoped<ProviderPreferencesService>();
            
            // Provider Cache and Storage
            services.TryAddScoped<ProviderCacheService>();
            
            return services;
        }

        public static IServiceCollection AddSearchServices(this IServiceCollection services)
        {
            // CQRS Search Services
            services.TryAddScoped<SearchQueryService>();
            services.TryAddScoped<SearchCommandService>();
            
            return services;
        }

        public static IServiceCollection AddDownloadServices(this IServiceCollection services)
        {
            // Download CQRS Services
            services.TryAddScoped<DownloadQueryService>();
            services.TryAddScoped<DownloadCommandService>();
            
            return services;
        }
        
        public static IServiceCollection AddMcpServices(this IServiceCollection services)
        {
            services.TryAddScoped<Mcp.McpToolService>();
            services.TryAddScoped<Mcp.Abstractions.IMcpPermissionService, Mcp.McpPermissionService>();
            return services;
        }

        public static IServiceCollection AddAuthServices(this IServiceCollection services)
        {
            services.TryAddScoped<PasswordService>();
            services.TryAddScoped<OpdsPathGenerator>();
            services.TryAddScoped<JwtTokenService>();
            services.TryAddScoped<UserInviteService>();
            services.TryAddScoped<UserQueryService>();
            services.TryAddScoped<UserCommandService>();
            services.AddHttpClient(Auth.Oidc.OidcService.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(15));
            services.TryAddSingleton<Auth.Oidc.OidcDiscoveryCache>();
            services.TryAddScoped<Auth.Oidc.OidcService>();
            return services;
        }

        public static IServiceCollection AddReadStateServices(this IServiceCollection services)
        {
            services.TryAddSingleton<ReadStateCacheService>();
            services.TryAddSingleton<ReadStateChangeNotifier>();
            services.TryAddScoped<ReadStateService>();
            return services;
        }

        public static IServiceCollection AddOpdsServices(this IServiceCollection services)
        {
            services.TryAddSingleton<HashCacheService>();
            services.TryAddSingleton<OpdsExtractionCoordinator>();
            services.TryAddSingleton<ClientCapabilitiesHelper>();
            services.TryAddScoped<OpdsImageService>();
            services.TryAddScoped<OpdsFeedService>();
            return services;
        }

    }
}
