using KaizokuBackend.Services.Auth;
using KaizokuBackend.Services.Users;
using KaizokuBackend.Services.ReadState;
using KaizokuBackend.Services.Opds;
using KaizokuBackend.Migration;
using KaizokuBackend.Services.Background;
using KaizokuBackend.Services.Bridge;
using KaizokuBackend.Services.Daily;
using KaizokuBackend.Services.Downloads;
using KaizokuBackend.Services.Helpers;
using KaizokuBackend.Services.Images;
using KaizokuBackend.Services.Images.Providers;
using KaizokuBackend.Services.Import;
using KaizokuBackend.Services.Jobs;
using KaizokuBackend.Services.Jobs.Settings;
using KaizokuBackend.Services.Providers;
using KaizokuBackend.Services.Scrobbling;
using KaizokuBackend.Services.Scrobbling.Abstractions;
using KaizokuBackend.Services.Search;
using KaizokuBackend.Services.Series;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Settings;
using Microsoft.Extensions.DependencyInjection.Extensions;
using KaizokuBackend.Extensions;

namespace KaizokuBackend.Services
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

        public static IServiceCollection AddSeriesServices(this IServiceCollection services)
        {
            // Specialized series services
            services.TryAddScoped<SeriesQueryService>();
            services.TryAddScoped<SeriesCommandService>();
            services.TryAddScoped<SeriesProviderService>();
            services.TryAddScoped<SeriesArchiveService>();
            services.TryAddScoped<CadenceCalculationService>();
            
            // Series state sync service - central authority for kaizoku.json sync
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
            services.TryAddScoped<ThumbCacheService>();
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
            services.TryAddScoped<ScrobblerTokenProtector>();
            services.TryAddScoped<ITokenStorageService, TokenStorageService>();
            services.TryAddScoped<ScrobblerProviderFactory>();
            services.TryAddScoped<TitleMatcher>();
            services.TryAddScoped<ScrobblerSyncService>();
            services.TryAddScoped<SeriesMatchingService>();

            // Register all IScrobblerProvider implementations.
            // NOTE: Must use AddScoped (not TryAddScoped) so each provider is registered.
            // ScrobblerProviderFactory resolves IEnumerable<IScrobblerProvider>.
            // Direct auth: Kitsu and MangaDex use password-based auth directly
            services.AddScoped<Scrobbling.Abstractions.IScrobblerProvider, Scrobbling.Providers.KitsuScrobblerProvider>();
            services.AddScoped<Scrobbling.Abstractions.IScrobblerProvider, Scrobbling.Providers.MangaDexScrobblerProvider>();

            // AniList and MyAnimeList use OAuth2 via the central OAuth proxy for authorization,
            // but call their respective APIs directly for search/tracking operations.
            services.AddScoped<Scrobbling.Abstractions.IScrobblerProvider, Scrobbling.Providers.AniListScrobblerProvider>();
            services.AddScoped<Scrobbling.Abstractions.IScrobblerProvider, Scrobbling.Providers.MyAnimeListScrobblerProvider>();

            // ComicVine still uses direct API key (no OAuth)
            services.AddScoped<Scrobbling.Abstractions.IScrobblerProvider, Scrobbling.Providers.ComicVineScrobblerProvider>();

            // Register HTTP clients
            services.AddHttpClient("Scrobbler_AniList");
            services.AddHttpClient("Scrobbler_MAL");
            services.AddHttpClient("Scrobbler_Kitsu");
            services.AddHttpClient("Scrobbler_MangaDex");

            return services;
        }

        public static IServiceCollection AddBackgroundServices(this IServiceCollection services)
        {
            services.TryAddSingleton<JobQueueHostedService>();
            services.TryAddSingleton<JobScheduledHostedService>();
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

        public static IServiceCollection AddAuthServices(this IServiceCollection services)
        {
            services.TryAddScoped<PasswordService>();
            services.TryAddScoped<OpdsPathGenerator>();
            services.TryAddScoped<JwtTokenService>();
            services.TryAddScoped<UserInviteService>();
            services.TryAddScoped<UserQueryService>();
            services.TryAddScoped<UserCommandService>();
            return services;
        }

        public static IServiceCollection AddReadStateServices(this IServiceCollection services)
        {
            services.TryAddSingleton<ReadStateCacheService>();
            services.TryAddScoped<ReadStateService>();
            services.TryAddSingleton<HashCacheService>();
            return services;
        }

        public static IServiceCollection AddOpdsServices(this IServiceCollection services)
        {
            services.TryAddSingleton<OpdsExtractionCoordinator>();
            services.TryAddScoped<OpdsImageService>();
            services.TryAddScoped<OpdsFeedService>();
            return services;
        }

    }
}
