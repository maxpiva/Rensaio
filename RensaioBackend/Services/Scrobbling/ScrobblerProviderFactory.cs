using RensaioBackend.Models.Enums;
using RensaioBackend.Services.Scrobbling.Abstractions;

namespace RensaioBackend.Services.Scrobbling;

/// <summary>
/// Factory to resolve an <see cref="IScrobblerProvider"/> by <see cref="ScrobblerProvider"/> enum value.
/// </summary>
public class ScrobblerProviderFactory
{
    private readonly IEnumerable<IScrobblerProvider> _providers;

    public ScrobblerProviderFactory(IEnumerable<IScrobblerProvider> providers)
    {
        _providers = providers;
    }

    public IScrobblerProvider? GetProvider(ScrobblerProvider type)
        => _providers.FirstOrDefault(p => p.ProviderType == type);

    public List<IScrobblerProvider> GetAllProviders()
        => _providers.ToList();
}