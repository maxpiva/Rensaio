using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace KaizokuBackend.Services.Auth;

/// <summary>
/// Authorization attribute that enforces a minimum user level.
/// When auth is disabled, all authenticated users (those with HttpContext.Items["User"]) are allowed.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireUserLevelAttribute : Attribute, IAuthorizationFilter
{
    private readonly UserLevel _minimumLevel;

    public RequireUserLevelAttribute(UserLevel minimumLevel)
    {
        _minimumLevel = minimumLevel;
    }

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        // Check if auth is enabled
        bool authEnabled = context.HttpContext.Items["AuthEnabled"] is bool enabled && enabled;

        // Get user from context
        UserEntity? user = context.HttpContext.Items["User"] as UserEntity;

        if (user == null)
        {
            if (authEnabled)
            {
                context.Result = new UnauthorizedResult();
            }
            // When auth is disabled and no user is set, allow access (guest mode)
            return;
        }

        // When auth is disabled, any recognized user is allowed
        if (!authEnabled)
            return;

        // Check user level
        if (user.Level < _minimumLevel)
        {
            context.Result = new StatusCodeResult(403);
        }
    }
}