using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace KaizokuBackend.Services.Auth;

/// <summary>
/// Authentication middleware that handles both JWT-based auth and header-based user selection.
/// </summary>
public class AuthMiddleware
{
    private readonly RequestDelegate _next;

    public AuthMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, IServiceProvider serviceProvider)
    {
        // Always allow OPDS routes (they use path-based user resolution)
        if (IsOpdsRoute(context.Request.Path))
        {
            await _next(context);
            return;
        }

        // Skip auth for public endpoints
        if (IsPublicRoute(context.Request.Path, context.Request.Method))
        {
            await _next(context);
            return;
        }

        using var scope = serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var settings = scope.ServiceProvider.GetRequiredService<Services.Settings.SettingsService>();

        bool authEnabled = await IsAuthenticationEnabled(settings);

        if (authEnabled)
        {
            // JWT-based authentication
            string? authHeader = context.Request.Headers["Authorization"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = 401;
                return;
            }

            string token = authHeader["Bearer ".Length..].Trim();
            var jwtService = scope.ServiceProvider.GetRequiredService<JwtTokenService>();
            ClaimsPrincipal? principal = jwtService.ValidateToken(token);

            if (principal == null)
            {
                context.Response.StatusCode = 401;
                return;
            }

            Guid? userId = jwtService.GetUserIdFromPrincipal(principal);
            if (userId == null)
            {
                context.Response.StatusCode = 401;
                return;
            }

            UserEntity? user = await db.Users.FindAsync(userId.Value);
            if (user == null || !user.IsActive)
            {
                context.Response.StatusCode = 401;
                return;
            }

            context.Items["User"] = user;
            context.Items["AuthEnabled"] = true;
        }
        else
        {
            // Header-based user selection (auth disabled)
            string? username = context.Request.Headers["X-Kaizoku-User"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(username))
            {
                UserEntity? user = await db.Users.FirstOrDefaultAsync(u => u.Username == username && u.IsActive);
                if (user != null)
                {
                    context.Items["User"] = user;
                }
            }

            context.Items["AuthEnabled"] = false;
        }

        await _next(context);
    }

    private static bool IsOpdsRoute(PathString path)
    {
        // OPDS routes are public: /{opdsPath}/...
        // We can't easily distinguish OPDS routes here since they don't have a prefix.
        // The AuthMiddleware allows all routes through if auth is disabled.
        // If auth is enabled, OPDS paths are still allowed through.
        // We return false here and handle OPDS in the controller itself.
        return false;
    }

    private static bool IsPublicRoute(PathString path, string method)
    {
        string pathStr = path.Value?.TrimEnd('/') ?? "";

        // Public auth endpoints
        if (pathStr.StartsWith("/api/auth/login", StringComparison.OrdinalIgnoreCase)) return true;
        if (pathStr.StartsWith("/api/auth/status", StringComparison.OrdinalIgnoreCase)) return true;
        if (pathStr.StartsWith("/api/auth/select-user", StringComparison.OrdinalIgnoreCase)) return true;
        if (pathStr.StartsWith("/api/auth/refresh", StringComparison.OrdinalIgnoreCase)) return true;
        if (pathStr.StartsWith("/api/auth/set-password", StringComparison.OrdinalIgnoreCase)) return true;

        // First-user creation (only when no users exist)
        if (pathStr.StartsWith("/api/users/first", StringComparison.OrdinalIgnoreCase) && method == "POST") return true;
        if (pathStr.StartsWith("/api/users/", StringComparison.OrdinalIgnoreCase) && pathStr.EndsWith("/claim", StringComparison.OrdinalIgnoreCase) && method == "PUT") return true;

        return false;
    }

    private static async Task<bool> IsAuthenticationEnabled(Services.Settings.SettingsService settings)
    {
        try
        {
            var editableSettings = await settings.GetSettingsAsync();
            return editableSettings.AuthenticationEnabled;
        }
        catch
        {
            return false;
        }
    }
}

public static class AuthMiddlewareExtensions
{
    public static IApplicationBuilder UseAuthMiddleware(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<AuthMiddleware>();
    }
}