namespace Mihon.ExtensionsBridge.Models;

/// <summary>
/// Disk artifacts of a shadow-prepared (discovery) extension: the downloaded APK and converted JAR
/// live in <see cref="Folder"/> and <see cref="Entry"/> carries the manifest-derived metadata needed
/// to classload the JAR later — in this process or in a short-lived worker process.
/// </summary>
/// <remarks>
/// Produced by <c>IExtensionManager.PrepareDiscoveryArtifactsAsync</c>. The artifacts intentionally
/// live outside the installed-extension layout so nothing that scans or persists local extensions
/// observes them; the extension is never registered as installed.
/// </remarks>
public class DiscoveryArtifact
{
    /// <summary>Manifest-derived repository entry (jar file name, class name, package, version...).</summary>
    public RepositoryEntry Entry { get; set; }

    /// <summary>Absolute path of the discovery cache folder holding the APK + converted JAR.</summary>
    public string Folder { get; set; }
}