using KaizokuBackend.Authorization;
using KaizokuBackend.Data;
using KaizokuBackend.Models.Dto.Auth;
using KaizokuBackend.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Controllers
{
    [ApiController]
    [Route("api/auth")]
    [Produces("application/json")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _authService;
        private readonly UserService _userService;
        private readonly IAuthSettingsCache _authSettingsCache;
        private readonly AppDbContext _db;
        private readonly ILogger<AuthController> _logger;
        public AuthController(
            AuthService authService,
            UserService userService,
            IAuthSettingsCache authSettingsCache,
            AppDbContext db,
            ILogger<AuthController> logger)
        {
            _authService = authService;
            _userService = userService;
            _authSettingsCache = authSettingsCache;
            _db = db;
            _logger = logger;
        }

        [HttpPost("login")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<AuthResponseDto>> LoginAsync([FromBody] LoginDto dto, CancellationToken token = default)
        {
            try
            {
                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                var userAgent = Request.Headers.UserAgent.ToString();
                var result = await _authService.LoginAsync(dto, ipAddress, userAgent, token).ConfigureAwait(false);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during login");
                return StatusCode(500, new { error = "An error occurred during login" });
            }
        }

        [HttpPost("register")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<AuthResponseDto>> RegisterAsync([FromBody] RegisterDto dto, CancellationToken token = default)
        {
            try
            {
                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                var userAgent = Request.Headers.UserAgent.ToString();
                var result = await _authService.RegisterAsync(dto, ipAddress, userAgent, token).ConfigureAwait(false);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during registration");
                return StatusCode(500, new { error = "An error occurred during registration" });
            }
        }

        [HttpPost("refresh")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<AuthResponseDto>> RefreshTokenAsync([FromBody] RefreshTokenDto dto, CancellationToken token = default)
        {
            try
            {
                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                var userAgent = Request.Headers.UserAgent.ToString();
                var result = await _authService.RefreshTokenAsync(dto.RefreshToken, ipAddress, userAgent, token).ConfigureAwait(false);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during token refresh");
                return StatusCode(500, new { error = "An error occurred during token refresh" });
            }
        }

        [HttpPost("logout")]
        [Authorize]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> LogoutAsync([FromBody] RefreshTokenDto dto, CancellationToken token = default)
        {
            try
            {
                var userIdClaim = User.FindFirst("UserId")?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
                    return BadRequest(new { error = "Invalid user context" });

                await _authService.LogoutAsync(userId, dto.RefreshToken, token).ConfigureAwait(false);
                return Ok(new { message = "Logged out successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during logout");
                return StatusCode(500, new { error = "An error occurred during logout" });
            }
        }

        /// <summary>
        /// Returns the current auth configuration and, when auth is disabled, the list of
        /// active users so the frontend can render a profile selector.
        /// </summary>
        [HttpGet("status")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(AuthStatusDto), StatusCodes.Status200OK)]
        public async Task<ActionResult<AuthStatusDto>> GetStatusAsync(CancellationToken token = default)
        {
            try
            {
                var hasUsers = await _userService.AnyUsersExistAsync(token).ConfigureAwait(false);
                var authEnabled = _authSettingsCache.AuthenticationEnabled;

                var response = new AuthStatusDto
                {
                    AuthenticationEnabled = authEnabled,
                    HasUsers = hasUsers,
                    NeedsAdminPassword = !authEnabled && hasUsers
                        && !(await _userService.AnyAdminHasPasswordAsync(token).ConfigureAwait(false))
                };

                if (!authEnabled)
                {
                    // Provide the user list for the profile selector in disabled mode.
                    var users = await _db.Users
                        .AsNoTracking()
                        .Where(u => u.IsActive)
                        .OrderBy(u => u.Username)
                        .Select(u => new StatusUserEntryDto
                        {
                            Id = u.Id,
                            Username = u.Username,
                            DisplayName = u.DisplayName,
                            AvatarBase64 = u.AvatarBlob != null && u.AvatarBlob.Length > 0
                                ? Convert.ToBase64String(u.AvatarBlob)
                                : null,
                            AvatarContentType = u.AvatarContentType,
                            HasPassword = u.PasswordHash != null
                        })
                        .ToListAsync(token)
                        .ConfigureAwait(false);

                    response.Users = users;
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking auth status");
                return StatusCode(500, new { error = "An error occurred checking auth status" });
            }
        }

        /// <summary>
        /// Selects a user by username in auth-disabled (profile-picker) mode.
        /// Returns the user DTO; no JWT is issued.
        /// </summary>
        [HttpPost("select-user")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(UserDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<UserDto>> SelectUserAsync([FromBody] SelectUserDto dto, CancellationToken token = default)
        {
            try
            {
                if (_authSettingsCache.AuthenticationEnabled)
                    return BadRequest(new { error = "select-user is only available when authentication is disabled." });

                if (string.IsNullOrWhiteSpace(dto.Username))
                    return BadRequest(new { error = "Username is required." });

                // Single tracked query so the updated LastLoginAt is reflected in the DTO.
                var user = await _db.Users
                    .FirstOrDefaultAsync(u => u.Username == dto.Username && u.IsActive, token)
                    .ConfigureAwait(false);

                if (user == null)
                    return NotFound(new { error = "User not found." });

                // Claimed profiles require their password even in profile-picker mode;
                // otherwise claiming would be purely cosmetic.
                if (user.PasswordHash != null)
                {
                    if (string.IsNullOrEmpty(dto.Password))
                        return Unauthorized(new { error = "This profile is protected by a password.", passwordRequired = true });

                    if (!UserService.VerifyUserPassword(user, dto.Password))
                        return Unauthorized(new { error = "Invalid password.", passwordRequired = true });
                }

                user.LastLoginAt = DateTime.UtcNow;
                try
                {
                    await _db.SaveChangesAsync(token).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to persist LastLoginAt for user {UserId} during select-user", user.Id);
                    // Non-fatal: return the user even if the timestamp write failed.
                }

                return Ok(AuthService.MapUserDto(user));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during select-user");
                return StatusCode(500, new { error = "An error occurred during user selection" });
            }
        }

        [HttpPost("set-password")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(UserDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<UserDto>> SetPasswordAsync([FromBody] SetPasswordDto dto, CancellationToken token = default)
        {
            try
            {
                var result = await _userService.SetPasswordWithTokenAsync(dto.Token, dto.NewPassword, token).ConfigureAwait(false);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error setting password via invite token");
                return StatusCode(500, new { error = "An error occurred while setting the password" });
            }
        }

        [HttpPost("set-admin-password")]
        [Authorize(Policy = "RequireAdmin")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> SetAdminPasswordAsync([FromBody] SetAdminPasswordDto dto, CancellationToken token = default)
        {
            try
            {
                var userIdClaim = User.FindFirst("UserId")?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
                    return BadRequest(new { error = "Invalid user context" });

                await _userService.ResetPasswordAsync(userId, dto.NewPassword, token).ConfigureAwait(false);
                return Ok(new { message = "Password set successfully" });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error setting admin password");
                return StatusCode(500, new { error = "An error occurred while setting the admin password" });
            }
        }

        [HttpPost("setup")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<AuthResponseDto>> SetupAdminAsync([FromBody] CreateUserDto dto, CancellationToken token = default)
        {
            // Prevent TOCTOU race: two concurrent requests could both pass AnyUsersExistAsync
            // and create duplicate admin accounts. Serialize setup with a lock.
            await SetupGate.Lock.WaitAsync(token).ConfigureAwait(false);
            try
            {
                var hasUsers = await _userService.AnyUsersExistAsync(token).ConfigureAwait(false);
                if (hasUsers)
                    return BadRequest(new { error = "Setup has already been completed. An admin user already exists." });

                if (string.IsNullOrWhiteSpace(dto.Password))
                    return BadRequest(new { error = "A password is required to create the first admin via setup." });

                dto.Role = Models.Enums.UserRole.Admin;
                var user = await _userService.CreateAsync(dto, token).ConfigureAwait(false);

                // Login the newly created admin
                var loginDto = new LoginDto
                {
                    UsernameOrEmail = dto.Username,
                    Password = dto.Password,
                    RememberMe = true
                };
                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                var userAgent = Request.Headers.UserAgent.ToString();
                var result = await _authService.LoginAsync(loginDto, ipAddress, userAgent, token).ConfigureAwait(false);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during admin setup");
                return StatusCode(500, new { error = "An error occurred during admin setup" });
            }
            finally
            {
                SetupGate.Lock.Release();
            }
        }
    }
}
