namespace RensaioBackend.Services.Opds;

/// <summary>
/// OPDS 1.2 link media types and the one place that renders a catalog "subsection" link.
/// Kept free of other dependencies so it can be unit tested on its own.
/// </summary>
/// <remarks>
/// OPDS 1.2 section 2.1 requires <c>type</c> on links to other catalog feeds, and clients such as
/// KOReader decide whether an entry is a navigable catalog from that type alone: without it the entry
/// is shown but cannot be opened ("Cannot get catalog info from nil").
/// </remarks>
internal static class OpdsLinks
{
    /// <summary>A feed whose entries are links to other feeds (root, categories, tags, sources, series lists).</summary>
    public const string NavigationFeedType = "application/atom+xml;profile=opds-catalog;kind=navigation";

    /// <summary>A feed whose entries are publications (a chapter list).</summary>
    public const string AcquisitionFeedType = "application/atom+xml;profile=opds-catalog;kind=acquisition";

    /// <summary>
    /// A feed that may be either kind, so <c>kind</c> is left out (it is optional in OPDS 1.2).
    /// Used for series links: <c>/series/{id}</c> returns a language picker or a chapter list.
    /// </summary>
    public const string FeedType = "application/atom+xml;profile=opds-catalog";

    /// <summary>Renders <c>&lt;link rel="subsection" type="..." href="..."/&gt;</c>. <paramref name="escapedHref"/> must already be XML-escaped.</summary>
    public static string Subsection(string escapedHref, string type)
        => $@"<link rel=""subsection"" type=""{type}"" href=""{escapedHref}""/>";
}
