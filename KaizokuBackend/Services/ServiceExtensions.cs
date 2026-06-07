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
            services.TryAddScoped<ScrobblerProviderFactory>();
            services.TryAddScoped<TitleMatcher>();
            services.TryAddScoped<ScrobblerSyncService>();
            services.TryAddScoped<SeriesMatchingService>();

            // Proxy mode: all OAuth calls go through the central OAuth proxy.
            // Instance credentials (key + secret) are stored in the DB settings table.
            // Only the ProxyUrl comes from appsettings.json.
            services.TryAddScoped<Scrobbling.Abstractions.IScrobblerProvider>(sp =>
                ActivatorUtilities.CreateInstance<Scrobbling.Providers.ProxyScrobblerProvider>(sp, ScrobblerProvider.AniList));
            services.TryAddScoped<Scrobbling.Abstractions.IScrobblerProvider>(sp =>
                ActivatorUtilities.CreateInstance<Scrobbling.Providers.ProxyScrobblerProvider>(sp, ScrobblerProvider.MyAnimeList));
            services.TryAddScoped<Scrobbling.Abstractions.IScrobblerProvider>(sp =>
                ActivatorUtilities.CreateInstance<Scrobbling.Providers.ProxyScrobblerProvider>(sp, ScrobblerProvider.Kitsu));
            services.TryAddScoped<Scrobbling.Abstractions.IScrobblerProvider>(sp =>
                ActivatorUtilities.CreateInstance<Scrobbling.Providers.ProxyScrobblerProvider>(sp, ScrobblerProvider.MangaDex));

            // ComicVine still uses direct API key (no OAuth)
            services.TryAddScoped<Scrobbling.Abstractions.IScrobblerProvider, Scrobbling.Providers.ComicVineScrobblerProvider>();

            // Register HTTP clients
            services.AddHttpClient("Scrobbler_Proxy");

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
            services.TryAddScoped<OpdsFeedService>();
            services.TryAddSingleton<OpdsImageService>();
            return services;
        }

    }
}
