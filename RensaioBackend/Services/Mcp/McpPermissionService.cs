using RensaioBackend.Models.Database;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Mcp.Abstractions;

namespace RensaioBackend.Services.Mcp;

/// <summary>
/// Maps each MCP tool to a minimum <see cref="UserLevel"/> and validates
/// that the calling user meets that requirement.
/// </summary>
public class McpPermissionService : IMcpPermissionService
{
    private static readonly Dictionary<string, UserLevel> _toolLevels = new()
    {
        // ── Series Read (User+) ──
        ["list_series"] = UserLevel.User,
        ["get_series"] = UserLevel.User,
        ["get_latest_series"] = UserLevel.User,

        // ── Series Write (Manager+) ──
        ["add_series"] = UserLevel.Manager,
        ["update_series"] = UserLevel.Manager,
        ["update_all_series"] = UserLevel.Manager,
        ["verify_series"] = UserLevel.Manager,
        ["match_series"] = UserLevel.Manager,

        // ── Series Delete (Admin+) ──
        ["remove_series"] = UserLevel.Admin,

        // ── Search (User+) ──
        ["search_series"] = UserLevel.User,
        ["list_search_sources"] = UserLevel.User,

        // ── Extensions Install (Manager+) ──
        ["install_extension"] = UserLevel.Manager,
        ["list_extensions"] = UserLevel.User,
        ["set_extension_preferences"] = UserLevel.Manager,

        // ── Extensions Uninstall (Admin+) ──
        ["uninstall_extension"] = UserLevel.Admin,

        // ── Downloads Read (User+) ──
        ["list_downloads"] = UserLevel.User,
        ["get_download_metrics"] = UserLevel.User,

        // ── Downloads Write (Manager+) ──
        ["pause_series_downloads"] = UserLevel.Manager,

        // ── Health (User+) ──
        ["get_health_alerts"] = UserLevel.User,
        ["get_series_health"] = UserLevel.User,
        ["get_provider_health"] = UserLevel.User,

        // ── Jobs Read (User+) ──
        ["list_jobs"] = UserLevel.User,
        ["get_job_status"] = UserLevel.User,

        // ── Jobs Write (Manager+) ──
        ["cancel_job"] = UserLevel.Manager,
        ["enqueue_job"] = UserLevel.Manager,

        // ── Settings Read (User+) ──
        ["get_settings"] = UserLevel.User,

        // ── Settings Write (Admin+) ──
        ["update_settings"] = UserLevel.Admin,

        // ── Scrobbling (User+) ──
        ["list_scrobbler_providers"] = UserLevel.User,
        ["get_scrobbler_status"] = UserLevel.User,
    };

    public void EnsureLevel(UserEntity user, string toolName)
    {
        if (!_toolLevels.TryGetValue(toolName, out var required))
            throw new McpPermissionException($"Unknown tool: '{toolName}'");

        if (user.Level < required)
            throw new McpPermissionException(
                $"Tool '{toolName}' requires {required} level, but user '{user.Username}' has {user.Level}");
    }

    public IEnumerable<string> GetPermittedTools(UserEntity user)
    {
        return _toolLevels
            .Where(kv => user.Level >= kv.Value)
            .Select(kv => kv.Key);
    }

    public UserLevel GetRequiredLevel(string toolName)
    {
        if (!_toolLevels.TryGetValue(toolName, out var required))
            throw new McpPermissionException($"Unknown tool: '{toolName}'");
        return required;
    }
}