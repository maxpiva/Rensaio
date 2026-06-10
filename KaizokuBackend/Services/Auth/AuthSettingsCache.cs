namespace KaizokuBackend.Services.Auth
{
    /// <summary>
    /// Provides a cheap in-process cache for the AuthenticationEnabled setting so that
    /// middleware does not hit the database on every request.
    /// </summary>
    public interface IAuthSettingsCache
    {
        /// <summary>
        /// Returns the currently cached value of AuthenticationEnabled.
        /// <para>
        /// <b>Fail-closed:</b> returns <c>true</c> (auth required) until the cache has been
        /// explicitly populated via <see cref="Update"/>.  This ensures no auth-bypass window
        /// exists between process start and the first successful DB read.
        /// </para>
        /// </summary>
        bool AuthenticationEnabled { get; }

        /// <summary>
        /// Updates the cached value. Called by SettingsService after each successful load or save.
        /// </summary>
        void Update(bool authenticationEnabled);
    }

    /// <summary>
    /// Thread-safe singleton implementation.
    /// <para>
    /// Uses two separate <c>volatile</c> fields written in a deliberate order so that the
    /// getter never observes <c>_loaded = true</c> with a stale <c>_value</c>:
    /// <list type="number">
    ///   <item><see cref="Update"/> writes <c>_value</c> first (with <see cref="Volatile.Write"/>),
    ///         then sets <c>_loaded = true</c>.</item>
    ///   <item>The getter reads <c>_loaded</c> first (with <see cref="Volatile.Read"/>);
    ///         only when true does it read <c>_value</c>.</item>
    /// </list>
    /// This store-release / load-acquire pair is correct on x86/x64 (TSO) and ARM.
    /// </para>
    /// </summary>
    public sealed class AuthSettingsCache : IAuthSettingsCache
    {
        // Written by Update() before _loaded is set to true.
        private volatile bool _value;

        // Written AFTER _value is stable.  Never reset to false once set.
        private volatile bool _loaded;

        /// <summary>
        /// Returns the persisted value when the cache has been loaded, or <c>true</c>
        /// (fail-closed — require authentication) until the first <see cref="Update"/> call.
        /// </summary>
        public bool AuthenticationEnabled
        {
            get
            {
                // Read _loaded with acquire semantics; if true, _value is already visible.
                if (Volatile.Read(ref _loaded))
                    return Volatile.Read(ref _value);

                // Cache not yet populated — fail closed (require auth).
                return true;
            }
        }

        public void Update(bool authenticationEnabled)
        {
            // Write the concrete value first so it is visible before _loaded is set.
            Volatile.Write(ref _value, authenticationEnabled);
            Volatile.Write(ref _loaded, true);
        }
    }
}
