namespace RensaioBackend.Extensions
{
    public static class HttpExtensions
    {
        public static string[] UniversalFileImageExtensionArray = { "png", "jpeg", "jpg", "webp", "gif" };
        public static string[] NonUniversalFileImageExtensionArray = { "avif", "jxl", "heif", "j2k", "jp2" };
        public static Dictionary<string, List<string>> NonUniversalSupportedMimeMappings = new Dictionary<string, List<string>>()
        {
            { "jp2", ["jp2", "j2k"] } ,
            { "j2k", ["jp2", "j2k"] } ,
            { "heif", ["heif"] } , //heic not supported (x265), tbd
            { "jxl", ["jxl"] } ,
            { "avif", ["avif"] } ,
        };
        public static string NonUniversalFileImageExtensions = @"(\." + string.Join(@"|\.", NonUniversalFileImageExtensionArray) + ")";
        /// <summary>
        /// Regex to Match All our supported Images extensions.
        /// </summary>
        public static string ImageFileExtensions = @"(\." + string.Join(@"|\.", UniversalFileImageExtensionArray.Union(NonUniversalFileImageExtensionArray)) + ")"; // Don't forget to update CoverChooser


        /// <summary>
        /// Retrieves the supported image types extensions from the Accept header of the HTTP request.
        /// </summary>
        /// <param name="request">The HTTP request.</param>
        /// <returns>A list of supported image types extensions by the Browser.</returns>
        public static List<string> SupportedImageTypesFromRequest(this HttpRequest request)
        {
            // Add default extensions supported by all browsers.
            List<string> supportedExtensions = UniversalFileImageExtensionArray.ToList();
            //Early eject if the browser or api do not provide an Accept header.
            if (!request.Headers.ContainsKey("Accept"))
                return supportedExtensions;

            var acceptHeader = request.Headers["Accept"].ToString();
            var split = acceptHeader.Split(';'); //remove any parameters like "q=0.8"
            acceptHeader = split[0];
            split = acceptHeader.Split(',');


            // Browser add specific image mime types, when the image type is not a global standard, browser specify the specific image type in the accept header.
            // Let's reuse that to identify the additional image types supported by the browser.
            foreach (var v in split)
            {
                if (!v.StartsWith("image/", StringComparison.InvariantCultureIgnoreCase))
                    continue;
                var mimeImagePart = v.Substring(6).ToLowerInvariant();
                if (mimeImagePart.StartsWith("*"))
                    continue;
                if (NonUniversalSupportedMimeMappings.ContainsKey(mimeImagePart))
                {
                    NonUniversalSupportedMimeMappings[mimeImagePart].ForEach(x => AddExtension(supportedExtensions, x));
                }
                else if (mimeImagePart == "svg+xml")
                {
                    AddExtension(supportedExtensions, "svg");
                }
                else
                {
                    AddExtension(supportedExtensions, mimeImagePart);
                }
            }
            //Make Non Universal preferred in the list.
            return supportedExtensions.Reverse<string>().ToList();
        }
        private static void AddExtension(List<string> extensions, string extension)
        {
            if (string.IsNullOrEmpty(extension))
                return;
            if (!extensions.Contains(extension))
            {
                extensions.Add(extension);
            }
        }
        /// <summary>
        /// Gets the ETag value from the request's If-None-Match header
        /// </summary>
        /// <returns>The ETag value if present, null otherwise</returns>
        public static string? GetETagFromRequest(this HttpRequest? request)
        {
            if (request == null)
                return null;
            if (request.Headers.TryGetValue("If-None-Match", out var etagValues))
            {
                string etag = etagValues.ToString();

                // If the ETag is wrapped in quotes, remove them
                if (etag.StartsWith("\"") && etag.EndsWith("\""))
                {
                    etag = etag.Substring(1, etag.Length - 2);
                }

                return etag;
            }

            return null;
        }


        /// <summary>
        /// Adds an ETag header to the response
        /// </summary>
        /// <param name="etag">The ETag value to add</param>
        public static void AddETag(this HttpResponse? response, TimeSpan timespan, string etag)
        {
            if (!string.IsNullOrEmpty(etag))
            {
                int secs = (int)timespan.TotalSeconds;
                // Add the ETag header, properly quoted as per HTTP spec
                string quotedEtag = $"\"{etag}\"";
                if (response != null)
                {
                    response.Headers.ETag = quotedEtag;
                    response.Headers.CacheControl = $"public, max-age={secs}"; // Cache for 1 day
                    response.Headers.Expires = DateTime.UtcNow.AddSeconds(secs).ToString("R");
                    response.Headers.Remove("Pragma");
                    response.Headers.Remove("Vary");
                }
            }
        }
    }
}
