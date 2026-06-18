using RensaioBackend.Models.Enums;
using RensaioBackend.Models.Database;

namespace RensaioBackend.Services.Mcp.Abstractions;

/// <summary>
/// Interface for enforcing per-tool user permissions in MCP.
/// Each tool has a minimum <see cref="UserLevel"/> requirement.
/// </summary>
public interface IMcpPermissionService
{
    /// <summary>
    /// Ensures the specified user meets the minimum level for the given tool.
    /// </summary>
    /// <param name="user">The user to check.</param>
    /// <param name="toolName">The MCP tool name.</param>
    /// <exception cref="McpPermissionException">Thrown if the user's level is insufficient.</exception>
    void EnsureLevel(UserEntity user, string toolName);

    /// <summary>
    /// Returns the list of MCP tool names the user is permitted to call.
    /// </summary>
    IEnumerable<string> GetPermittedTools(UserEntity user);

    /// <summary>
    /// Gets the required <see cref="UserLevel"/> for a given tool.
    /// </summary>
    UserLevel GetRequiredLevel(string toolName);
}

/// <summary>
/// Exception thrown when a user lacks permission to call an MCP tool.
/// </summary>
public class McpPermissionException : Exception
{
    public McpPermissionException(string message) : base(message) { }
}
