using System.Text.RegularExpressions;
using System.Xml.Linq;
using RensaioBackend.Services.Opds;
using Xunit;

namespace RensaioBackend.Tests;

/// <summary>
/// Regression tests for KOReader's "Cannot get catalog info from nil".
/// KOReader only treats an entry link as a navigable catalog when its type matches application/atom+xml
/// (plugins/opds.koplugin/opdsbrowser.lua, genItemTableFromCatalog), so every subsection link needs a type.
/// </summary>
public class OpdsLinksTests
{
    private static XElement Render(string type)
    {
        // Wrap in an entry with the Atom namespace, the way the feed does, so the XML must be well formed.
        string xml = $@"<entry xmlns=""http://www.w3.org/2005/Atom"">{OpdsLinks.Subsection("/abc/all-series", type)}</entry>";
        return XElement.Parse(xml).Elements().Single();
    }

    [Theory]
    [InlineData(OpdsLinks.NavigationFeedType)]
    [InlineData(OpdsLinks.AcquisitionFeedType)]
    [InlineData(OpdsLinks.FeedType)]
    public void Subsection_link_has_rel_type_and_href(string type)
    {
        XElement link = Render(type);
        Assert.Equal("subsection", (string?)link.Attribute("rel"));
        Assert.Equal(type, (string?)link.Attribute("type"));
        Assert.Equal("/abc/all-series", (string?)link.Attribute("href"));
    }

    [Fact]
    public void Feed_types_are_opds_catalog_atom_types()
    {
        // This is the pattern KOReader matches (Lua pattern "application/atom%+xml" is a plain substring find).
        foreach (string type in new[] { OpdsLinks.NavigationFeedType, OpdsLinks.AcquisitionFeedType, OpdsLinks.FeedType })
            Assert.StartsWith("application/atom+xml;profile=opds-catalog", type);
    }

    [Fact]
    public void Kinds_match_what_the_target_feed_contains()
    {
        Assert.EndsWith(";kind=navigation", OpdsLinks.NavigationFeedType);
        Assert.EndsWith(";kind=acquisition", OpdsLinks.AcquisitionFeedType);
        // A series link may lead to a language picker (navigation) or a chapter list (acquisition), so no kind.
        Assert.DoesNotContain("kind=", OpdsLinks.FeedType);
    }

    [Fact]
    public void Feed_service_renders_subsection_links_only_through_the_helper()
    {
        // A literal rel="subsection" in the service would be a hand-written link that can silently lose its type.
        string source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "OpdsFeedService.cs.txt"));
        // Ignore the commented-out legacy BuildReadingFeedAsync block, which still holds an old literal.
        source = Regex.Replace(source, @"/\*.*?\*/", "", RegexOptions.Singleline);
        Assert.DoesNotContain("rel=\"\"subsection\"\"", source);
        Assert.DoesNotContain("rel=\\\"subsection\\\"", source);
        Assert.Contains("OpdsLinks.Subsection(", source);
    }
}
