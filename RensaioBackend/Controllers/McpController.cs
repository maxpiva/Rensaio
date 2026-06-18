using System.Text.Json;
using RensaioBackend.Models.Database;
using RensaioBackend.Services.Auth;
using RensaioBackend.Services.Mcp;
using Microsoft.AspNetCore.Mvc;

namespace RensaioBackend.Controllers;

/// <summary>
/// Controller that exposes the MCP (Model Context Protocol) server at
/// <c>GET /{opdsPath}/mcp/sse</c> and <c>POST /{opdsPath}/mcp/message</c>.
///
/// Uses the same OPDS path-based user resolution pattern as <see cref="OpdsController"/>.
/// The resolved user's <see cref="UserEntity.Level"/> is used to enforce
/// per-tool permissions via <see cref="McpPermissionService"/>.
///
/// MCP protocol lifecycle handled:
///   1. initialize  (handshake)
///   2. notifications/initialized  (ack, returns 204)
///   3. ping  (health check)
///   4. tools/list, tools/call  (discovery + operation)
///   5. notifications/cancelled  (optional)
/// </summary>
[ApiController]
public class McpController : ControllerBase
{
    private readonly UserQueryService _userQuery;
    private readonly McpToolService _mcpToolService;
    private readonly ILogger<McpController> _logger;

    public McpController(
        UserQueryService userQuery,
        McpToolService mcpToolService,
        ILogger<McpController> logger)
    {
        _userQuery = userQuery;
        _mcpToolService = mcpToolService;
        _logger = logger;
    }
    [HttpPost("/{opdsPath}/mcp")]
    public async Task<IActionResult> PostMcp(
    string opdsPath,
    [FromBody] JsonElement body,
    CancellationToken token)
    {
        UserEntity? user = await _userQuery.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound();

        HttpContext.Items["User"] = user;

        JsonElement? result = await _mcpToolService.HandleJsonRpcAsync(body, user, token);

        // For JSON-RPC notifications/responses from the client:
        // MCP Streamable HTTP wants 202 Accepted, no body.
        if (result == null)
            return Accepted();

        return new JsonResult(result.Value)
        {
            StatusCode = StatusCodes.Status200OK,
            ContentType = "application/json"
        };
    }

    /// <summary>
    /// GET /{opdsPath}/mcp/sse — SSE transport endpoint.
    /// Client opens a long-lived SSE connection here. The server sends an
    /// "endpoint" event with the absolute URL for the message endpoint.
    /// Tool discovery is done via <c>tools/list</c> JSON-RPC, not SSE events.
    /// </summary>
    /*
    [HttpGet("/{opdsPath}/mcp/sse")]
    public async Task GetSseStream(string opdsPath, CancellationToken token)
    {
        UserEntity? user = await _userQuery.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
        {
            HttpContext.Response.StatusCode = 404;
            return;
        }

        // Set user in HttpContext so downstream middlewares/checks can access it
        HttpContext.Items["User"] = user;

        _logger.LogInformation("MCP SSE connection opened for user '{Username}' (opdsPath: {OpdsPath})",
            user.Username, opdsPath);

        await _mcpToolService.HandleSseTransportAsync(HttpContext, user, token);
    }
    */
    /// <summary>
    /// POST /{opdsPath}/mcp/message — JSON-RPC 2.0 message endpoint.
    /// Client sends tool call requests here.
    ///
    /// Returns 200 with JSON body for requests (methods with "id" field).
    /// Returns 204 No Content for notifications (methods without "id" field),
    /// such as <c>notifications/initialized</c> and <c>notifications/cancelled</c>.
    /// </summary>
    /*
    [HttpPost("/{opdsPath}/mcp/message")]
    public async Task<ActionResult> PostMessage(
        string opdsPath,
        [FromBody] JsonElement body,
        CancellationToken token)
    {
        UserEntity? user = await _userQuery.GetByOpdsPathAsync(opdsPath, token);
        if (user == null || !user.IsActive)
            return NotFound(new { error = "User not found or inactive" });

        // Set user in HttpContext
        HttpContext.Items["User"] = user;

        JsonElement? result = await _mcpToolService.HandleJsonRpcAsync(body, user, token);

        // Null response means this was a JSON-RPC notification (no "id" field).
        // Per spec, notifications expect 204 No Content.
        if (result == null)
            return NoContent();

        return Ok(result.Value);
    }
    */
}