using System;
using System.Threading;
using System.Threading.Tasks;

namespace RensaioBackend.Services.Search
{
    /// <summary>
    /// Enforces a hard wall-clock timeout on calls into Mihon source extensions
    /// (search, details, chapters, ...).
    ///
    /// Source extensions run third-party Kotlin code (OkHttp + RxJava, sometimes Cloudflare/WebView
    /// or rate-limit interceptors). In headless/Docker environments those can block indefinitely and
    /// fail to honor OkHttp's own callTimeout. That is what makes the library import "freeze" on a
    /// single series for hours: one provider call never returns and nothing above it is bounded.
    ///
    /// <see cref="RunAsync{T}"/> guarantees the awaiting task never waits longer than the timeout,
    /// even if the underlying call subscribes synchronously and blocks its thread, by:
    ///   1. Offloading the call to the thread pool (a synchronous block can't pin the caller),
    ///   2. Racing it against a delay so a non-cancellable call is still abandoned on time, and
    ///   3. Cancelling a linked token so cooperatively-cancellable calls free their resources.
    /// A genuinely stuck call may leak its worker thread until the source's own timeout fires, but the
    /// import keeps moving. The caller's own <see cref="CancellationToken"/> still surfaces as a normal
    /// cancellation; an exceeded budget surfaces as a <see cref="TimeoutException"/>.
    /// </summary>
    public static class SourceTimeout
    {
        /// <summary>
        /// Default ceiling for a single source operation. Generous enough to cover a slow source or a
        /// Cloudflare solve (FlareSolverrTimeout is 60s) without letting a stuck call run forever.
        /// Matches OkHttp's own callTimeout (2 min) so a leaked worker thread is reaped at roughly the same time.
        /// </summary>
        public static readonly TimeSpan DefaultTimeout = TimeSpan.FromMinutes(2);

        public static async Task<T> RunAsync<T>(
            Func<CancellationToken, Task<T>> operation,
            TimeSpan timeout,
            CancellationToken token = default)
        {
            token.ThrowIfCancellationRequested();

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(token);
            timeoutCts.CancelAfter(timeout);
            var opToken = timeoutCts.Token;

            // Offload so a source that subscribes synchronously and blocks can't pin the caller.
            var opTask = Task.Run(() => operation(opToken), opToken);

            var finished = await Task.WhenAny(opTask, Task.Delay(timeout)).ConfigureAwait(false);
            if (finished != opTask)
            {
                // Wall-clock timeout: the call is stuck and not honoring cooperative cancellation.
                ObserveLater(opTask);
                token.ThrowIfCancellationRequested(); // a real outer cancellation propagates as cancellation
                throw new TimeoutException($"Source call did not complete within {timeout.TotalSeconds:0}s.");
            }

            try
            {
                return await opTask.ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (!token.IsCancellationRequested && timeoutCts.IsCancellationRequested)
            {
                // Cooperative cancellation fired because of our timeout, not the caller's token.
                throw new TimeoutException($"Source call did not complete within {timeout.TotalSeconds:0}s.");
            }
        }

        public static Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken token = default)
            => RunAsync(operation, DefaultTimeout, token);

        // Make sure an abandoned (timed-out) task's exception is eventually observed so it doesn't
        // surface as an UnobservedTaskException later.
        private static void ObserveLater(Task task)
            => _ = task.ContinueWith(
                static t => { _ = t.Exception; },
                CancellationToken.None,
                TaskContinuationOptions.OnlyOnFaulted,
                TaskScheduler.Default);
    }
}
