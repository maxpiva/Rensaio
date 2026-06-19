using RensaioBackend.Data;
using RensaioBackend.Hubs;
using RensaioBackend.Models;
using RensaioBackend.Services;
using RensaioBackend.Services.Auth;
using RensaioBackend.Services.Background;
using RensaioBackend.Utils;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;
using Mihon.ExtensionsBridge.Core.Extensions;
using Mihon.ExtensionsBridge.Models.Configuration;
using Serilog;
using Serilog.Extensions.Logging;
using ILogger = Microsoft.Extensions.Logging.ILogger;

namespace RensaioBackend
{
    public class Startup
    {
        public IConfiguration Configuration { get; }
        private ILogger? _logger;

        public ILogger Logger
        {
            get
            {
                if (_logger == null)
                    _logger = LoggerInfrastructure.CreateAppLogger<Startup>(EnvironmentSetup.AppRensaio);
                return _logger;
            }
        }

        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public void ConfigureServices(IServiceCollection services)
        {
            Serilog.ILogger logger = Log.Logger;
            services.AddSerilog(logger, false, null);
            services.Replace(ServiceDescriptor.Singleton<ILoggerFactory>(sp =>
            {
                return new LibraryTaggingLoggerFactory(new SerilogLoggerFactory(Log.Logger, false));
            }));

            Logger.LogInformation("Initializing Rensaiō...");

            services.AddOpenApi();
            services.AddControllers().AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.PropertyNamingPolicy = null;
            });
            services.AddEndpointsApiExplorer();
            services.AddSwaggerGen();
            services.Configure<HostOptions>(opts => opts.ShutdownTimeout = TimeSpan.FromSeconds(10));

            services.AddCors(options =>
            {
                options.AddDefaultPolicy(policy =>
                {
#if DEBUG
                    policy.WithOrigins("http://localhost:5001", "http://localhost:3000")
                        .AllowAnyHeader()
                        .AllowAnyMethod().AllowCredentials();
#else
                    policy.AllowAnyOrigin()
                        .AllowAnyHeader()
                        .AllowAnyMethod();
#endif
                });
            });
            services.AddResponseCompression(options =>
            {
                options.EnableForHttps = true;
                options.Providers.Add<BrotliCompressionProvider>();
                services.AddScoped<GzipCompressionProvider>();
                options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["application/json"]);
            });
            services.AddSignalR();
            services.AddHttpContextAccessor();
            services.AddMemoryCache();
            services.AddDataProtection();
            services.Configure<Paths>(a =>
            {
                a.BridgeFolder = Configuration.GetValue<string>("BridgeFolder", "extensions");
                a.TempFolder = Configuration.GetValue<string>("TempFolder", string.Empty);
            });
            services.Configure<CacheOptions>(options =>
            {
                options.CachePath = Configuration.GetValue<string>("ThumbCacheFolder", "thumbs");
                options.AgeInDays = Configuration.GetValue<int>("CacheCheckInDays", 7);
            });

            services.AddExtensionsBridge();

            // Add consolidated services
            services.AddImportService();
            services.AddSeriesServices();
            services.AddJobServices();
            services.AddProviderServices();
            services.AddSearchServices();
            services.AddDownloadServices();
            services.AddHelperServices();
            services.AddRensaioJsonService();   // Singleton: shared per-file lock for rensaio.json atomicity
            services.AddBackgroundServices();
            services.AddAuthServices();
            services.AddReadStateServices();
            services.AddOpdsServices();
            services.AddScrobblingServices(Configuration);
            services.AddMcpServices();

            // Configure ForwardedHeaders to support reverse proxy SSL termination.
            // Without this, Kestrel is unaware of the original HTTPS scheme when deployed
            // behind a reverse proxy (Nginx, Traefik, Caddy, etc.), causing redirects to
            // incorrectly use http:// instead of https://.
            services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
                // Clear default restrictions to accept forwarded headers from any proxy.
                // This is safe when the app is always deployed behind a trusted reverse proxy.
                options.KnownNetworks.Clear();
                options.KnownProxies.Clear();
            });

            // Register AppDbContext with SQLite provider, using the connection string from configuration (now points to runtime/rensaio.db)
            services.AddDbContext<AppDbContext>(options => options.UseSqlite(Configuration.GetConnectionString("DefaultConnection")));
            services.AddHostedService<StartupHostedService>();
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // Must be first: reads X-Forwarded-Proto/For headers from reverse proxy so that
            // all subsequent middleware (redirects, HSTS, etc.) use the correct scheme and IP.
            // Without this, Response.Redirect() generates http:// URLs even when the client
            // connected over HTTPS, causing ERR_FR_REDIRECTION_FAILURE in strict HTTPS clients.
            app.UseForwardedHeaders();

            if (env.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            app.UseResponseCompression();
            //app.UseSerilogRequestLogging();
            // Apply CORS policy before other middleware
            app.UseCors();

            // Allow both HTTP and HTTPS - UseHttpsRedirection is conditionally applied
            if (Configuration.GetValue("UseHttpsRedirection", false))
            {
                app.UseHttpsRedirection();
            }

            // Configure static file serving with proper MIME types for .txt files
            var provider = new FileExtensionContentTypeProvider();
            // Add or update .txt mapping to ensure react/next.js fragments work
            provider.Mappings[".txt"] = "text/plain; charset=utf-8";

            var webRoot = Path.Combine(EnvironmentSetup.Configuration!["runtimeDirectory"]!, "wwwroot");

            // Static files MUST be registered before UseRouting. The OpdsController defines a
            // catch-all attribute route [HttpGet("/{opdsPath}")] that matches any single-segment
            // URL at the root (e.g. /library, /favicon.ico, /settings). If UseRouting runs first
            // those requests are bound to the OPDS endpoint and never reach UseStaticFiles, which
            // returns 404 because the OPDS user lookup fails.

            // Next.js static export uses trailingSlash routing: /library => wwwroot/library/index.html.
            // UseDefaultFiles only rewrites to index.html when the request path ends with '/'.
            // Without this rewrite, direct navigation to /library, /settings, etc. returns 404
            // because no controller matches and UseStaticFiles can't find a literal file named "library".
            app.Use(async (context, next) =>
            {
                var path = context.Request.Path.Value;
                if (!string.IsNullOrEmpty(path) && path.Length > 1 && !path.EndsWith('/') && !Path.HasExtension(path))
                {
                    var relative = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                    var dirPath = Path.Combine(webRoot, relative);
                    if (Directory.Exists(dirPath))
                    {
                        context.Request.Path = path + "/";
                    }
                }
                await next();
            });

            // Serve default files (index.html)
            app.UseDefaultFiles(new DefaultFilesOptions
            {
                DefaultFileNames = new List<string> { "index.html" },
                FileProvider = new PhysicalFileProvider(webRoot)
            });

            // Serve static files with custom content type provider
            app.UseStaticFiles(new StaticFileOptions
            {
                ContentTypeProvider = provider,
                ServeUnknownFileTypes = false, // Only serve files with known MIME types for security
                OnPrepareResponse = context =>
                {
                    // Add caching headers for static files
                    var headers = context.Context.Response.Headers;

                    // Cache .txt files for a shorter period (1 hour) since they might change more frequently
                    if (context.File.Name.EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
                    {
                        headers.CacheControl = "public, max-age=3600"; // 1 hour
                    }
                    // Cache other static files for longer (1 day)
                    else
                    {
                        headers.CacheControl = "public, max-age=86400"; // 24 hours
                    }
                }
            });

            // Order matters for the following middleware
            app.UseRouting();

            // Auth middleware - after routing, before endpoints
            app.UseAuthMiddleware();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapGet("/", context =>
                {
                    // Trailing slash matches Next.js static export convention and lets
                    // UseDefaultFiles serve wwwroot/library/index.html directly.
                    context.Response.Redirect("/library/", permanent: false); // 302 Temporary
                    return Task.CompletedTask;
                });
                endpoints.MapControllers();
                endpoints.MapHub<ProgressHub>("/progress");
            });
            // Configure HSTS (HTTP Strict Transport Security)
            if (!env.IsDevelopment())
            {
                app.UseHsts(); // Adds HSTS header in production
            }

            Logger.LogInformation("Initializing Complete.");
        }
    }
    /*
    public sealed class RequestLoggingMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<RequestLoggingMiddleware> _logger;

        public RequestLoggingMiddleware(
            RequestDelegate next,
            ILogger<RequestLoggingMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task Invoke(HttpContext context)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();

            var request = context.Request;

            var clientIp =
                context.Request.Headers["X-Forwarded-For"].FirstOrDefault()
                ?? context.Connection.RemoteIpAddress?.ToString();

            var correlationId =
                context.TraceIdentifier;

            using var scope = _logger.BeginScope(new Dictionary<string, object?>
            {
                ["TraceId"] = correlationId,
                ["ClientIp"] = clientIp,
                ["Path"] = request.Path.Value,
                ["Method"] = request.Method
            });

            try
            {
                await _next(context);

                sw.Stop();

                _logger.LogInformation(
                    "HTTP {Method} {Path}{QueryString} responded {StatusCode} in {ElapsedMs} ms from {ClientIp}",
                    request.Method,
                    request.Path,
                    request.QueryString,
                    context.Response.StatusCode,
                    sw.ElapsedMilliseconds,
                    clientIp);
            }
            catch (Exception ex)
            {
                sw.Stop();

                _logger.LogError(
                    ex,
                    "HTTP {Method} {Path}{QueryString} failed after {ElapsedMs} ms from {ClientIp}",
                    request.Method,
                    request.Path,
                    request.QueryString,
                    sw.ElapsedMilliseconds,
                    clientIp);

                throw;
            }
        }
    }**/
}
