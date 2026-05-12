using System.Globalization;
using System.Text;

namespace KaizokuBackend.Services.Helpers
{
    /// <summary>
    /// Lightweight, script-based language detector. Designed for short manga titles
    /// where dominant Unicode script is a strong signal. Returns Mihon-style
    /// lowercase ISO 639-1 codes (e.g. "en", "ru", "ja").
    ///
    /// Note: this is a heuristic — it cannot distinguish between languages that share
    /// a script (e.g. English vs. Spanish, both Latin). For those it returns "en" as
    /// the safe default since most manga sources publish in English when using Latin.
    /// </summary>
    public static class LanguageDetector
    {
        /// <summary>
        /// Detect the most likely language code from a title.
        /// </summary>
        /// <param name="text">Title or short text to inspect.</param>
        /// <param name="fallback">Code to return if no decisive script is found.</param>
        /// <returns>Lowercase Mihon-style language code, or <paramref name="fallback"/>.</returns>
        public static string Detect(string? text, string fallback = "en")
        {
            if (string.IsNullOrWhiteSpace(text))
                return fallback;

            int cyrillic = 0;
            int hangul = 0;
            int hiraganaKatakana = 0;
            int han = 0;
            int thai = 0;
            int arabic = 0;
            int hebrew = 0;
            int greek = 0;
            int devanagari = 0;
            int bengali = 0;
            int latin = 0;

            foreach (var rune in text.EnumerateRunes())
            {
                int v = rune.Value;

                if (!IsLetter(rune))
                    continue;

                if (v >= 0x0400 && v <= 0x04FF) cyrillic++;
                else if (v >= 0x0500 && v <= 0x052F) cyrillic++; // Cyrillic Supplement
                else if ((v >= 0x1100 && v <= 0x11FF) ||
                         (v >= 0x3130 && v <= 0x318F) ||
                         (v >= 0xAC00 && v <= 0xD7AF)) hangul++;
                else if ((v >= 0x3040 && v <= 0x309F) ||
                         (v >= 0x30A0 && v <= 0x30FF) ||
                         (v >= 0x31F0 && v <= 0x31FF)) hiraganaKatakana++;
                else if ((v >= 0x4E00 && v <= 0x9FFF) ||
                         (v >= 0x3400 && v <= 0x4DBF) ||
                         (v >= 0xF900 && v <= 0xFAFF)) han++;
                else if (v >= 0x0E00 && v <= 0x0E7F) thai++;
                else if ((v >= 0x0600 && v <= 0x06FF) ||
                         (v >= 0x0750 && v <= 0x077F) ||
                         (v >= 0xFB50 && v <= 0xFDFF) ||
                         (v >= 0xFE70 && v <= 0xFEFF)) arabic++;
                else if (v >= 0x0590 && v <= 0x05FF) hebrew++;
                else if ((v >= 0x0370 && v <= 0x03FF) ||
                         (v >= 0x1F00 && v <= 0x1FFF)) greek++;
                else if (v >= 0x0900 && v <= 0x097F) devanagari++;
                else if (v >= 0x0980 && v <= 0x09FF) bengali++;
                else if ((v >= 0x0041 && v <= 0x007A) ||
                         (v >= 0x00C0 && v <= 0x024F)) latin++;
            }

            // Asian-script titles often contain a mix; presence of hiragana/katakana
            // is conclusive for Japanese even with Han characters present.
            if (hiraganaKatakana > 0) return "ja";
            if (hangul > 0) return "ko";

            // Pick the dominant script among the remaining categories.
            var scores = new (string code, int count)[]
            {
                ("ru", cyrillic),
                ("zh", han),
                ("th", thai),
                ("ar", arabic),
                ("he", hebrew),
                ("el", greek),
                ("hi", devanagari),
                ("bn", bengali),
                ("en", latin),
            };

            int max = 0;
            string winner = fallback;
            foreach (var s in scores)
            {
                if (s.count > max)
                {
                    max = s.count;
                    winner = s.code;
                }
            }

            return max > 0 ? winner : fallback;
        }

        /// <summary>
        /// Resolve the effective language for a stored entry.
        /// If the explicit source language is specific (not "all" / empty), use it as-is.
        /// Otherwise fall back to script detection from the title.
        /// </summary>
        public static string Resolve(string? sourceLanguage, string? title, string fallback = "en")
        {
            if (!string.IsNullOrWhiteSpace(sourceLanguage) &&
                !sourceLanguage.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                return sourceLanguage!;
            }
            return Detect(title, fallback);
        }

        private static bool IsLetter(Rune rune)
        {
            var cat = Rune.GetUnicodeCategory(rune);
            return cat == UnicodeCategory.LowercaseLetter
                || cat == UnicodeCategory.UppercaseLetter
                || cat == UnicodeCategory.TitlecaseLetter
                || cat == UnicodeCategory.ModifierLetter
                || cat == UnicodeCategory.OtherLetter;
        }
    }
}
