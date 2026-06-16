using System;
using System.Buffers;
using System.IO;
using Mihon.ExtensionsBridge.Models;
using okhttp3;


namespace Mihon.ExtensionsBridge.Core.Utilities
{
    public class ContentTypeStreamImplementation : ContentTypeStream
    {
        public override string ContentType { get; init; }

        public ContentTypeStreamImplementation(Response response)
            : base(ReadAllBytes(response))
        {
            ContentType = response?.header("Content-Type") ?? string.Empty;
            Position = 0;
        }

        private static byte[] ReadAllBytes(Response response)
        {
            if (response is null) throw new ArgumentNullException(nameof(response));
            var body = response.body() ?? throw new InvalidOperationException("Response body was null.");
            var input = body.byteStream() ?? throw new InvalidOperationException("Response body stream was null.");

            var buffer = ArrayPool<byte>.Shared.Rent(81920);
            try
            {
                using var ms = new MemoryStream();
                int read;
                while ((read = input.read(buffer, 0, buffer.Length)) > 0)
                {
                    ms.Write(buffer, 0, read);
                }
                return ms.ToArray();
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(buffer);
                // Always close upstream resources, even if a read throws midway; otherwise OkHttp
                // leaks the connection out of its pool (a slow drip that eventually exhausts memory).
                try { input.close(); } catch { /* ignore */ }
                try { body.close(); } catch { /* ignore */ }
                try { response.close(); } catch { /* ignore */ }
            }
        }
    }
}
