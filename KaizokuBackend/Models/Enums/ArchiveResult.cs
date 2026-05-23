namespace KaizokuBackend.Models.Enums;

public enum ArchiveResult
{
    Fine,
    NotAnArchive,
    NoImages,
    NotFound,
    /// <summary>
    /// File exists on disk but the archive could not be read (locked file, I/O error,
    /// transient failure, etc). Distinct from <see cref="NotAnArchive"/>, which means
    /// the file was read successfully but contains no entries. Callers should treat
    /// this as transient and avoid destructive actions.
    /// </summary>
    Unreadable,
}