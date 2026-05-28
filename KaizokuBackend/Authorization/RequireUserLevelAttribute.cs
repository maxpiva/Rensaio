using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace KaizokuBackend.Authorization
{
    /// <summary>
    /// Enforces a minimum <see cref="UserLevel"/> on a controller or action.
    ///
    /// When authentication is disabled (via <see cref="IAuthSettingsCache"/>), the check
    /// is a no-op and the request is allowed through.
    ///
    /// When authentication is enabled:
    /// <list type="bullet">
    ///   <item>No user in <c>HttpContext.Items["User"]</c> → 401 Unauthorized.</item>
    ///   <item>User level below <paramref name="minimumLevel"/> → 403 Forbidden.</item>
    /// </list>
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false, Inherited = true)]
    public sealed class RequireUserLevelAttribute : Attribute, IAuthorizationFilter
    {
        private readonly UserLevel _minimumLevel;

        public RequireUserLevelAttribute(UserLevel minimumLevel)
        {
            _minimumLevel = minimumLevel;
        }

        public void OnAuthorization(AuthorizationFilterContext context)
        {
            // Resolve IAuthSettingsCache via DI — attributes are not DI-constructed.
            var authSettingsCache = context.HttpContext.RequestServices.GetRequiredService<IAuthSettingsCache>();

            // Auth disabled → allow everything.
            if (!authSettingsCache.AuthenticationEnabled)
                return;

            var user = context.HttpContext.Items["User"] as UserEntity;

            if (user == null)
            {
                context.Result = new UnauthorizedObjectResult(new { error = "Authentication required." });
                return;
            }

            var effectiveLevel = UserService.ResolveLevel(user);
            if (effectiveLevel < _minimumLevel)
            {
                context.Result = new ObjectResult(new { error = "Insufficient privileges." })
                {
                    StatusCode = StatusCodes.Status403Forbidden
                };
            }
        }
    }
}
