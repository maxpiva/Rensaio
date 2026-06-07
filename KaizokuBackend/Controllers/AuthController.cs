using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto;
using KaizokuBackend.Models.Enums;
using KaizokuBackend.Services.Auth;
using KaizokuBackend.Services.Users;
using KaizokuBackend.Services.Settings;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Controllers;

[ApiController]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PasswordService _passwordService;
    private readonly JwtTokenService _jwtTokenService;
    private readonly UserInviteService _userInviteService;
    private readonly UserQueryService _userQueryService;
    private readonly UserCommandService _userCommandService;
    private readonly SettingsService _settingsService;

    public AuthController(
        AppDbContext db,
        PasswordService passwordService,
        JwtTokenService jwtTokenService,
        UserInviteService userInviteService,
        UserQueryService userQueryService,
        UserCommandService userCommandService,
        SettingsService settingsService)
    {
        _db = db;
        _passwordService = passwordService;
        _jwtTokenService = jwtTokenService;
        _userInviteService = userInviteService;
        _userQueryService = userQueryService;
        _userCommandService = userCommandService;
        _settingsService = settingsService;
    }

    /// <summary>
    /// GET /api/auth/status - Returns authentication status and user list.
    /// Public endpoint.
    /// </summary>
    [HttpGet("/api/auth/status")]
    public async Task<ActionResult<AuthStatusDto>> GetStatus(CancellationToken token)
    {
        var settings = await _settingsService.GetSettingsAsync();
        bool authEnabled = settings.AuthenticationEnabled;
        bool hasUsers = await _userQueryService.AnyUsersExistAsync(token);

        var result = new AuthStatusDto
        {
            AuthenticationEnabled = authEnabled,
            HasUsers = hasUsers
        };

        // When auth is disabled, return user list for the user selector
        if (!authEnabled && hasUsers)
        {
            var users = await _userQueryService.ListUsersAsync(token);
            result.Users = users.Select(u => new UserDto
            {
                Id = u.Id,
                Username = u.Username,
                AvatarBase64 = u.AvatarBlob != null ? Convert.ToBase64String(u.AvatarBlob) : null,
                AvatarContentType = u.AvatarContentType,
                Level = u.Level,
                OpdsPath = u.OpdsPath,
                CreatedAt = u.CreatedAt,
                LastLoginAt = u.LastLoginAt,
                IsActive = true,
                HasPassword = !string.IsNullOrWhiteSpace(u.PasswordHash)
            }).ToList();
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/auth/login - Authenticate user with username and password.
    /// Public endpoint, only works when auth is enabled.
    /// </summary>
    [HttpPost("/api/auth/login")]
    public async Task<ActionResult<LoginResponseDto>> Login([FromBody] LoginRequestDto request, CancellationToken token)
    {
        var settings = await _settingsService.GetSettingsAsync();
        if (!settings.AuthenticationEnabled)
            return BadRequest(new { error = "Authentication is not enabled" });

        UserEntity? user = await _userQueryService.GetByUsernameAsync(request.Username, token);
        if (user == null || !user.IsActive)
            return Unauthorized(new { error = "Invalid credentials" });

        if (string.IsNullOrWhiteSpace(user.PasswordHash) || string.IsNullOrWhiteSpace(user.Salt))
            return Unauthorized(new { error = "User has no password set. Ask the admin to send you an invite." });

        if (!_passwordService.VerifyPassword(request.Password, user.PasswordHash, user.Salt))
            return Unauthorized(new { error = "Invalid credentials" });

        // Update last login
        await _userCommandService.UpdateLastLoginAsync(user, token);

        // Generate access token
        string accessToken = _jwtTokenService.GenerateAccessToken(user);

        // Handle Remember Me (refresh token)
        if (request.RememberMe)
        {
            var (rawRefreshToken, refreshHash) = _jwtTokenService.GenerateRefreshToken();
            int expirationDays = _jwtTokenService.GetRememberMeExpirationDays();
            DateTime expiresAt = DateTime.UtcNow.AddDays(expirationDays);

            await _userCommandService.StoreRefreshTokenAsync(user, refreshHash, expiresAt, token);

            // Set httpOnly cookie
            Response.Cookies.Append("refresh_token", rawRefreshToken, new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Expires = expiresAt,
                Path = "/api/auth/refresh"
            });
        }

        return Ok(new LoginResponseDto
        {
            Token = accessToken,
            User = UserDto.FromEntity(user)
        });
    }

    /// <summary>
    /// POST /api/auth/select-user - Select a user when auth is disabled.
    /// Public endpoint.
    /// </summary>
    [HttpPost("/api/auth/select-user")]
    public async Task<ActionResult<UserDto>> SelectUser([FromBody] SelectUserRequestDto request, CancellationToken token)
    {
        var settings = await _settingsService.GetSettingsAsync();
        if (settings.AuthenticationEnabled)
            return BadRequest(new { error = "Authentication is enabled, use login instead" });

        UserEntity? user = await _userQueryService.GetByUsernameAsync(request.Username, token);
        if (user == null || !user.IsActive)
            return NotFound(new { error = "User not found" });

        return Ok(UserDto.FromEntity(user));
    }

    /// <summary>
    /// POST /api/auth/refresh - Refresh the access token using the refresh token cookie.
    /// Public endpoint.
    /// </summary>
    [HttpPost("/api/auth/refresh")]
    public async Task<ActionResult<LoginResponseDto>> Refresh(CancellationToken token)
    {
        string? rawRefreshToken = Request.Cookies["refresh_token"];
        if (string.IsNullOrWhiteSpace(rawRefreshToken))
            return Unauthorized(new { error = "No refresh token" });

        // Find user by iterating refresh token hashes
        // (this is O(n) but user bases are small)
        var users = await _db.Users
            .Where(u => !string.IsNullOrWhiteSpace(u.RefreshTokenHash) && u.RefreshTokenExpiresAt > DateTime.UtcNow)
            .ToListAsync(token);

        UserEntity? matchedUser = null;
        foreach (var u in users)
        {
            if (_jwtTokenService.ValidateRefreshToken(rawRefreshToken, u.RefreshTokenHash!))
            {
                matchedUser = u;
                break;
            }
        }

        if (matchedUser == null)
        {
            Response.Cookies.Delete("refresh_token");
            return Unauthorized(new { error = "Invalid or expired refresh token" });
        }

        // Rotate: clear old refresh token
        await _userCommandService.ClearRefreshTokenAsync(matchedUser, token);

        // Generate new access token
        string accessToken = _jwtTokenService.GenerateAccessToken(matchedUser);

        // Generate new refresh token (auto-bump expiration)
        var (newRawRefreshToken, newRefreshHash) = _jwtTokenService.GenerateRefreshToken();
        int expirationDays = _jwtTokenService.GetRememberMeExpirationDays();
        DateTime newExpiresAt = DateTime.UtcNow.AddDays(expirationDays);

        await _userCommandService.StoreRefreshTokenAsync(matchedUser, newRefreshHash, newExpiresAt, token);

        Response.Cookies.Append("refresh_token", newRawRefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Expires = newExpiresAt,
            Path = "/api/auth/refresh"
        });

        return Ok(new LoginResponseDto
        {
            Token = accessToken,
            User = UserDto.FromEntity(matchedUser)
        });
    }

    /// <summary>
    /// POST /api/auth/logout - Clear the refresh token.
    /// Authenticated endpoint.
    /// </summary>
    [HttpPost("/api/auth/logout")]
    public async Task<ActionResult> Logout(CancellationToken token)
    {
        UserEntity? user = HttpContext.Items["User"] as UserEntity;
        if (user != null)
        {
            await _userCommandService.ClearRefreshTokenAsync(user, token);
        }

        Response.Cookies.Delete("refresh_token");
        return Ok(new { success = true });
    }

    /// <summary>
    /// PUT /api/auth/me - Update current user profile/avatar.
    /// Authenticated endpoint.
    /// </summary>
    [HttpPut("/api/auth/me")]
    public async Task<ActionResult<UserDto>> UpdateMe([FromBody] UpdateUserDto update, CancellationToken token)
    {
        UserEntity? user = HttpContext.Items["User"] as UserEntity;
        if (user == null)
            return Unauthorized();

        byte[]? avatarBlob = null;
        if (!string.IsNullOrWhiteSpace(update.AvatarBase64))
        {
            try
            {
                avatarBlob = Convert.FromBase64String(update.AvatarBase64);
                if (avatarBlob.Length > 2 * 1024 * 1024) // 2MB limit
                    return BadRequest(new { error = "Avatar image must be less than 2MB" });
            }
            catch
            {
                return BadRequest(new { error = "Invalid base64 image data" });
            }
        }

        await _userCommandService.UpdateUserAsync(user,
            avatarBlob: avatarBlob,
            avatarContentType: update.RemoveAvatar == true ? null : update.AvatarContentType,
            removeAvatar: update.RemoveAvatar,
            token: token);

        return Ok(UserDto.FromEntity(user));
    }

    /// <summary>
    /// GET /api/auth/me - Get current user info.
    /// Authenticated endpoint.
    /// </summary>
    [HttpGet("/api/auth/me")]
    public ActionResult<UserDto> GetMe()
    {
        UserEntity? user = HttpContext.Items["User"] as UserEntity;
        if (user == null)
            return Unauthorized();

        return Ok(UserDto.FromEntity(user));
    }

    /// <summary>
    /// POST /api/auth/set-password - Set password using invite token.
    /// Public endpoint.
    /// </summary>
    [HttpPost("/api/auth/set-password")]
    public async Task<ActionResult<LoginResponseDto>> SetPassword([FromBody] SetPasswordRequestDto request, CancellationToken token)
    {
        var settings = await _settingsService.GetSettingsAsync();
        if (!settings.AuthenticationEnabled)
            return BadRequest(new { error = "Authentication is not enabled" });

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
            return BadRequest(new { error = "Password must be at least 6 characters" });

        UserEntity? user = await _userQueryService.GetByUsernameAsync(request.Username, token);
        if (user == null)
            return NotFound(new { error = "User not found" });

        if (!_userInviteService.ConsumePasswordSetToken(user, request.Token))
            return BadRequest(new { error = "Invalid or expired token" });

        await _userCommandService.SetPasswordAsync(user, request.Password, token);
        await _userCommandService.UpdateLastLoginAsync(user, token);

        string accessToken = _jwtTokenService.GenerateAccessToken(user);

        return Ok(new LoginResponseDto
        {
            Token = accessToken,
            User = UserDto.FromEntity(user)
        });
    }

    /// <summary>
    /// POST /api/auth/change-password - Change current user's password.
    /// Authenticated endpoint.
    /// </summary>
    [HttpPost("/api/auth/change-password")]
    public async Task<ActionResult> ChangePassword([FromBody] ChangePasswordDto request, CancellationToken token)
    {
        UserEntity? user = HttpContext.Items["User"] as UserEntity;
        if (user == null)
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
            return BadRequest(new { error = "New password must be at least 6 characters" });

        bool success = await _userCommandService.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword, token);
        if (!success)
            return BadRequest(new { error = "Current password is incorrect" });

        return Ok(new { success = true });
    }
}