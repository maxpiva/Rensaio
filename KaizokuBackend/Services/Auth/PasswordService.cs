using System.Security.Cryptography;

namespace KaizokuBackend.Services.Auth;

/// <summary>
/// Password hashing service using PBKDF2 with SHA-256.
/// </summary>
public class PasswordService
{
    private const int SaltSize = 128; // 128 bytes = 1024 bits
    private const int HashSize = 32;  // 32 bytes = 256 bits
    private const int Iterations = 600_000;

    /// <summary>
    /// Hashes a password with a newly generated salt.
    /// </summary>
    /// <param name="password">The plaintext password.</param>
    /// <param name="salt">The generated salt as a Base64 string.</param>
    /// <returns>The password hash as a Base64 string.</returns>
    public string HashPassword(string password, out string salt)
    {
        byte[] saltBytes = RandomNumberGenerator.GetBytes(SaltSize);
        salt = Convert.ToBase64String(saltBytes);

        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            saltBytes,
            Iterations,
            HashAlgorithmName.SHA256,
            HashSize
        );

        return Convert.ToBase64String(hash);
    }

    /// <summary>
    /// Verifies a password against a stored hash and salt.
    /// </summary>
    /// <param name="password">The plaintext password to verify.</param>
    /// <param name="hash">The stored Base64 hash.</param>
    /// <param name="salt">The stored Base64 salt.</param>
    /// <returns>True if the password matches the hash.</returns>
    public bool VerifyPassword(string password, string hash, string salt)
    {
        byte[] saltBytes = Convert.FromBase64String(salt);
        byte[] hashBytes = Convert.FromBase64String(hash);

        byte[] computedHash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            saltBytes,
            Iterations,
            HashAlgorithmName.SHA256,
            HashSize
        );

        return CryptographicOperations.FixedTimeEquals(hashBytes, computedHash);
    }
}