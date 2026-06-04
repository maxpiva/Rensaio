using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace KaizokuBackend.Services.Auth
{
    /// <summary>
    /// Resolves the current <see cref="UserEntity"/> and builds the request principal.
    ///
    /// When authentication is <b>disabled</b> (default): reads the <c>X-Kaizoku-User</c>
    /// header and attempts to load that user (active, with permissions) from the database.
    /// If the header is absent or the username is not found, falls back to the highest-level
    /// active user (primary admin).  When a user is resolved, an authenticated
    /// <see cref="ClaimsPrincipal"/> is constructed via <see cref="AuthService.BuildUserClaims"/>
    /// and assigned to <c>context.User</c>; the entity is also stored in
    /// <c>context.Items["User"]</c>.  A fresh install with zero users leaves
    /// <c>context.User</c> untouched so setup/anonymous endpoints continue to work normally.
    /// No JWT validation, no 401 issued by this middleware in disabled mode.
    ///
    /// When authentication is <b>enabled</b>: allow-listed paths pass through without auth.
    /// For all other paths the middleware expects <c>UseAuthentication</c> to have already run
    /// and populated <c>context.User</c>.  It maps the <c>UserId</c> claim to the entity and
    /// stores it in Items.  If the principal is not authenticated it short-circuits with 401.
    /// </summary>
    public class AuthMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IAuthSettingsCache _authSettingsCache;

        // Exact paths (lowercase, no trailing slash) that are always public in enabled mode.
        // A request whose normalised path equals one of these strings passes without auth.
        private static readonly HashSet<string> _allowListExact = new(StringComparer.Ordinal)
        {
            "/api/auth/login",
            "/api/auth/select-user",
            "/api/auth/status",
            "/api/auth/refresh",
            "/api/auth/register",
            "/api/auth/setup",
            "/api/auth/set-password",
            "/api/users/first",
        };

        public AuthMiddleware(RequestDelegate next, IAuthSettingsCache authSettingsCache)
        {
            _next = next;
            _authSettingsCache = authSettingsCache;
        }

        public async Task InvokeAsync(HttpContext context, AppDbContext db)
        {
            var path = context.Request.Path.Value?.ToLowerInvariant() ?? string.Empty;

            if (_authSettingsCache.AuthenticationEnabled)
            {
                await HandleEnabledModeAsync(context, db, path).ConfigureAwait(false);
            }
            else
            {
                await HandleDisabledModeAsync(context, db).ConfigureAwait(false);
            }
        }

        // --------------------------------------------------------------------
        // Disabled mode: header-based user selection, no enforcement.
        // --------------------------------------------------------------------

        private async Task HandleDisabledModeAsync(HttpContext context, AppDbContext db)
        {
            UserEntity? resolvedUser = null;

            var headerUsername = context.Request.Headers["X-Kaizoku-User"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(headerUsername))
            {
                resolvedUser = await db.Users
                    .Include(u => u.Permissions)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Username == headerUsername && u.IsActive)
                    .ConfigureAwait(false);
            }

            if (resolvedUser == null)
            {
                resolvedUser = await db.Users
                    .Include(u => u.Permissions)
                    .AsNoTracking()
                    .Where(u => u.IsActive)
                    .OrderByDescending(u => u.Level)
                    .ThenBy(u => u.CreatedAt)
                    .FirstOrDefaultAsync()
                    .ConfigureAwait(false);
            }

            if (resolvedUser != null)
            {
                var permissions = resolvedUser.Permissions ?? new UserPermissionEntity { UserId = resolvedUser.Id };
                var claims = AuthService.BuildUserClaims(resolvedUser, permissions);
                var identity = new ClaimsIdentity(claims, "KaizokuDisabledMode");
                context.User = new ClaimsPrincipal(identity);
                context.Items["User"] = resolvedUser;
            }

            await _next(context).ConfigureAwait(false);
        }

        // --------------------------------------------------------------------
        // Enabled mode: JWT must be valid for non-allow-listed routes.
        // --------------------------------------------------------------------

        private async Task HandleEnabledModeAsync(HttpContext context, AppDbContext db, string path)
        {
            if (IsAllowListed(path, context.Request.Method))
            {
                await _next(context).ConfigureAwait(false);
                return;
            }

            // UseAuthentication runs before this middleware and sets context.User when a
            // valid Bearer token is present.  We rely on that — no manual token parsing.
            if (context.User?.Identity?.IsAuthenticated != true)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"error\":\"Authentication required.\"}").ConfigureAwait(false);
                return;
            }

            var userIdClaim = context.User.FindFirst("UserId")?.Value;
            if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var userId))
            {
                var user = await db.Users
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive)
                    .ConfigureAwait(false);

                if (user != null)
                    context.Items["User"] = user;
            }

            await _next(context).ConfigureAwait(false);
        }

        // --------------------------------------------------------------------
        // Allow-list check
        // --------------------------------------------------------------------

        private static bool IsAllowListed(string path, string method)
        {
            // Normalise: strip a single trailing slash so /api/auth/login/ matches too.
            var normPath = path.Length > 1 && path[path.Length - 1] == '/'
                ? path.Substring(0, path.Length - 1)
                : path;

            // Exact-path check (HashSet lookup is O(1) and the set is already lowercase).
            if (_allowListExact.Contains(normPath))
                return true;

            return false;
        }
    }
}
