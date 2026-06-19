using RensaioBackend.Services.Images;
using RensaioBackend.Utils;
using NetVips;
using SkiaSharp;
using System.Collections.Concurrent;
using System.Numerics;
using System.Text.RegularExpressions;
using static RensaioBackend.Extensions.ImageExtensions;

namespace RensaioBackend.Extensions
{
    /// <summary>
    /// Defines a factory for creating and manipulating images from various sources and formats.
    /// </summary>
    public interface IImageFactory
    {
        /// <summary>
        /// Creates an image from the specified file path.
        /// </summary>
        /// <param name="filename">The path to the image file.</param>
        /// <returns>An <see cref="IImage"/> instance representing the loaded image.</returns>
        IImage Create(string filename);

        /// <summary>
        /// Creates an image from the provided stream.
        /// </summary>
        /// <param name="stream">A stream containing image data.</param>
        /// <returns>An <see cref="IImage"/> instance representing the loaded image.</returns>
        IImage Create(Stream stream);

        /// <summary>
        /// Gets the dimensions of the specified image file.
        /// </summary>
        /// <param name="filename">The path to the image file.</param>
        /// <returns>
        /// A tuple containing the width and height of the image, or <c>null</c> if the dimensions cannot be determined.
        /// </returns>
        (int Width, int Height)? GetDimensions(string filename);

    }
    /// <summary>
    /// Defines operations for manipulating and saving images.
    /// </summary>
    public interface IImage : IDisposable
    {
        /// <summary>
        /// Gets the width of the image in pixels.
        /// </summary>
        int Width { get; }

        /// <summary>
        /// Gets the height of the image in pixels.
        /// </summary>
        int Height { get; }

        /// <summary>
        /// Creates a deep copy of the current image instance.
        /// </summary>
        /// <returns>A new <see cref="IImage"/> instance that is a copy of the current image.</returns>
        IImage Clone();

        /// <summary>
        /// Resizes the image to the specified dimensions.
        /// </summary>
        /// <param name="width">The target width in pixels.</param>
        /// <param name="height">The target height in pixels.</param>
        void Resize(int width, int height);

        /// <summary>
        /// Asynchronously saves the image to a file in the specified format.
        /// </summary>
        /// <param name="filename">The file path to save the image.</param>
        /// <param name="format">The format to use for encoding the image.</param>
        /// <param name="token">A cancellation token to cancel the operation.</param>
        /// <returns>A task representing the asynchronous save operation.</returns>
        Task SaveAsync(string filename, EncodeFormat format, CancellationToken token = default);

        /// <summary>
        /// Asynchronously saves the image to a stream in the specified format.
        /// </summary>
        /// <param name="stream">The stream to write the image data to.</param>
        /// <param name="format">The format to use for encoding the image.</param>
        /// <param name="token">A cancellation token to cancel the operation.</param>
        /// <returns>A task representing the asynchronous save operation.</returns>
        Task SaveAsync(Stream stream, EncodeFormat format, CancellationToken token = default);

    }
    public class NetVipsImageFactory : IImageFactory
    {
        /// <inheritdoc/>
        public IImage Create(string filename)
        {
            return new NetVipsImage(filename);
        }
    
        /// <inheritdoc/>
        public IImage Create(Stream stream)
        {
            return new NetVipsImage(stream);
        }


        /// <inheritdoc/>
        public IImage Create(int width, int height, byte red = 0, byte green = 0, byte blue = 0)
        {
            return new NetVipsImage(width, height, red, green, blue);
        }

        /// <inheritdoc/>
        public (int Width, int Height)? GetDimensions(string filename)
        {
            try
            {
                using var image = new NetVipsImage(filename);
                return (image.Width, image.Height);
            }
            catch
            {
                // Ignore errors and return null
            }
            return null;
        }


    }   


    /// <summary>
    /// NetVips implementation of <see cref="IImage"/> for image manipulation.
    /// </summary>
    public class NetVipsImage : IImage
    {
        Image? _image = null;

        /// <inheritdoc/>
        public int Width => _image?.Width ?? 0;

        /// <inheritdoc/>
        public int Height => _image?.Height ?? 0;


        /// <summary>
        /// Loads an image from a file.
        /// </summary>
        /// <param name="filename">The file path.</param>
        public NetVipsImage(string filename)
        {
            _image = Image.NewFromFile(filename, false, access: Enums.Access.SequentialUnbuffered);
        }


        /// <summary>
        /// Private constructor for internal use.
        /// </summary>
        private NetVipsImage()
        {

        }

        /// <summary>
        /// Loads an image from a stream.
        /// </summary>
        /// <param name="stream">The image stream.</param>
        public NetVipsImage(Stream stream)
        {
            _image = Image.NewFromStream(stream, access: Enums.Access.SequentialUnbuffered);
        }

        /// <summary>
        /// Creates a copy of the provided NetVips image.
        /// </summary>
        /// <param name="image">The NetVips image to copy.</param>
        public NetVipsImage(Image image)
        {
            _image = image.Copy();
        }

        /// <summary>
        /// Creates a blank image with the specified dimensions and background color.
        /// </summary>
        /// <param name="width">The width of the image.</param>
        /// <param name="height">The height of the image.</param>
        /// <param name="red">Red channel value.</param>
        /// <param name="green">Green channel value.</param>
        /// <param name="blue">Blue channel value.</param>
        public NetVipsImage(int width, int height, byte red = 0, byte green = 0, byte blue = 0)
        {
            double[] background = { red, green, blue };

            _image = Image.Black(width, height).NewFromImage(background);
        }

        /// <inheritdoc/>
        public IImage Clone()
        {
            return new NetVipsImage(_image!);
        }

        /// <inheritdoc/>
        public void Resize(int width, int height)
        {
            // Scale separately in X and Y
            double scaleX = (double)width / _image!.Width;
            double scaleY = (double)height / _image!.Height;
            var old = _image;
            _image = old.Resize(scaleX, kernel: Enums.Kernel.Lanczos3, vscale: scaleY);
            old.Dispose();
        }

        /// <inheritdoc/>
        public void Crop(int x, int y, int width, int height)
        {
            var old = _image!;
            _image = old.Crop(x, y, width, height);
            old.Dispose();
        }


        /// <summary>
        /// Gets the save options for the specified format.
        /// </summary>
        /// <param name="format">The encoding format.</param>
        /// <returns>A <see cref="VOption"/> with the appropriate options.</returns>
        private static VOption GetSaveOptions(EncodeFormat format)
        {
            var quality = format.DefaultQuality();
            var options = new VOption();

            switch (format)
            {
                case EncodeFormat.JPEG:
                case EncodeFormat.WEBP:
                case EncodeFormat.AVIF:
                    options["Q"] = (int)quality; // Quality for lossy formats
                    break;
                case EncodeFormat.PNG:
                    options["compression"] = 9 - (int)(quality / 11); // 0–9 deflate level
                    break;
            }

            return options;
        }

        /// <inheritdoc/>
        public Task SaveAsync(string filename, EncodeFormat format, CancellationToken token = default)
        {
            // NetVips is synchronous — execute synchronously and return completed task
            if (token.IsCancellationRequested)
                return Task.FromCanceled(token);
            _image!.WriteToFile(filename, GetSaveOptions(format));
            return Task.CompletedTask;
        }

        /// <inheritdoc/>
        public async Task SaveAsync(Stream stream, EncodeFormat format, CancellationToken token = default)
        {
            if (token.IsCancellationRequested)
                return;
            var buffer = _image!.WriteToBuffer(format.GetExtension(), GetSaveOptions(format));
            await stream.WriteAsync(buffer, 0, buffer.Length, token).ConfigureAwait(false);
        }
        /// <inheritdoc/>
        public void Dispose()
        {
            _image?.Dispose();
        }

    }
    /// <summary>
    /// Extension methods for image processing and manipulation
    /// </summary>
    public static class ImageExtensions
    { 
        public static string GetExtension(this EncodeFormat encodeFormat)
        {
            return encodeFormat switch
            {
                EncodeFormat.PNG => ".png",
                EncodeFormat.WEBP => ".webp",
                EncodeFormat.AVIF => ".avif",
                EncodeFormat.JPEG => ".jpg",
                _ => throw new ArgumentOutOfRangeException(nameof(encodeFormat), encodeFormat, null)
            };
        }
        public static uint DefaultQuality(this EncodeFormat encodeFormat)
        {
            return encodeFormat switch
            {
                EncodeFormat.PNG => 100, // (Maximum Deflate Compression) (In case of PNG, png is always lossless, Quality indicates the compression level)
                EncodeFormat.WEBP => 100,
                EncodeFormat.AVIF => 100,
                EncodeFormat.JPEG => 99, // (Best Compression speed, with almost no visual quality loss)
                _ => throw new ArgumentOutOfRangeException(nameof(encodeFormat), encodeFormat, null)
            };
        }
        private static readonly List<(byte[] Signature, int Offset, string MimeType, string Extension)> ImageSignatures = new()
        {
            (new byte[] { 0xFF, 0xD8 }, 0, "image/jpeg", ".jpg"),
            (new byte[] { 0x89, 0x50, 0x4E, 0x47 }, 0, "image/png", ".png"),
            (new byte[] { 0x47, 0x49, 0x46, 0x38 }, 0, "image/gif", ".gif"),
            (new byte[] { 0x42, 0x4D }, 0, "image/bmp", ".bmp"),
            (new byte[] { 0x00, 0x00, 0x01, 0x00 }, 0, "image/x-icon", ".ico"),
            (new byte[] { 0x49, 0x49, 0x2A, 0x00 }, 0, "image/tiff", ".tiff"),
            (new byte[] { 0x4D, 0x4D, 0x00, 0x2A }, 0, "image/tiff", ".tiff"),
            (new byte[] { 0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50 }, 0, "image/webp", ".webp"),
            (new byte[] { 0x00, 0x00, 0x00, 0x0C, 0x4A, 0x58, 0x4C, 0x20 }, 0, "image/jxl", ".jxl"),
            (new byte[] { 0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20 }, 0, "image/jp2", ".jp2"),
            (new byte[] { 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66 }, 4, "image/avif", ".avif"),
            (new byte[] { 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63 }, 4, "image/heic", ".heic")
        };

        /// <summary>
        /// Detects image MIME type and file extension from a stream
        /// </summary>
        /// <param name="stream">Stream to analyze</param>
        /// <returns>Tuple containing MIME type and file extension, or null values if not detected</returns>
        public static (string? MimeType, string? Extension) GetImageMimeTypeAndExtension(this Stream stream)
        {
            if (!stream.CanRead || !stream.CanSeek)
                return (null, null);

            byte[] header = new byte[20];
            int _ = stream.Read(header, 0, header.Length);
            stream.Position = 0;

            foreach (var (signature, offset, mime, ext) in ImageSignatures)
            {
                if (header.Length >= offset + signature.Length)
                {
                    bool match = true;
                    for (int i = 0; i < signature.Length; i++)
                    {
                        // 0 byte in signature acts as wildcard
                        if (signature[i] != 0 && header[offset + i] != signature[i])
                        {
                            match = false;
                            break;
                        }
                    }

                    if (match)
                        return (mime, ext);
                }
            }

            return (null, null);
        }

        /// <summary>
        /// Writes a cover.jpg file from an image stream to the specified folder path.
        /// /// <param name="imageStream">The source image stream (seekable)</param>
        /// <param name="folderPath">The target folder path where cover.jpg will be written</param>
        /// <param name="jpegQuality">JPEG quality (0-100, default 90)</param>
        /// <param name="token">Cancellation token</param>
        /// <returns>true if the cover was written successfully, false otherwise</returns>
        public static async Task<bool> WriteCoverJpegAsync(this Stream imageStream, string folderPath, int jpegQuality = 90, CancellationToken token = default)
        {
            try
            {
                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                }

                string coverPath = Path.Combine(folderPath, "cover.jpg");

                // Reset stream position to the beginning
                imageStream.Position = 0;

                // Detect image format using the existing extension method
                var (mimeType, _) = imageStream.GetImageMimeTypeAndExtension();

                // Reset stream position after detection
                imageStream.Position = 0;

                // If it's already JPEG, write directly
                if (mimeType == "image/jpeg")
                {
                    using var fileStream = File.Create(coverPath);
                    await imageStream.CopyToAsync(fileStream, token);
                    return true;
                }

                if (string.IsNullOrEmpty(mimeType))
                    return false;

                // For other formats, convert to JPEG using SkiaSharp (run in background thread)
                return await Task.Run(() => ConvertAndWriteToJpeg(imageStream, coverPath, jpegQuality), token);
            }
            catch (Exception)
            {
                // Silently fail and return false for any errors
                return false;
            }
        }

        /// <summary>
        /// Converts an image stream to JPEG format and writes it to the specified path using SkiaSharp.
        /// Supports conversion from PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC and other formats supported by SkiaSharp.
        /// </summary>
        /// <param name="imageStream">The source image stream</param>
        /// <param name="outputPath">The output file path</param>
        /// <param name="jpegQuality">JPEG quality (0-100)</param>
        /// <returns>True if conversion and write succeeded, false otherwise</returns>
        private static bool ConvertAndWriteToJpeg(Stream imageStream, string outputPath, int jpegQuality)
        {
            try
            {
                // Read stream into byte array for SkiaSharp
                byte[] imageBytes;
                using (var memoryStream = new MemoryStream())
                {
                    imageStream.CopyTo(memoryStream);
                    imageBytes = memoryStream.ToArray();
                }

                // Create SKData from byte array
                using var skData = SKData.CreateCopy(imageBytes);
                using var skImage = SKImage.FromEncodedData(skData);

                if (skImage == null)
                {
                    return false;
                }

                // Encode as JPEG with specified quality
                using var encodedData = skImage.Encode(SKEncodedImageFormat.Jpeg, jpegQuality);

                if (encodedData == null)
                {
                    return false;
                }

                // Write to file
                using var fileStream = File.Create(outputPath);
                encodedData.SaveTo(fileStream);

                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }
        public enum EncodeFormat
        {
            PNG = 0,
            WEBP = 1,
            AVIF = 2,
            JPEG = 3,

        }
        public static async Task<string?> AddExtensionImageAsync(this ThumbCacheService thumbs, string path, CancellationToken token = default)
        {
            if (string.IsNullOrEmpty(path))
            {
                return null;
            }
            string url = "ext://" + path;
            return await thumbs.AddUrlAsync(url, null, token).ConfigureAwait(false);
        }
        public static async Task<string?> AddStorageImageAsync(this ThumbCacheService thumbs, string path, CancellationToken token = default)
        {
            if (string.IsNullOrEmpty(path))
            {
                return null;
            }
            string url = "storage://" + path;
            return await thumbs.AddUrlAsync(url, null, token).ConfigureAwait(false);
        }

        private static bool CheckDirectSupport(string filename, List<string> supportedImageFormats)
        {
            if (supportedImageFormats == null) return false;

            string ext = Path.GetExtension(filename).ToLowerInvariant().Substring(1);
            return supportedImageFormats.Contains(ext);
        }
        /// <summary>
        /// Semaphore to limit concurrent image format conversions to 4.
        /// Some formats, such as JXL, are heavily threaded internally. 
        /// Combined with the UI requesting many images at once, this can exhaust
        /// system thread limits, especially in constrained environments like Docker.
        /// </summary>
        private static readonly SemaphoreSlim _imageConversionSemaphore = new SemaphoreSlim(4, 4);
        private static KeyedAsyncLock _locker = new KeyedAsyncLock();


        /// <inheritdoc/>
        public static async Task<string> CreateImageFileFormatIfNeeded(IImageFactory imageFactory, string filename, List<string>? supportedImageFormats = null, EncodeFormat format = EncodeFormat.JPEG, CancellationToken token = default)
        {
            if (CheckDirectSupport(filename, supportedImageFormats ?? [])) return filename;

            Match m = Regex.Match(Path.GetExtension(filename), HttpExtensions.NonUniversalFileImageExtensions, RegexOptions.IgnoreCase);
            if (!m.Success) return filename;

            string destination = Path.ChangeExtension(filename, format.GetExtension().Substring(1));

            if (File.Exists(destination))
            {
                return destination;
            }
            // Lock per destination to prevent duplicate work when the web UI triggers
            // multiple requests for the same image simultaneously. If another thread
            // is already processing the image, we wait for completion before checking
            // if the destination file exists.  

            using (var n = await _locker.LockAsync(destination).ConfigureAwait(false))
            {
                if (File.Exists(destination))
                {
                    // Destination already exist, the conversion was already made.
                    return destination;
                }
                // Wait for semaphore to limit concurrent image conversions 
                _imageConversionSemaphore.Wait();
                try
                {
                    // Double-check the file doesn't exist after acquiring semaphore
                    if (File.Exists(destination))
                    {
                        return destination;
                    }
                    using var sourceImage = imageFactory.Create(filename);
                    await sourceImage.SaveAsync(destination, format).ConfigureAwait(false);
                    try
                    {
                        File.Delete(filename);
                    }
                    catch  { /* Swallow Exception */ }
                }
                finally
                {
                    _imageConversionSemaphore.Release();
                }
            }
            return destination;
        }



    }
}
