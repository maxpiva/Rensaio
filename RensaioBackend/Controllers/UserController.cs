using RensaioBackend.Models.Database;
using RensaioBackend.Models.Dto;
using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Auth;
using RensaioBackend.Services.Users;
using RensaioBackend.Services.Settings;
using RensaioBackend.Services.Series;
using Microsoft.AspNetCore.Mvc;

namespace RensaioBackend.Controllers;

[ApiController]
[Route("/api/users")]
public class UserController : ControllerBase
{
    private readonly UserQueryService _userQueryService;
    private readonly UserCommandService _userCommandService;
    private readonly UserInviteService _userInviteService;
    private readonly SettingsService _settingsService;
    private readonly SeriesCommandService _seriesCommandService;

    public UserController(
        UserQueryService userQueryService,
        UserCommandService userCommandService,
        UserInviteService userInviteService,
        SettingsService settingsService,
        SeriesCommandService seriesCommandService)
    {
        _userQueryService = userQueryService;
        _userCommandService = userCommandService;
        _userInviteService = userInviteService;
        _settingsService = settingsService;
        _seriesCommandService = seriesCommandService;
    }

    /// <summary>
    /// Determines if a user is the owner.
    /// </summary>
    private static bool IsOwner(UserEntity user)
    {
        return user.Level == UserLevel.Owner;
    }

    /// <summary>
    /// GET /api/users - List all users. Admin only.
    /// </summary>
    [HttpGet]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult<List<UserDto>>> ListUsers(CancellationToken token)
    {
        var users = await _userQueryService.ListUsersAsync(token);
        var result = users.Select(UserDto.FromEntity).ToList();
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

        return Ok(UserDto.FromEntity(user));
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

        // Only owner can create admin-level users; non-owner admins are restricted to user/manager
        UserEntity? currentUser = HttpContext.Items["User"] as UserEntity;
        if (dto.Level >= UserLevel.Admin && (currentUser == null || !IsOwner(currentUser)))
            return StatusCode(403, new { error = "Only the owner can create admin or owner users" });

        // Prevent creating additional owners
        if (dto.Level == UserLevel.Owner)
            return BadRequest(new { error = "Cannot create another owner. Only one owner is allowed." });

        UserEntity user = await _userCommandService.CreateUserAsync(dto.Username, dto.Level, token);
        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, UserDto.FromEntity(user));
    }

    /// <summary>
    /// PUT /api/users/{id} - Update user. Admin only.
    /// Enforces admin hierarchy rules:
    /// - Owner cannot change own level/isActive
    /// - Only owner can change another admin's level/isActive
    /// - Admin users cannot edit the owner at all
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
        bool isTargetOwner = IsOwner(user);
        bool isCurrentUserOwner = currentUser != null && IsOwner(currentUser);
        bool isSelf = currentUser?.Id == user.Id;

        // Admin users cannot edit the owner
        if (isTargetOwner && !isCurrentUserOwner)
            return StatusCode(403, new { error = "Admin users cannot edit the owner" });

        // Authorization checks for level/isActive changes
        bool changingLevelOrActive = dto.Level.HasValue || dto.IsActive.HasValue;

        if (changingLevelOrActive)
        {
            // Owner cannot change own level/isActive
            if (isSelf && isCurrentUserOwner)
                return BadRequest(new { error = "The owner cannot change their own level or active status" });

            // Only owner can change another admin's level/isActive
            if (user.Level == UserLevel.Admin && !isCurrentUserOwner)
                return StatusCode(403, new { error = "Only the owner can change another admin's level or active status" });
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

        return Ok(UserDto.FromEntity(user));
    }

    /// <summary>
    /// DELETE /api/users/{id} - Delete user. Admin only.
    /// Enforces admin hierarchy rules:
    /// - Cannot delete yourself
    /// - Cannot delete the owner
    /// - Only owner can delete other admins
    /// - Admin users cannot delete the owner
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

        bool isTargetOwner = IsOwner(user);
        bool isCurrentUserOwner = currentUser != null && IsOwner(currentUser);

        // Admin users cannot delete the owner
        if (isTargetOwner && !isCurrentUserOwner)
            return StatusCode(403, new { error = "Admin users cannot delete the owner" });

        // Cannot delete the owner
        if (isTargetOwner)
            return BadRequest(new { error = "Cannot delete the owner" });

        // Only owner can delete other admins
        if (user.Level == UserLevel.Admin && !isCurrentUserOwner)
            return StatusCode(403, new { error = "Only the owner can delete other admins" });

        await _userCommandService.DeleteUserAsync(user, token);
        return NoContent();
    }

    /// <summary>
    /// POST /api/users/first - Create the first owner user.
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

        // Force owner level for first user
        UserEntity user = await _userCommandService.CreateUserAsync(dto.Username, UserLevel.Owner, token);

        // Update any SeriesMappings with Guid.Empty to the real owner ID
        await _seriesCommandService.UpdateSeriesMappingsOwnerAsync(user.Id, token).ConfigureAwait(false);

        return Ok(UserDto.FromEntity(user));
    }

    /// <summary>
    /// PUT /api/users/{id}/claim - Claim an auto-created user as owner.
    /// Public endpoint, only works when no owner exists yet.
    /// </summary>
    [HttpPut("/api/users/{id:guid}/claim")]
    public async Task<ActionResult<UserDto>> ClaimUser(Guid id, CancellationToken token)
    {
        // Check if any owner already exists
        if (await _userQueryService.OwnerExistsAsync(token))
            return BadRequest(new { error = "An owner already exists" });

        UserEntity? user = await _userQueryService.GetByIdAsync(id, token);
        if (user == null)
            return NotFound();

        await _userCommandService.PromoteToOwnerAsync(user, token);

        // Update any SeriesMappings with Guid.Empty to the real owner ID
        await _seriesCommandService.UpdateSeriesMappingsOwnerAsync(user.Id, token).ConfigureAwait(false);

        return Ok(UserDto.FromEntity(user));
    }

    /// <summary>
    /// POST /api/users/{id}/generate-invite - Generate an invite token for a user.
    /// Admin only. Admin users cannot invite the owner.
    /// </summary>
    [HttpPost("{id:guid}/generate-invite")]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult<InviteMessageDto>> GenerateInvite(Guid id, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByIdAsync(id, token);
        if (user == null)
            return NotFound();

        // Admin users cannot invite the owner
        UserEntity? currentUser = HttpContext.Items["User"] as UserEntity;
        if (IsOwner(user) && (currentUser == null || !IsOwner(currentUser)))
            return StatusCode(403, new { error = "Admin users cannot invite the owner" });

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

    /// <summary>
    /// POST /api/users/{id}/regenerate-opds - Regenerate OPDS path. Admin only.
    /// Admin users cannot regenerate the OPDS path of the owner.
    /// </summary>
    [HttpPost("{id:guid}/regenerate-opds")]
    [RequireUserLevel(UserLevel.Admin)]
    public async Task<ActionResult<RegenerateOpdsResponseDto>> RegenerateOpdsPath(Guid id, CancellationToken token)
    {
        UserEntity? user = await _userQueryService.GetByIdAsync(id, token);
        if (user == null)
            return NotFound();

        // Admin users cannot regenerate OPDS path of the owner
        UserEntity? currentUser = HttpContext.Items["User"] as UserEntity;
        if (IsOwner(user) && (currentUser == null || !IsOwner(currentUser)))
            return StatusCode(403, new { error = "Admin users cannot regenerate the OPDS path for the owner" });

        string newPath = await _userCommandService.RegenerateOpdsPathAsync(user, token);
        return Ok(new RegenerateOpdsResponseDto { OpdsPath = newPath });
    }

    private async Task _dbSaveChangesAsync(UserEntity user, CancellationToken token)
    {
        var db = HttpContext.RequestServices.GetRequiredService<Data.AppDbContext>();
        await db.SaveChangesAsync(token);
    }
}