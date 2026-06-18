using System.Threading.Channels;

namespace RensaioBackend.Services.ReadState;

/// <summary>
/// Event payload published when a read state changes for a user+series combination.
/// </summary>
public record ReadStateChangeEvent(Guid UserId, Guid SeriesId);

/// <summary>
/// Singleton that acts as a producer/consumer bridge between ReadStateService
/// and any background consumers that need to react to read state changes.
///
/// ReadStateService publishes events here; DebouncedScrobblerSyncHostedService
/// consumes them with a debounce window.
/// </summary>
public class ReadStateChangeNotifier
{
    private readonly Channel<ReadStateChangeEvent> _channel =
        Channel.CreateUnbounded<ReadStateChangeEvent>(new UnboundedChannelOptions
        {
            SingleWriter = false,
            SingleReader = true
        });

    /// <summary>
    /// Publish a read state change event. Non-blocking.
    /// </summary>
    public void Notify(Guid userId, Guid seriesId)
    {
        _channel.Writer.TryWrite(new ReadStateChangeEvent(userId, seriesId));
    }

    /// <summary>
    /// Expose the reader side for consumers.
    /// </summary>
    public ChannelReader<ReadStateChangeEvent> Reader => _channel.Reader;
}
