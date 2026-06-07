using KaizokuBackend.Models.Database;

namespace KaizokuBackend.Services.Auth;

/// <summary>
/// Service for generating and managing user invite tokens.
/// </summary>
public class UserInviteService
{
    /// <summary>
    /// Generates a one-time password set token for a user.
    /// Stores the token in the user entity.
    /// </summary>
    public string GeneratePasswordSetToken(UserEntity user)
    {
        string token = Guid.NewGuid().ToString("N");
        user.PasswordSetToken = token;
        return token;
    }

    /// <summary>
    /// Consumes (validates and clears) a password set token.
    /// Returns true if the token was valid and consumed.
    /// </summary>
    public bool ConsumePasswordSetToken(UserEntity user, string token)
    {
        if (string.IsNullOrWhiteSpace(user.PasswordSetToken))
            return false;

        if (!string.Equals(user.PasswordSetToken, token, StringComparison.OrdinalIgnoreCase))
            return false;

        user.PasswordSetToken = null;
        return true;
    }

    /// <summary>
    /// Generates the formatted invite message text.
    /// </summary>
    /// <param name="user">The user being invited.</param>
    /// <param name="externalDomain">The external domain (e.g. https://kaizoku.example.com).</param>
    /// <param name="authEnabled">Whether authentication is enabled.</param>
    public string GetInviteMessage(UserEntity user, string externalDomain, bool authEnabled)
    {
        string cleanDomain = externalDomain.TrimEnd('/');

        if (authEnabled && !string.IsNullOrWhiteSpace(user.PasswordSetToken))
        {
            return $"Hello {user.Username},\n\n" +
                   $"Click this link to set your password:\n" +
                   $"{cleanDomain}/auth/set-password?username={Uri.EscapeDataString(user.Username)}&token={user.PasswordSetToken}\n\n" +
                   $"Your OPDS path is: {cleanDomain}/{user.OpdsPath}";
        }
        else
        {
            return $"Hello {user.Username},\n\n" +
                   $"Your OPDS path is: {cleanDomain}/{user.OpdsPath}";
        }
    }
}