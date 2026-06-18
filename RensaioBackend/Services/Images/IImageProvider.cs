using RensaioBackend.Models.Database;

namespace RensaioBackend.Services.Images
{
    public interface IImageProvider
    {
        bool CanProcess(string url);
        public Task<Stream?> ObtainStreamAsync(EtagCacheEntity entry, CancellationToken token);
    }
}
