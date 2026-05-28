using KaizokuBackend.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Authorization
{
    /// <summary>
    /// Maintains an in-process cache of whether any users exist in the database.
    /// This cache is used by <c>GET /api/auth/status</c> and first-user detection
    /// logic without hitting the database on every request.
    ///
    /// The previous "block all /api/* until setup" behaviour has been removed.
    /// Enforcement of auth requirements is now handled by <see cref="KaizokuBackend.Services.Auth.AuthMiddleware"/>.
    /// </summary>
    public class BootstrapModeMiddleware
    {
        private readonly RequestDelegate _next;
        private static bool? _hasUsers;

        public BootstrapModeMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context, AppDbContext db)
        {
            // Refresh the cache when it has been invalidated or is indeterminate.
            if (_hasUsers == null || _hasUsers == false)
            {
                _hasUsers = await db.Users.AnyAsync().ConfigureAwait(false);
            }

            await _next(context).ConfigureAwait(false);
        }

        /// <summary>
        /// Returns the current cached value.  May be null if the cache has never been
        /// populated (i.e. no request has been handled yet).
        /// </summary>
        public static bool? HasUsers => _hasUsers;

        /// <summary>
        /// Invalidates the cached user-existence check so it re-queries on the next request.
        /// Call this after the first user is created or after any user is deleted.
        /// </summary>
        public static void InvalidateCache()
        {
            _hasUsers = null;
        }
    }
}
