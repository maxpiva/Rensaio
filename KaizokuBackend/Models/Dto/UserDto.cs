using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Enums;
using System.Text.Json.Serialization;

namespace KaizokuBackend.Models.Dto;

public class UserDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("avatarBase64")]
    public string? AvatarBase64 { get; set; }

    [JsonPropertyName("avatarContentType")]
    public string? AvatarContentType { get; set; }

    [JsonPropertyName("level")]
    public UserLevel Level { get; set; }

    [JsonPropertyName("opdsPath")]
    public string OpdsPath { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("lastLoginAt")]
    public DateTime? LastLoginAt { get; set; }

    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; }

    [JsonPropertyName("hasPassword")]
    public bool HasPassword { get; set; }

    public static UserDto FromEntity(UserEntity entity)
    {
        return new UserDto
        {
            Id = entity.Id,
            Username = entity.Username,
            AvatarBase64 = entity.AvatarBlob != null ? Convert.ToBase64String(entity.AvatarBlob) : null,
            AvatarContentType = entity.AvatarContentType,
            Level = entity.Level,
            OpdsPath = entity.OpdsPath,
            CreatedAt = entity.CreatedAt,
            LastLoginAt = entity.LastLoginAt,
            IsActive = entity.IsActive,
            HasPassword = !string.IsNullOrWhiteSpace(entity.PasswordHash)
        };
    }
}

public class CreateUserDto
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("level")]
    public UserLevel Level { get; set; } = UserLevel.User;
}

public class UpdateUserDto
{
    [JsonPropertyName("avatarBase64")]
    public string? AvatarBase64 { get; set; }

    [JsonPropertyName("avatarContentType")]
    public string? AvatarContentType { get; set; }

    [JsonPropertyName("removeAvatar")]
    public bool? RemoveAvatar { get; set; }

    [JsonPropertyName("level")]
    public UserLevel? Level { get; set; }

    [JsonPropertyName("isActive")]
    public bool? IsActive { get; set; }
}

public class AuthStatusDto
{
    [JsonPropertyName("authenticationEnabled")]
    public bool AuthenticationEnabled { get; set; }

    [JsonPropertyName("hasUsers")]
    public bool HasUsers { get; set; }

    [JsonPropertyName("users")]
    public List<UserDto>? Users { get; set; }
}

public class LoginRequestDto
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;

    [JsonPropertyName("rememberMe")]
    public bool RememberMe { get; set; }
}

public class LoginResponseDto
{
    [JsonPropertyName("token")]
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("user")]
    public UserDto User { get; set; } = null!;
}

public class SelectUserRequestDto
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;
}

public class SetPasswordRequestDto
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("token")]
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}

public class ChangePasswordDto
{
    [JsonPropertyName("currentPassword")]
    public string CurrentPassword { get; set; } = string.Empty;

    [JsonPropertyName("newPassword")]
    public string NewPassword { get; set; } = string.Empty;
}

public class InviteMessageDto
{
    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("token")]
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("opdsPath")]
    public string OpdsPath { get; set; } = string.Empty;
}

public class RegenerateOpdsResponseDto
{
    [JsonPropertyName("opdsPath")]
    public string OpdsPath { get; set; } = string.Empty;
}