namespace RensaioBackend.Services.Import
{
    /// <summary>
    /// Folders that Rensaio did not write itself carry no provider or language, so the importer assumes "en".
    /// Titles written in CJK scripts will never be found by English-only providers, so this suggests the
    /// extra languages to search as well.
    /// </summary>
    public static class ImportLanguageHints
    {
        /// <summary>The placeholder provider the scanner gives to files that are not named by Rensaio.</summary>
        public const string UnknownProvider = "Unknown";

        /// <summary>
        /// Languages to search when importing one folder. The languages come from the folder's providers,
        /// defaulting to "en". A language is only a guess when every provider is the "Unknown" placeholder
        /// (the scanner hard-codes "en" for it) or there are none; only then are languages implied by the
        /// title's script added. If any provider got its language from a Rensaio file name or rensaio.json
        /// the languages are used exactly as given, so explicitly English folders are never widened.
        /// </summary>
        public static List<string> LanguagesForSearch(IEnumerable<(string Provider, string Language)> providers, string? title)
        {
            List<(string Provider, string Language)> list = providers.ToList();
            List<string> langs = list.Select(a => a.Language).Where(a => !string.IsNullOrEmpty(a)).Distinct().ToList();
            if (langs.Count == 0)
                langs = ["en"];
            bool guessed = list.All(a => string.IsNullOrEmpty(a.Provider) ||
                                         a.Provider.Equals(UnknownProvider, StringComparison.InvariantCultureIgnoreCase));
            return guessed ? WithScriptLanguages(langs, title) : langs;
        }

        /// <summary>
        /// Returns <paramref name="languages"/> plus any languages implied by the script of <paramref name="title"/>.
        /// Kana implies "ja", Hangul "ko"; Han characters alone are ambiguous so "ja" and "zh" are both added.
        /// The input is never reduced, and the result has no duplicates (case-insensitive).
        /// </summary>
        public static List<string> WithScriptLanguages(IEnumerable<string> languages, string? title)
        {
            List<string> result = new List<string>();
            foreach (string l in languages)
            {
                if (!result.Contains(l, StringComparer.InvariantCultureIgnoreCase))
                    result.Add(l);
            }
            if (string.IsNullOrWhiteSpace(title))
                return result;

            bool kana = false, hangul = false, han = false;
            foreach (char c in title)
            {
                if ((c >= '぀' && c <= 'ヿ') || (c >= 'ㇰ' && c <= 'ㇿ') || (c >= 'ｦ' && c <= 'ﾟ'))
                    kana = true;
                else if ((c >= '가' && c <= '힯') || (c >= 'ᄀ' && c <= 'ᇿ') || (c >= '㄰' && c <= '㆏'))
                    hangul = true;
                else if ((c >= '一' && c <= '鿿') || (c >= '㐀' && c <= '䶿'))
                    han = true;
            }
            List<string> extra = new List<string>();
            if (kana)
                extra.Add("ja");
            if (hangul)
                extra.Add("ko");
            if (han && !kana && !hangul)
            {
                extra.Add("ja");
                extra.Add("zh");
            }
            foreach (string l in extra)
            {
                if (!result.Contains(l, StringComparer.InvariantCultureIgnoreCase))
                    result.Add(l);
            }
            return result;
        }
    }
}
