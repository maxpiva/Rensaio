using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Auth;
using KaizokuBackend.Services.Users;
using KaizokuBackend.Services.Settings;
using Microsoft.AspNetCore.Mvc;

namespace KaizokuBackend.Controllers;

[ApiController]
[Route("/api/users")]
public class UserController : ControllerBase
{
    private readonly UserQueryService _userQueryService;
    private readonly UserCommandService _userCommandService;
    private readonly UserInviteService _userInviteService;
    private readonly SettingsService _settingsService;

    public UserController(
        UserQueryService userQueryService,
        UserCommandService userCommandService,
        UserInviteService userInviteService,
        SettingsService settingsService)
    {
        _userQueryService = userQueryService;
        _userCommandService = userCommandService;
        _userInviteService = userInviteService;
        _settingsService = settingsService;
    }

    /// <summary>
    /// Gets the first admin's ID for authorization checks.
    /// </summary>
    private async Task<Guid?> GetFirstAdminIdAsync(CancellationToken token)
    {
        var firstAdmin = await _userQueryService.GetFirstAdminAsync(token);
        return firstAdmin?.Id;
    }

    /// <summary>
    /// Determines if a user is the first admin (earliest-created admin).
    /// </summary>
    private async Task<bool> IsFirstAdminAsync(Guid userId, CancellationToken token)
    {
        var firstAdminId = await GetFirstAdminIdAsync(token);
        return firstAdminId.HasValue && firstAdminId.Value == userId;
    }

    /// <summary>
    /// GET /api/users - List all users. Admin only.
    /// </summary>
    [HttpGet]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult<List<UserDto>>> ListUsers(CancellationToken token)
    {
        var users = await _userQueryService.ListUsersAsync(token);
        var firstAdminId = await GetFirstAdminIdAsync(token);
        var result = users.Select(u => UserDto.FromEntity(u, isFirstAdmin: u.Id == firstAdminId)).ToList();
        return Ok(result);
    }

    /// <summary>
    /// GET /api/users/{id} - Get user details. Admin only.
    /// </summary>
    [HttpGet("{id:guid}")]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult<UserDto>> GetUser(Guid id, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByIdAsync(id, token);
        if (user == null)
            return NotFound();

        bool isFirstAdmin = await IsFirstAdminAsync(id, token);
        return Ok(UserDto.FromEntity(user, isFirstAdmin));
    }

    /// <summary>
    /// POST /api/users - Create a new user. Admin only.
    /// No password is set - user must be invited afterward.
    /// </summary>
    [HttpPost]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult<UserDto>> CreateUser([FromBody] CreateUserDto dto, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(dto.Username))
            return BadRequest(new { error = "Username is required" });

        // Check for existing username
        UserEntity? existing = await _userQueryService.GetByUsernameAsync(dto.Username, token);
        if (existing != null)
            return Conflict(new { error = "Username already exists" });

        // Validate username format
        if (dto.Username.Length < 3 || dto.Username.Length > 32)
            return BadRequest(new { error = "Username must be between 3 and 32 characters" });

        UserEntity user = await _userCommandService.CreateUserAsync(dto.Username, dto.Level, token);
        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, UserDto.FromEntity(user));
    }

    /// <summary>
    /// PUT /api/users/{id} - Update user. Admin only.
    /// Enforces admin hierarchy rules:
    /// - First admin cannot change own level/isActive
    /// - Only first admin can change other admin's level/isActive
    /// </summary>
    [HttpPut("{id:guid}")]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult<UserDto>> UpdateUser(Guid id, [FromBody] UpdateUserDto dto, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByIdAsync(id, token);
        if (user == null)
            return NotFound();

        // Get current user from context
        UserEntity? currentUser = HttpContext.Items["User"] as UserEntity;
        bool isTargetFirstAdmin = await IsFirstAdminAsync(id, token);
        bool isCurrentUserFirstAdmin = currentUser != null && await IsFirstAdminAsync(currentUser.Id, token);
        bool isSelf = currentUser?.Id == user.Id;

        // Authorization checks for level/isActive changes
        bool changingLevelOrActive = dto.Level.HasValue || dto.IsActive.HasValue;

        if (changingLevelOrActive)
        {
            // First admin cannot change own level/isActive
            if (isSelf && isCurrentUserFirstAdmin)
                return BadRequest(new { error = "The first admin cannot change their own level or active status" });

            // Cannot change level/isActive of the first admin
            if (isTargetFirstAdmin && !isSelf)
                return BadRequest(new { error = "Cannot change the first admin's level or active status" });

            // Only first admin can change other admin's level/isActive
            if (user.Level == UserLevel.Admin && !isCurrentUserFirstAdmin)
                return StatusCode(403, new { error = "Only the first admin can change another admin's level or active status" });
        }

        byte[]? avatarBlob = null;
        if (!string.IsNullOrWhiteSpace(dto.AvatarBase64))
        {
            try
            {
                avatarBlob = Convert.FromBase64String(dto.AvatarBase64);
                if (avatarBlob.Length > 2 * 1024 * 1024)
                    return BadRequest(new { error = "Avatar image must be less than 2MB" });
            }
            catch
            {
                return BadRequest(new { error = "Invalid base64 image data" });
            }
        }

        await _userCommandService.UpdateUserAsync(user,
            level: dto.Level,
            isActive: dto.IsActive,
            avatarBlob: avatarBlob,
            avatarContentType: dto.RemoveAvatar == true ? null : dto.AvatarContentType,
            removeAvatar: dto.RemoveAvatar,
            token: token);

        bool isFirstAdmin = await IsFirstAdminAsync(id, token);
        return Ok(UserDto.FromEntity(user, isFirstAdmin));
    }

    /// <summary>
    /// DELETE /api/users/{id} - Delete user. Admin only.
    /// Enforces admin hierarchy rules:
    /// - Cannot delete yourself
    /// - Cannot delete the first admin
    /// - Only first admin can delete other admins
    /// </summary>
    [HttpDelete("{id:guid}")]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult> DeleteUser(Guid id, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByIdAsync(id, token);
        if (user == null)
            return NotFound();

        // Get current user from context
        UserEntity? currentUser = HttpContext.Items["User"] as UserEntity;

        // Cannot delete yourself
        if (currentUser?.Id == user.Id)
            return BadRequest(new { error = "Cannot delete yourself" });

        bool isTargetFirstAdmin = await IsFirstAdminAsync(id, token);
        bool isCurrentUserFirstAdmin = currentUser != null && await IsFirstAdminAsync(currentUser.Id, token);

        // Cannot delete the first admin
        if (isTargetFirstAdmin)
            return BadRequest(new { error = "Cannot delete the first admin" });

        // Only first admin can delete other admins
        if (user.Level == UserLevel.Admin && !isCurrentUserFirstAdmin)
            return StatusCode(403, new { error = "Only the first admin can delete other admins" });

        await _userCommandService.DeleteUserAsync(user, token);
        return NoContent();
    }

    /// <summary>
    /// POST /api/users/first - Create the first admin user.
    /// Public endpoint, only works when no users exist.
    /// </summary>
    [HttpPost("/api/users/first")]
    public async Task<ActionResult<UserDto>> CreateFirstUser([FromBody] CreateUserDto dto, CancellationToken token)
    {
        if (await _userQueryService.AnyUsersExistAsync(token))
            return BadRequest(new { error = "Users already exist" });

        if (string.IsNullOrWhiteSpace(dto.Username))
            return BadRequest(new { error = "Username is required" });

        if (dto.Username.Length < 3 || dto.Username.Length > 32)
            return BadRequest(new { error = "Username must be between 3 and 32 characters" });

        // Force admin level for first user
        UserEntity user = await _userCommandService.CreateUserAsync(dto.Username, UserLevel.Admin, token);
        return Ok(UserDto.FromEntity(user, isFirstAdmin: true));
    }

    /// <summary>
    /// PUT /api/users/{id}/claim - Claim an auto-created user as admin.
    /// Public endpoint, only works when no admin exists yet.
    /// </summary>
    [HttpPut("/api/users/{id:guid}/claim")]
    public async Task<ActionResult<UserDto>> ClaimUser(Guid id, CancellationToken token)
    {
        // Check if any admin already exists
        var admin = await _userQueryService.GetFirstAdminAsync(token);
        if (admin != null)
            return BadRequest(new { error = "An admin already exists" });

        UserEntity? user = await _userQueryService.GetByIdAsync(id, token);
        if (user == null)
            return NotFound();

        await _userCommandService.PromoteToAdminAsync(user, token);
        return Ok(UserDto.FromEntity(user));
    }

    /// <summary>
    /// POST /api/users/{id}/generate-invite - Generate an invite token for a user.
    /// Admin only.
    /// </summary>
    [HttpPost("{id:guid}/generate-invite")]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult<InviteMessageDto>> GenerateInvite(Guid id, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByIdAsync(id, token);
        if (user == null)
            return NotFound();

        // Generate new token (invalidates any previous one)
        _userInviteService.GeneratePasswordSetToken(user);
        await _dbSaveChangesAsync(user, token);

        var settings = await _settingsService.GetSettingsAsync();
        string externalDomain = string.IsNullOrWhiteSpace(settings.ExternalDomain)
            ? $"http://localhost:9833"
            : settings.ExternalDomain;

        string message = _userInviteService.GetInviteMessage(user, externalDomain, settings.AuthenticationEnabled);

        return Ok(new InviteMessageDto
        {
            Message = message,
            Token = user.PasswordSetToken ?? string.Empty,
            OpdsPath = user.OpdsPath
        });
    }

    private async Task _dbSaveChangesAsync(UserEntity user, CancellationToken token)
    {
        var db = HttpContext.RequestServices.GetRequiredService<Data.AppDbContext>();
        await db.SaveChangesAsync(token);
    }
}