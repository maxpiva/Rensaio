using System.Collections.Concurrent;

namespace KaizokuOAuthProxy.Services;

/// <summary>
/// In-memory token store using a ConcurrentDictionary.
/// Tokens are stored in plaintext (ephemeral, in-memory only, 5-minute TTL).
/// </summary>
public class TokenStoreService
{
    private readonly ConcurrentDictionary<string, TokenStoreEntry> _store = new();
    private readonly TimeSpan _entryTtl = TimeSpan.FromMinutes(5);

    public void Store(string state, string instanceKey, string provider)
    {
        _store[state] = new TokenStoreEntry
        {
            State = state,
            InstanceKey = instanceKey,
            Provider = provider,
            CreatedAt = DateTime.UtcNow
        };
    }

    public TokenStoreEntry? Retrieve(string state)
    {
        if (_store.TryGetValue(state, out var entry))
        {
            if (DateTime.UtcNow - entry.CreatedAt < _entryTtl)
                return entry;

            _store.TryRemove(state, out _);
        }
        return null;
    }

    public void SetTokens(string state, string accessToken, string? refreshToken, DateTime? expiresAt)
    {
        if (_store.TryGetValue(state, out var entry))
        {
            entry.AccessToken = accessToken;
            entry.RefreshToken = refreshToken;
            entry.ExpiresAt = expiresAt;
        }
    }

    public TokenStoreEntry? Remove(string state)
    {
        _store.TryRemove(state, out var entry);
        return entry;
    }
}

public class TokenStoreEntry
{
    public string State { get; set; } = string.Empty;
    public string InstanceKey { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
}