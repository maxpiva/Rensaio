namespace KaizokuBackend.Services.Auth
{
    public class AuthLockoutException : InvalidOperationException
    {
        public AuthLockoutException(string message) : base(message)
        {
        }
    }
}
