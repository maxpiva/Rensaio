using Microsoft.AspNetCore.DataProtection;

namespace RensaioBackend.Services.Scrobbling;

/// <summary>
/// Encrypts and decrypts OAuth tokens stored in the database using ASP.NET Core Data Protection.
/// </summary>
public class ScrobblerTokenProtector
{
    private readonly IDataProtector _protector;

    public ScrobblerTokenProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector("Rensaio.Scrobbler.Tokens");
    }

    public string Encrypt(string plainText)
        => _protector.Protect(plainText);

    public string Decrypt(string protectedText)
        => _protector.Unprotect(protectedText);
}