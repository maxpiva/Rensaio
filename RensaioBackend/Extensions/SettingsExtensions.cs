using RensaioBackend.Models.Dto;

namespace RensaioBackend.Extensions
{
    public static class SettingsExtensions
    {

        public static string? ResolveSeriesAbsolutePath(this SettingsDto series, string? seriesPath)
        {
            if (string.IsNullOrEmpty(series.StorageFolder) || string.IsNullOrEmpty(seriesPath))
                return null;
            return Path.Combine(series.StorageFolder, seriesPath);
        }
        public static string? ResolveChapterPath(this SettingsDto series, string? seriesPath, string? chapterFilename)
        {
            if (string.IsNullOrEmpty(chapterFilename))
                return null;
            string? seriesAbsolutePath = ResolveSeriesAbsolutePath(series, seriesPath);
            if (string.IsNullOrEmpty(seriesAbsolutePath) || !Directory.Exists(seriesAbsolutePath))
                return null;
            // Try exact match
            string exactPath = System.IO.Path.Combine(seriesAbsolutePath, chapterFilename);
            if (File.Exists(exactPath))
                return exactPath;

            // Try with common extensions
            foreach (string ext in new[] { ".cbz", ".zip", ".rar", ".cbr", ".7z", ".cb7" })
            {
                string extPath = System.IO.Path.Combine(seriesAbsolutePath,
                    System.IO.Path.GetFileNameWithoutExtension(chapterFilename) + ext);
                if (File.Exists(extPath))
                    return extPath;
            }

            // Scan directory for matching files
            foreach (string file in Directory.GetFiles(seriesAbsolutePath))
            {
                string fileName = System.IO.Path.GetFileName(file);
                if (fileName.Contains(System.IO.Path.GetFileNameWithoutExtension(chapterFilename),
                    StringComparison.OrdinalIgnoreCase))
                {
                    return file;
                }
            }

            return null;
        }


    }
}
