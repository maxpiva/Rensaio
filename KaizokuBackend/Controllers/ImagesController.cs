using com.sun.xml.@internal.bind.v2.model.core;
using KaizokuBackend.Extensions;
using KaizokuBackend.Models;
using KaizokuBackend.Services.Downloads;
using KaizokuBackend.Services.Images;
using KaizokuBackend.Services.Images.Providers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.Extensions.Options;

namespace KaizokuBackend.Controllers
{
    [ApiController]
    [Route("api/image")]
    [Authorize]
    [Produces("image/png","image/jpeg","image/gif","image/bmp","image/tiff","image/webp","image/jxl","image/jp2","image/avif","image/heic")]
    public class ImagesController : ControllerBase
    {
        private readonly ThumbCacheService _thumbs;
        private readonly ILogger _logger;
        private static string naetag=null;
        // volatile ensures the double-checked lock is safe on ARM/aarch64 where the
        // memory model does not guarantee that a non-null reference implies a
        // fully-constructed object visible to other threads.
        private static volatile SemaphoreSlim? _gate;
        private static readonly object _gateLock = new object();

        public ImagesController(ILogger<ImagesController> logger, ThumbCacheService thumbs, IOptions<CacheOptions> cacheOptions)
        {
            _thumbs = thumbs;
            _logger = logger;
            if (_gate == null)
            {
                lock (_gateLock)
                {
                    if (_gate == null)
                    {
                        // Guard against zero/negative config values — SemaphoreSlim(0,0)
                        // would deadlock every caller permanently. Default to 12.
                        int concurrency = cacheOptions.Value.MaxImageConcurrency > 0
                            ? cacheOptions.Value.MaxImageConcurrency
                            : 12;
                        _gate = new SemaphoreSlim(concurrency, concurrency);
                    }
                }
            }
        }
        [HttpGet("{key?}")]
        [AllowAnonymous]
        [OutputCache(PolicyName = "images")]
        [ProducesResponseType(typeof(FileResult), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status304NotModified)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetImageAsync([FromRoute] string key, CancellationToken token)
        {
            try
            {
                string? etag = Request.GetETagFromRequest();
                if (string.IsNullOrWhiteSpace(key) || key == "unknown")
                {
                    if (etag != null && naetag != null && etag == naetag)
                    {
                        return StatusCode(StatusCodes.Status304NotModified);
                    }
                    Stream fs = FileSystemExtensions.StreamEmbeddedResource("na.jpg");
                    if (naetag == null)
                    {
                        naetag = await UrlImageProvider.ComputeMd5HashFromStreamAsync(fs, token).ConfigureAwait(false);
                        fs.Position = 0;
                    }
                    Response.AddETag(_thumbs.GetCacheDuration(), naetag);
                    return File(fs, "image/jpeg");
                }
                await _gate.WaitAsync(token).ConfigureAwait(false);
                try
                {
                    var result = await _thumbs.ProcessKeyAsync(key, etag ?? string.Empty, token).ConfigureAwait(false);
                    if (result.StatusCode == System.Net.HttpStatusCode.OK)
                    {
                        Response.AddETag(_thumbs.GetCacheDuration(), result.etag!);
                        return File(result.stream ?? new MemoryStream(), result.mimetype ?? "application/octet-stream");
                    }
                    return StatusCode((int)result.StatusCode);
                }
                finally
                {
                    _gate.Release();
                }
            }
            catch (OperationCanceledException)
            {
                // 499 Client Closed Request — the client disconnected; this is not a
                // server error and must not be logged at Error level.
                _logger.LogDebug("GetImageAsync cancelled (client closed connection) for key: {Key}", key);
                return StatusCode(499);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving image for key: {Key}", key);
                return StatusCode(StatusCodes.Status500InternalServerError, "An error occurred while retrieving the image.");
            }
        }
    }
}
