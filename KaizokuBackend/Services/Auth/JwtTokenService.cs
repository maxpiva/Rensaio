using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Enums;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using JwtRegisteredClaimNames = System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames;

namespace KaizokuBackend.Services.Auth;

/// <summary>
/// Service for generating and validating JWT access tokens and refresh tokens.
/// </summary>
public class JwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>
    /// Gets the JWT signing key from configuration.
    /// On first run, a random key is auto-generated and persisted.
    /// </summary>
    private string GetJwtSecret()
    {
        string? secret = _configuration["Authentication:JwtSecret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            // Auto-generate a 256-bit key
            byte[] keyBytes = RandomNumberGenerator.GetBytes(32);
            secret = Convert.ToBase64String(keyBytes);
            // Note: Persisting is handled externally (Startup)
        }
        return secret;
    }

    /// <summary>
    /// Generates a JWT access token for the given user.
    /// </summary>
    public string GenerateAccessToken(UserEntity user)
    {
        string secret = GetJwtSecret();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        int expirationHours = _configuration.GetValue<int>("Authentication:SessionExpirationHours", 24);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
            new Claim("level", ((int)user.Level).ToString()),
            new Claim("opdsPath", user.OpdsPath),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: "Kaizoku",
            audience: "Kaizoku",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(expirationHours),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Generates a cryptographically random refresh token.
    /// Returns both the raw token (to give to client) and its SHA-256 hash (to store in DB).
    /// </summary>
    public (string rawToken, string hash) GenerateRefreshToken()
    {
        byte[] tokenBytes = RandomNumberGenerator.GetBytes(32); // 256-bit
        string rawToken = Convert.ToBase64String(tokenBytes);

        byte[] hashBytes = SHA256.HashData(tokenBytes);
        string hash = Convert.ToBase64String(hashBytes);

        return (rawToken, hash);
    }

    /// <summary>
    /// Validates a refresh token raw value against the stored hash.
    /// </summary>
    public bool ValidateRefreshToken(string rawToken, string storedHash)
    {
        byte[] tokenBytes = Convert.FromBase64String(rawToken);
        byte[] computedHash = SHA256.HashData(tokenBytes);
        string computedHashString = Convert.ToBase64String(computedHash);

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computedHashString),
            Encoding.UTF8.GetBytes(storedHash)
        );
    }

    /// <summary>
    /// Validates a JWT token and returns the ClaimsPrincipal.
    /// Returns null if the token is invalid or expired.
    /// </summary>
    public ClaimsPrincipal? ValidateToken(string token)
    {
        string secret = GetJwtSecret();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));

        try
        {
            var handler = new JwtSecurityTokenHandler();
            var result = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = key,
                ValidateIssuer = true,
                ValidIssuer = "Kaizoku",
                ValidateAudience = true,
                ValidAudience = "Kaizoku",
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            }, out _);

            return result;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Extracts the user ID (sub claim) from a valid principal.
    /// </summary>
    public Guid? GetUserIdFromPrincipal(ClaimsPrincipal principal)
    {
        string? subClaim = principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (string.IsNullOrWhiteSpace(subClaim))
            return null;

        if (Guid.TryParse(subClaim, out Guid userId))
            return userId;

        return null;
    }

    /// <summary>
    /// Gets the remember-me expiration days from configuration.
    /// </summary>
    public int GetRememberMeExpirationDays()
    {
        return _configuration.GetValue<int>("Authentication:RememberMeExpirationDays", 30);
    }
}