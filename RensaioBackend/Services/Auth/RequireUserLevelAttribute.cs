using RensaioBackend.Models.Database;
using RensaioBackend.Models.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace RensaioBackend.Services.Auth;

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
            // No user context:
            // - If auth is enabled → 401 Unauthorized (must log in)
            // - If auth is disabled → allow (guest mode = Owner level)
            if (authEnabled)
            {
                context.Result = new UnauthorizedResult();
            }
            // Guest mode (auth disabled, no user selected) → allow full access
            return;
        }

        // User IS set — enforce their level regardless of auth mode
        if (user.Level < _minimumLevel)
        {
            context.Result = new StatusCodeResult(403);
        }
    }
}