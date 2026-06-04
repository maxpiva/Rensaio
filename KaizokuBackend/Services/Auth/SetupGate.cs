namespace KaizokuBackend.Services.Auth
{
    /// <summary>
    /// Process-wide lock serializing first-user creation across all entry points
    /// (POST /api/auth/setup and POST /api/users/first) so the "no users exist"
    /// check-then-create cannot race between the two endpoints.
    /// </summary>
    internal static class SetupGate
    {
        internal static readonly System.Threading.SemaphoreSlim Lock = new(1, 1);
    }
}
