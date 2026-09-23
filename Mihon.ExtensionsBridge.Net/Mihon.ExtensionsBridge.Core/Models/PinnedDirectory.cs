using Mihon.ExtensionsBridge.Models.Abstractions;

namespace Mihon.ExtensionsBridge.Core.Models
{
    /// <summary>
    /// An <see cref="ITemporaryDirectory"/> facade over a caller-owned persistent folder.
    /// Unlike <see cref="TemporaryDirectory"/>, disposal is a no-op: the folder holds cache
    /// artifacts (e.g. discovery shadow-load APK/JAR files) that are meant to outlive the work unit.
    /// </summary>
    public sealed class PinnedDirectory : ITemporaryDirectory
    {
        /// <summary>Absolute path of the pinned folder.</summary>
        public string Path { get; }

        /// <summary>
        /// Creates (if needed) and pins the given folder. The folder is created eagerly so that
        /// downstream work-unit code can write artifacts into it immediately.
        /// </summary>
        /// <param name="path">Absolute path of the persistent folder.</param>
        /// <exception cref="ArgumentException">Thrown when <paramref name="path"/> is null or whitespace.</exception>
        public PinnedDirectory(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                throw new ArgumentException("Path cannot be null or whitespace.", nameof(path));
            Directory.CreateDirectory(path);
            Path = path;
        }

        /// <summary>
        /// Intentionally empty: the folder is a persistent cache owned by the caller and must not
        /// be deleted when a work unit is disposed.
        /// </summary>
        public void Dispose()
        {
            // Intentionally empty: the folder is a persistent cache owned by the caller.
        }
    }
}